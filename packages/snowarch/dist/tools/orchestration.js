import { ServiceNowError } from '../utils/errors.js';
import { requireNowAssist, requireWrite } from '../utils/permissions.js';
import { beginStep } from '../servicenow/stored-values.js';
export function orchestrationToolManifest() {
    return [
        {
            name: 'snow_orch_playbook_add',
            description: 'Create a playbook definition with ordered steps that chain tool calls (requires NOW_ASSIST_ENABLED + WRITE_ENABLED)',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Playbook name' },
                    description: { type: 'string', description: 'Playbook description' },
                    steps: {
                        type: 'array',
                        description: 'Ordered list of playbook steps',
                        items: {
                            type: 'object',
                            properties: {
                                tool_name: { type: 'string', description: 'Name of the tool to invoke' },
                                args_template: { type: 'object', description: 'Arguments template — can reference {{context.key}} or {{steps[N].result.key}}' },
                                condition: { type: 'string', description: 'Optional JS-like condition expression. Step runs only when truthy.' },
                                on_error: { type: 'string', enum: ['stop', 'skip', 'continue'], description: 'Error handling: stop (default), skip this step, or continue to next' },
                            },
                            required: ['tool_name', 'args_template'],
                        },
                    },
                },
                required: ['name', 'description', 'steps'],
            },
            gate: 'now_assist',
            mutates: true,
            alsoRequires: 'write',
        },
        {
            name: 'snow_orch_playbook_exec',
            description: 'Execute a playbook step by step, passing results forward through context (requires NOW_ASSIST_ENABLED). Supports dry_run. '
                + 'A step whose writes stored a cut value, or whose result carries a warning, shows it on the step (`warnings`, tagged with the step) '
                + 'and on the playbook result; under on_error "stop" (the default) the playbook halts there and says so in halted_at_step / halt_reason.',
            inputSchema: {
                type: 'object',
                properties: {
                    playbook: {
                        type: 'object',
                        description: 'Playbook object with name, description, and steps array',
                        properties: {
                            name: { type: 'string' },
                            description: { type: 'string' },
                            steps: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        tool_name: { type: 'string' },
                                        args_template: { type: 'object' },
                                        condition: { type: 'string' },
                                        on_error: {
                                            type: 'string', enum: ['stop', 'skip', 'continue'],
                                            description: '"stop" (the default) ends the playbook after a step that fails or that returns a warning, '
                                                + 'such as a write that stored a cut value; "skip" and "continue" go on to the next step.',
                                        },
                                    },
                                    required: ['tool_name', 'args_template'],
                                },
                            },
                        },
                        required: ['steps'],
                    },
                    context: { type: 'object', description: 'Initial context key-value pairs available to all steps' },
                    dry_run: { type: 'boolean', description: 'Preview execution plan without invoking tools (default true)' },
                },
                required: ['playbook'],
            },
            gate: 'now_assist',
            mutates: true,
        },
        {
            name: 'snow_orch_playbooks_index',
            description: 'List stored playbook definitions from sys_hub_action_type_definition',
            inputSchema: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: 'Max records to return (default 25)' },
                },
                required: [],
            },
            gate: 'none',
            mutates: false,
        },
    ];
}
const ORCHESTRATION_TOOL_NAMES = new Set([
    'snow_orch_playbook_add', 'snow_orch_playbook_exec', 'snow_orch_playbooks_index',
]);
/**
 * Resolve template references like {{context.foo}} and {{steps[0].result.bar}}
 * in argument values against the current execution state.
 */
function resolveTemplate(value, context, stepResults) {
    if (typeof value === 'string') {
        return value.replace(/\{\{(.*?)\}\}/g, (_match, expr) => {
            const trimmed = expr.trim();
            // Handle context.key references
            if (trimmed.startsWith('context.')) {
                const path = trimmed.slice('context.'.length);
                return resolvePathValue(context, path) ?? '';
            }
            // Handle steps[N].result.key references
            const stepMatch = trimmed.match(/^steps\[(\d+)\]\.result\.(.+)$/);
            if (stepMatch) {
                const stepIdx = parseInt(stepMatch[1], 10);
                const path = stepMatch[2];
                const stepResult = stepResults[stepIdx];
                if (stepResult?.result) {
                    return resolvePathValue(stepResult.result, path) ?? '';
                }
                return '';
            }
            return '';
        });
    }
    if (Array.isArray(value)) {
        return value.map(item => resolveTemplate(item, context, stepResults));
    }
    if (value !== null && typeof value === 'object') {
        const resolved = {};
        for (const [k, v] of Object.entries(value)) {
            resolved[k] = resolveTemplate(v, context, stepResults);
        }
        return resolved;
    }
    return value;
}
/** Resolve a dot-separated path against an object */
function resolvePathValue(obj, path) {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
        if (current === null || current === undefined)
            return undefined;
        current = current[part];
    }
    return current;
}
/**
 * Evaluate a simple condition string against context and step results.
 * Supports basic expressions like "context.count > 0" or "steps[0].result.success == true".
 */
function evaluateCondition(condition, context, stepResults) {
    if (!condition || condition.trim() === '')
        return true;
    // Resolve all template references in the condition first
    const resolved = resolveTemplate(condition, context, stepResults);
    // Simple truthy evaluation after template resolution
    // Support basic comparisons: ==, !=, >, <, >=, <=
    const comparisonMatch = String(resolved).match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
    if (comparisonMatch) {
        const [, leftStr, op, rightStr] = comparisonMatch;
        const left = parseConditionValue(leftStr.trim());
        const right = parseConditionValue(rightStr.trim());
        switch (op) {
            case '==': return left == right;
            case '!=': return left != right;
            case '>': return Number(left) > Number(right);
            case '<': return Number(left) < Number(right);
            case '>=': return Number(left) >= Number(right);
            case '<=': return Number(left) <= Number(right);
        }
    }
    // Default: truthy check on the resolved string
    const val = String(resolved).trim().toLowerCase();
    return val !== '' && val !== 'false' && val !== '0' && val !== 'null' && val !== 'undefined';
}
function parseConditionValue(val) {
    if (val === 'true')
        return true;
    if (val === 'false')
        return false;
    if (val === 'null' || val === 'undefined')
        return '';
    // Remove surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        return val.slice(1, -1);
    }
    const num = Number(val);
    if (!isNaN(num) && val !== '')
        return num;
    return val;
}
export async function dispatchOrchestrationAction(client, name, args) {
    if (!ORCHESTRATION_TOOL_NAMES.has(name))
        return null;
    switch (name) {
        case 'snow_orch_playbook_add': {
            requireNowAssist();
            requireWrite();
            if (!args.name)
                throw new ServiceNowError('name is required', 'INVALID_REQUEST');
            if (!args.description)
                throw new ServiceNowError('description is required', 'INVALID_REQUEST');
            if (!args.steps || !Array.isArray(args.steps) || args.steps.length === 0) {
                throw new ServiceNowError('steps must be a non-empty array', 'INVALID_REQUEST');
            }
            // Validate each step has required fields
            for (let i = 0; i < args.steps.length; i++) {
                const step = args.steps[i];
                if (!step.tool_name)
                    throw new ServiceNowError(`steps[${i}].tool_name is required`, 'INVALID_REQUEST');
                if (!step.args_template || typeof step.args_template !== 'object') {
                    throw new ServiceNowError(`steps[${i}].args_template must be an object`, 'INVALID_REQUEST');
                }
            }
            // Attempt to store as a record; fall back to returning the definition
            try {
                const record = await client.createRecord('sys_hub_action_type_definition', {
                    name: args.name,
                    description: args.description,
                    definition: JSON.stringify({
                        steps: args.steps,
                        version: '1.0',
                        created_by: 'snowarch',
                    }),
                    active: true,
                });
                return { message: 'Playbook created', playbook: record };
            }
            catch {
                // Table may not exist — return the definition for manual creation
                return {
                    message: 'Playbook definition generated (table sys_hub_action_type_definition may not be available). Use this definition for manual creation.',
                    definition: {
                        name: args.name,
                        description: args.description,
                        steps: args.steps,
                        version: '1.0',
                    },
                };
            }
        }
        case 'snow_orch_playbook_exec': {
            requireNowAssist();
            if (!args.playbook || !args.playbook.steps || !Array.isArray(args.playbook.steps)) {
                throw new ServiceNowError('playbook with steps array is required', 'INVALID_REQUEST');
            }
            const steps = args.playbook.steps;
            const context = args.context || {};
            const dryRun = args.dry_run !== false;
            const stepResults = [];
            let halted;
            // Dynamically import routeToolInvocation for live execution
            let routeToolInvocation;
            if (!dryRun) {
                const toolIndex = await import('./index.js');
                routeToolInvocation = toolIndex.routeToolInvocation;
            }
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                const onError = step.on_error || 'stop';
                // Evaluate condition
                if (step.condition) {
                    const conditionMet = evaluateCondition(step.condition, context, stepResults);
                    if (!conditionMet) {
                        stepResults.push({
                            step_index: i,
                            tool_name: step.tool_name,
                            status: 'skipped',
                            result: null,
                            error: `Condition not met: ${step.condition}`,
                        });
                        continue;
                    }
                }
                // Resolve args template
                const resolvedArgs = resolveTemplate(step.args_template, context, stepResults);
                if (dryRun) {
                    stepResults.push({
                        step_index: i,
                        tool_name: step.tool_name,
                        status: 'dry_run',
                        result: { resolved_args: resolvedArgs },
                    });
                    continue;
                }
                // Execute the step. `beginStep` marks where this step's writes start, so a cut value is
                // attributed to the step that stored it rather than arriving on the playbook with no owner.
                const scope = beginStep(client);
                const startTime = Date.now();
                let result;
                let failure;
                let failed = false;
                try {
                    result = await routeToolInvocation(client, step.tool_name, resolvedArgs);
                }
                catch (err) {
                    failed = true;
                    failure = err;
                }
                // Whether the step returned or threw: a tool that wrote and then failed has still written.
                const cuts = scope ? await scope.end({ step: i, tool: step.tool_name }) : [];
                const withCuts = cuts.length > 0 ? { warnings: cuts } : {};
                if (failed) {
                    stepResults.push({
                        step_index: i,
                        tool_name: step.tool_name,
                        status: 'error',
                        error: failure instanceof ServiceNowError ? failure.message : String(failure),
                        ...withCuts,
                        duration_ms: Date.now() - startTime,
                    });
                    if (onError === 'stop') {
                        break;
                    }
                    // 'skip' and 'continue' both move to the next step
                    continue;
                }
                stepResults.push({
                    step_index: i,
                    tool_name: step.tool_name,
                    status: 'executed',
                    result,
                    ...withCuts,
                    duration_ms: Date.now() - startTime,
                });
                // `stop` means "do not go on past a step that did not do what was asked". A write that stored
                // less than it was sent did not, the playbook cannot take it back, and the next step usually
                // builds on the record that was just written. A warning the tool put on its own result counts
                // the same way. `continue` and `skip` go on, with the warning on the step.
                const ownWarnings = Array.isArray(result?.warnings) ? result.warnings.length : 0;
                if (onError === 'stop' && (cuts.length > 0 || ownWarnings > 0)) {
                    halted = {
                        step: i,
                        reason: `Step ${i} (${step.tool_name}) ${cuts.length > 0 ? 'stored a cut value' : 'returned a warning'}; `
                            + 'on_error "stop" does not run the steps after it. Set on_error to "continue" for a step whose warning is acceptable.',
                    };
                    break;
                }
            }
            return {
                playbook_name: args.playbook.name || 'unnamed',
                dry_run: dryRun,
                total_steps: steps.length,
                executed: stepResults.filter(s => s.status === 'executed').length,
                skipped: stepResults.filter(s => s.status === 'skipped').length,
                errors: stepResults.filter(s => s.status === 'error').length,
                ...(halted ? { halted_at_step: halted.step, halt_reason: halted.reason } : {}),
                steps: stepResults,
            };
        }
        case 'snow_orch_playbooks_index': {
            const limit = args.limit || 25;
            const resp = await client.queryRecords({
                table: 'sys_hub_action_type_definition',
                query: 'active=true',
                limit,
                fields: 'sys_id,name,description,active,sys_updated_on',
            });
            return { count: resp.count, playbooks: resp.records };
        }
        default:
            return null;
    }
}
