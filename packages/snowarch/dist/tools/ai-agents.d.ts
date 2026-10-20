/**
 * ARC-09-C165 — AI Agent Studio: agents and agentic workflows, in the platform's own tables.
 *
 * The table inventory is documented (vendor/ServiceNowDocs markdown/intelligent-experiences/na-aia-reference.md,
 * the AI Agent Studio tables): an agent is `sn_aia_agent`, its configuration `sn_aia_agent_config`, a tool
 * `sn_aia_tool`, an agent's tool `sn_aia_agent_tool_m2m`; an agentic workflow is `sn_aia_usecase`, and its agents are
 * `sn_aia_team_member` rows of an `sn_aia_team`. Until this row these tools wrote `sys_ai_agent`,
 * `sys_ai_agentic_workflow` and two `sys_security_acl` rows conditioned on the first — tables a current instance does
 * not have.
 *
 * What the owner's live trial observed, and the bundled corpus does not say (docs/PLATFORM-NOTES.md PN-17): an insert
 * into `sn_aia_agent` creates the agent's configuration (active) and a version by itself; an insert into
 * `sn_aia_usecase` creates a version and no team. So these tools READ BACK the configuration and the version, and
 * report them; they never create or assert them. Nothing here creates access control: the result says so, and where
 * it is configured.
 *
 * The composite-write conventions of the ATF authoring tools (ARC-09-C95): every check is a read made before the first
 * write, and a refusal says "Nothing was written."; every record is read back after its write, and a difference is a
 * warning; a failure after the first record rethrows naming the step it stopped at and every record created
 * (ARC-09-C174), and nothing is deleted — a delete is a write that needs its own approval.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type { ToolDefinition } from './types.js';
export declare function aiAgentsToolManifest(): ToolDefinition[];
export declare function dispatchAiAgentsAction(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any>;
