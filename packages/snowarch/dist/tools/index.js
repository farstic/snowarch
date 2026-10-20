import { ServiceNowError } from '../utils/errors.js';
import { closeTool, refuseUndeclared } from './arguments.js';
import { assertIntegrity, assertLicensed } from '../licence/session.js';
// Core (existing 15 tools)
import { coreToolManifest, dispatchCoreAction } from './core.js';
// ITSM
import { incidentToolManifest, dispatchIncidentAction } from './incident.js';
import { problemToolManifest, dispatchProblemAction } from './problem.js';
import { changeToolManifest, dispatchChangeAction } from './change.js';
import { taskToolManifest, dispatchTaskAction } from './task.js';
// Service Management
import { knowledgeToolManifest, dispatchKnowledgeAction } from './knowledge.js';
import { catalogToolManifest, dispatchCatalogAction } from './catalog.js';
// User / Group
import { userToolManifest, dispatchUserAction } from './user.js';
// Reporting & Analytics
import { reportingToolManifest, dispatchReportingAction } from './reporting.js';
// ATF
import { atfToolManifest, dispatchAtfAction } from './atf.js';
// Now Assist / AI
import { nowAssistToolManifest, dispatchNowAssistAction } from './now-assist.js';
// Scripting
import { scriptToolManifest, dispatchScriptAction } from './script.js';
// Agile
import { agileToolManifest, dispatchAgileAction } from './agile.js';
// HR Service Delivery
import { hrsdToolManifest, dispatchHrsdAction } from './hrsd.js';
// Customer Service Management
import { csmToolManifest, dispatchCsmAction } from './csm.js';
// Security Operations & GRC
import { securityToolManifest, dispatchSecurityAction } from './security.js';
// Flow Designer & Process Automation
import { flowToolManifest, dispatchFlowAction } from './flow.js';
// Service Portal & UI Builder
import { portalToolManifest, dispatchPortalAction } from './portal.js';
// Integration (REST Messages, Transform Maps, Events)
import { integrationToolManifest, dispatchIntegrationAction } from './integration.js';
// Notifications, Email, Attachments
import { notificationToolManifest, dispatchNotificationAction } from './notification.js';
// Performance Analytics & Data Quality
import { performanceToolManifest, dispatchPerformanceAction } from './performance.js';
// System Properties
import { sysPropertiesToolManifest, dispatchSysPropertiesAction } from './sys-properties.js';
// Update Set management
import { updateSetToolManifest, dispatchUpdateSetAction } from './updateset.js';
// Virtual Agent authoring
import { vaToolManifest, dispatchVaAction } from './va.js';
// IT Asset Management
import { itamToolManifest, dispatchItamAction } from './itam.js';
// DevOps & pipeline tracking
import { devopsToolManifest, dispatchDevopsAction } from './devops.js';
// Scoped Application (App Studio)
import { appStudioToolManifest, dispatchAppStudioAction } from './app-studio.js';
// Machine Learning & Predictive Intelligence
import { mlToolManifest, dispatchMlAction } from './ml.js';
// Workspace & UI Builder
import { workspaceToolManifest, dispatchWorkspaceAction } from './workspace.js';
// Mobile
import { mobileToolManifest, dispatchMobileAction } from './mobile.js';
// Deployment & Artifacts
import { deploymentToolManifest, dispatchDeploymentAction } from './deployment.js';
// Fluent / GlideQuery / Batch API
import { fluentToolManifest, dispatchFluentAction } from './fluent.js';
// Now Assist Skills
import { nowAssistSkillsToolManifest, dispatchNowAssistSkillsAction } from './now-assist-skills.js';
// AI Agents & Agentic Workflows
import { aiAgentsToolManifest, dispatchAiAgentsAction } from './ai-agents.js';
// CMDB Reconciliation (duplicates, orphans, stale)
import { cmdbReconciliationToolManifest, dispatchCmdbReconciliationAction } from './cmdb-reconciliation.js';
// Orchestration (playbooks)
import { orchestrationToolManifest, dispatchOrchestrationAction } from './orchestration.js';
// Dynamic Schema Discovery
import { discoveryToolManifest, dispatchDiscoveryAction } from './discovery.js';
import { attachMandatoryNotes, attachWarnings, carryWarningsOnError, withWriteVerification } from '../servicenow/stored-values.js';
import { logger } from '../utils/logging.js';
// ─── Package Definitions ──────────────────────────────────────────────────────
export const ROLE_BUNDLE_MAP = {
    devops_engineer: [
        'snow_core_records_query', 'snow_core_record_read', 'snow_core_table_schema_read', 'snow_core_record_add', 'snow_core_record_modify', 'snow_core_record_remove',
        'snow_devops_devops_pipelines_index', 'snow_devops_devops_pipeline_read', 'snow_devops_deployments_index', 'snow_devops_deployment_read',
        'snow_devops_devops_change_add', 'snow_devops_deployment_track', 'snow_devops_devops_insights_read',
        'snow_us_update_set_add', 'snow_us_update_set_switch', 'snow_us_current_update_set_read', 'snow_us_update_sets_index',
        'snow_us_update_set_complete', 'snow_us_update_set_preview', 'snow_us_update_set_export', 'snow_us_active_update_set_ensure',
        'snow_chg_change_request_read', 'snow_chg_change_request_add', 'snow_chg_change_requests_index',
    ],
    itam_analyst: [
        'snow_core_records_query', 'snow_core_record_read',
        'snow_itam_assets_index', 'snow_itam_asset_read', 'snow_itam_asset_add', 'snow_itam_asset_modify', 'snow_itam_asset_retire',
        'snow_itam_software_licenses_index', 'snow_itam_license_compliance_read', 'snow_itam_asset_contracts_index',
        'snow_itam_asset_lifecycle_track', 'snow_itam_license_optimization_read',
    ],
    portal_developer: [
        'snow_core_records_query', 'snow_core_record_read', 'snow_core_table_schema_read', 'snow_core_record_add', 'snow_core_record_modify', 'snow_core_record_remove',
        'snow_portal_portals_index', 'snow_portal_portal_read', 'snow_portal_portal_add', 'snow_portal_portal_pages_index', 'snow_portal_portal_page_read', 'snow_portal_portal_page_add',
        'snow_portal_portal_widgets_index', 'snow_portal_portal_widget_read', 'snow_portal_portal_widget_add', 'snow_portal_portal_widget_modify',
        'snow_portal_widget_instances_index',
        'snow_portal_ux_apps_index', 'snow_portal_ux_app_read', 'snow_portal_ux_pages_index',
        'snow_portal_portal_themes_index', 'snow_portal_portal_theme_read',
        'snow_scr_ui_policies_index', 'snow_scr_ui_policy_read', 'snow_scr_ui_policy_add',
        'snow_scr_ui_actions_index', 'snow_scr_ui_action_read', 'snow_scr_ui_action_add', 'snow_scr_ui_action_modify',
        'snow_scr_client_scripts_index', 'snow_scr_client_script_read', 'snow_scr_client_script_add', 'snow_scr_client_script_modify',
        'snow_scr_changesets_index', 'snow_scr_changeset_read', 'snow_scr_changeset_commit', 'snow_scr_changeset_publish',
    ],
    integration_engineer: [
        'snow_core_records_query', 'snow_core_record_read', 'snow_core_table_schema_read', 'snow_core_record_add', 'snow_core_record_modify', 'snow_core_record_remove',
        'snow_intg_rest_messages_index', 'snow_intg_rest_message_read', 'snow_intg_rest_message_functions_index', 'snow_intg_rest_message_add',
        'snow_intg_transform_maps_index', 'snow_intg_transform_map_read', 'snow_intg_transform_map_exec', 'snow_intg_transform_field_maps_index',
        'snow_intg_import_sets_index', 'snow_intg_import_set_read', 'snow_intg_import_set_row_add', 'snow_intg_data_sources_index',
        'snow_intg_event_registry_index', 'snow_intg_event_registry_entry_read', 'snow_intg_event_register', 'snow_intg_event_fire', 'snow_intg_event_log_index',
        'snow_intg_oauth_applications_index', 'snow_intg_credential_aliases_index',
        'snow_scr_changesets_index', 'snow_scr_changeset_read', 'snow_scr_changeset_commit', 'snow_scr_changeset_publish',
    ],
    service_desk: [
        // Core read
        'snow_core_records_query', 'snow_core_record_read', 'snow_core_user_read', 'snow_core_group_read',
        // Incident full lifecycle
        'snow_inc_incident_add', 'snow_inc_incident_read', 'snow_inc_incident_modify', 'snow_inc_incident_resolve', 'snow_inc_incident_close', 'snow_inc_work_note_annotate', 'snow_inc_comment_annotate',
        // Approvals
        'snow_cat_my_approvals_read', 'snow_cat_request_approve', 'snow_cat_request_reject',
        // Knowledge read
        'snow_kb_knowledge_query', 'snow_kb_knowledge_article_read', 'snow_kb_knowledge_bases_index',
        // SLA
        'snow_cat_sla_details_read', 'snow_cat_active_slas_index',
        // Tasks
        'snow_tsk_task_read', 'snow_tsk_my_tasks_index', 'snow_tsk_task_complete',
        // Natural language
        'snow_core_natural_language_query',
    ],
    change_coordinator: [
        'snow_core_records_query', 'snow_core_record_read', 'snow_core_user_read', 'snow_core_group_read',
        'snow_chg_change_request_add', 'snow_chg_change_request_read', 'snow_chg_change_request_modify', 'snow_chg_change_requests_index', 'snow_chg_change_for_approval_submit', 'snow_chg_change_request_close',
        'snow_cat_my_approvals_read', 'snow_cat_request_approve', 'snow_cat_request_reject',
        'snow_prb_problem_read', 'snow_chg_change_requests_index',
        'snow_core_cmdb_ci_query', 'snow_core_cmdb_ci_read', 'snow_core_relationships_index',
        'snow_chg_cab_meeting_schedule',
    ],
    knowledge_author: [
        'snow_core_records_query', 'snow_core_record_read', 'snow_core_user_read',
        'snow_kb_knowledge_bases_index', 'snow_kb_knowledge_query', 'snow_kb_knowledge_article_read', 'snow_kb_knowledge_article_add', 'snow_kb_knowledge_article_modify', 'snow_kb_knowledge_article_publish',
        'snow_cat_catalog_items_index', 'snow_cat_catalog_query', 'snow_cat_catalog_item_read',
        'snow_kb_knowledge_article_retire',
    ],
    catalog_builder: [
        'snow_core_records_query', 'snow_core_record_read', 'snow_core_user_read',
        'snow_cat_catalog_items_index', 'snow_cat_catalog_query', 'snow_cat_catalog_item_read', 'snow_cat_catalog_item_add', 'snow_cat_catalog_item_modify', 'snow_cat_catalog_item_order',
        'snow_cat_approval_rule_add',
        'snow_usr_users_index', 'snow_usr_groups_index',
        'snow_cat_catalog_variable_add', 'snow_cat_catalog_ui_policy_add',
    ],
    system_administrator: [
        'snow_core_records_query', 'snow_core_record_read', 'snow_core_user_read', 'snow_core_group_read', 'snow_core_table_schema_read', 'snow_core_record_add', 'snow_core_record_modify', 'snow_core_record_remove',
        'snow_usr_users_index', 'snow_usr_user_add', 'snow_usr_user_modify', 'snow_usr_groups_index', 'snow_usr_group_add', 'snow_usr_group_modify', 'snow_usr_user_group_assign', 'snow_usr_user_group_unassign',
        'snow_rpt_reports_index', 'snow_rpt_report_read', 'snow_rpt_report_add', 'snow_rpt_report_modify', 'snow_rpt_aggregate_query_exec', 'snow_rpt_query_trend', 'snow_rpt_report_data_export', 'snow_rpt_sys_log_read',
        'snow_rpt_scheduled_jobs_index', 'snow_rpt_scheduled_job_read', 'snow_rpt_scheduled_job_add', 'snow_rpt_scheduled_job_modify', 'snow_rpt_scheduled_job_trigger', 'snow_rpt_job_run_history_index',
        'snow_scr_acls_index', 'snow_scr_acl_read', 'snow_scr_acl_add', 'snow_scr_acl_modify',
        'snow_ntf_notifications_index', 'snow_ntf_notification_read', 'snow_ntf_notification_add', 'snow_ntf_notification_modify',
        'snow_ntf_email_logs_index', 'snow_ntf_email_log_read',
        'snow_ntf_attachments_index', 'snow_ntf_attachment_metadata_read', 'snow_ntf_attachment_upload', 'snow_ntf_attachment_remove',
        'snow_perf_table_completeness_check', 'snow_perf_table_record_count_read', 'snow_perf_record_counts_compare',
        'snow_perf_pa_indicators_index', 'snow_perf_pa_indicator_read', 'snow_perf_pa_scorecard_read', 'snow_perf_pa_time_series_read',
        'snow_perf_pa_dashboards_index', 'snow_perf_pa_dashboard_read', 'snow_perf_dashboard_add', 'snow_perf_dashboard_modify',
        'snow_intg_oauth_applications_index', 'snow_intg_credential_aliases_index',
        'snow_cfg_system_property_read', 'snow_cfg_system_property_set', 'snow_cfg_system_properties_index', 'snow_cfg_system_properties_query',
        'snow_cfg_get_properties_bulk', 'snow_cfg_set_properties_bulk', 'snow_cfg_property_categories_index',
        'snow_us_current_update_set_read', 'snow_us_update_sets_index',
        'snow_us_update_set_add', 'snow_us_update_set_switch', 'snow_us_update_set_complete', 'snow_us_update_set_preview', 'snow_us_active_update_set_ensure',
        'snow_rpt_scheduled_report_add', 'snow_rpt_kpi_add',
        // v4.0 additions
        'snow_cmdb_duplicates_query', 'snow_cmdb_orphans_query', 'snow_cmdb_stale_query', 'snow_cmdb_reconcile',
        'snow_disco_table_discover',
    ],
    platform_developer: [
        'snow_core_records_query', 'snow_core_record_read', 'snow_core_table_schema_read', 'snow_core_record_add', 'snow_core_record_modify', 'snow_core_record_remove',
        'snow_studio_scoped_apps_index', 'snow_studio_scoped_app_read', 'snow_studio_scoped_app_add', 'snow_studio_scoped_app_modify',
        'snow_scr_business_rules_index', 'snow_scr_business_rule_read', 'snow_scr_business_rule_add', 'snow_scr_business_rule_modify',
        'snow_scr_script_includes_index', 'snow_scr_script_include_read', 'snow_scr_script_include_add', 'snow_scr_script_include_modify',
        'snow_scr_client_scripts_index', 'snow_scr_client_script_read', 'snow_scr_client_script_add', 'snow_scr_client_script_modify',
        'snow_scr_ui_policies_index', 'snow_scr_ui_policy_read', 'snow_scr_ui_policy_add',
        'snow_scr_ui_actions_index', 'snow_scr_ui_action_read', 'snow_scr_ui_action_add', 'snow_scr_ui_action_modify',
        'snow_scr_acls_index', 'snow_scr_acl_read', 'snow_scr_acl_add', 'snow_scr_acl_modify',
        'snow_scr_changesets_index', 'snow_scr_changeset_read', 'snow_scr_changeset_commit', 'snow_scr_changeset_publish',
        'snow_atf_atf_suites_index', 'snow_atf_atf_suite_read', 'snow_atf_atf_suite_exec', 'snow_atf_atf_tests_index', 'snow_atf_atf_test_read', 'snow_atf_atf_test_exec', 'snow_atf_atf_test_add', 'snow_atf_atf_step_add', 'snow_atf_atf_suite_result_read', 'snow_atf_atf_test_results_index', 'snow_atf_atf_failure_insight_read',
        'snow_fluent_query', 'snow_fluent_request_batch', 'snow_fluent_script_exec',
        // v4.0 Fluent SDK + discovery
        'snow_fluent_explain', 'snow_fluent_init', 'snow_fluent_build', 'snow_fluent_validate',
        'snow_disco_table_discover',
    ],
    itom_engineer: [
        'snow_core_records_query', 'snow_core_record_read', 'snow_core_table_schema_read',
        'snow_core_cmdb_ci_query', 'snow_core_cmdb_ci_read', 'snow_core_relationships_index', 'snow_core_health_dashboard_read', 'snow_core_service_mapping_summary_read',
        'snow_core_discovery_schedules_index', 'snow_core_mid_servers_index', 'snow_core_active_events_index',
        'snow_rpt_aggregate_query_exec', 'snow_rpt_query_trend',
        'snow_core_ci_relationship_add', 'snow_core_analysis_impact', 'snow_core_discovery_scan_exec',
        // v4.0 CMDB reconciliation
        'snow_cmdb_duplicates_query', 'snow_cmdb_orphans_query', 'snow_cmdb_stale_query', 'snow_cmdb_reconcile',
        'snow_disco_table_discover',
    ],
    agile_manager: [
        'snow_core_records_query', 'snow_core_record_read', 'snow_core_user_read',
        'snow_agile_story_add', 'snow_agile_story_modify', 'snow_agile_stories_index',
        'snow_agile_epic_add', 'snow_agile_epic_modify', 'snow_agile_epics_index',
        'snow_agile_scrum_task_add', 'snow_agile_scrum_task_modify', 'snow_agile_scrum_tasks_index',
        'snow_usr_users_index',
    ],
    ai_developer: [
        'snow_core_records_query', 'snow_core_record_read', 'snow_core_natural_language_query', 'snow_core_record_add', 'snow_core_record_modify', 'snow_core_record_remove',
        'snow_na_nlq_query', 'snow_na_ai_query', 'snow_na_summary_generate', 'snow_na_resolution_suggest', 'snow_na_incident_categorize',
        'snow_na_virtual_agent_topics_read', 'snow_na_agentic_playbook_trigger', 'snow_na_ms_copilot_topics_read', 'snow_na_work_notes_generate', 'snow_na_pi_models_read',
        'snow_kb_knowledge_query', 'snow_kb_knowledge_article_read',
        'snow_fluent_query', 'snow_fluent_request_batch', 'snow_fluent_script_exec',
        // v4.0 additions
        'snow_nas_now_assist_skill_add', 'snow_nas_now_assist_skills_index', 'snow_nas_now_assist_skill_read', 'snow_nas_now_assist_skill_test',
        'snow_ai_ai_agent_add', 'snow_ai_ai_agents_index', 'snow_ai_ai_agent_read', 'snow_ai_agentic_workflow_add',
        'snow_orch_playbook_add', 'snow_orch_playbook_exec', 'snow_orch_playbooks_index',
        'snow_ml_similar_incidents_query', 'snow_ml_auto_categorize',
        'snow_disco_table_discover',
    ],
};
// ─── All Tool Definitions ─────────────────────────────────────────────────────
const ALL_TOOLS = [
    ...coreToolManifest(),
    ...incidentToolManifest(),
    ...problemToolManifest(),
    ...changeToolManifest(),
    ...taskToolManifest(),
    ...knowledgeToolManifest(),
    ...catalogToolManifest(),
    ...userToolManifest(),
    ...reportingToolManifest(),
    ...atfToolManifest(),
    ...nowAssistToolManifest(),
    ...scriptToolManifest(),
    ...agileToolManifest(),
    ...hrsdToolManifest(),
    ...csmToolManifest(),
    ...securityToolManifest(),
    ...flowToolManifest(),
    ...portalToolManifest(),
    ...integrationToolManifest(),
    ...notificationToolManifest(),
    ...performanceToolManifest(),
    ...sysPropertiesToolManifest(),
    ...updateSetToolManifest(),
    ...vaToolManifest(),
    ...itamToolManifest(),
    ...devopsToolManifest(),
    ...appStudioToolManifest(),
    ...mlToolManifest(),
    ...workspaceToolManifest(),
    ...mobileToolManifest(),
    ...deploymentToolManifest(),
    ...fluentToolManifest(),
    ...nowAssistSkillsToolManifest(),
    ...aiAgentsToolManifest(),
    ...cmdbReconciliationToolManifest(),
    ...orchestrationToolManifest(),
    ...discoveryToolManifest(),
];
// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * The catalogue. Computed once at module load and returned as the SAME array every time.
 *
 * It used to append `schemaCache.getGeneratedTools()` — tools invented at runtime from a
 * discovered table's columns. That made `tools/list` answer differently depending on what had
 * been called earlier in the session: a client that cached the list held a stale one, and a
 * tool could appear that no contract, no test and no documentation had ever seen. The
 * contract (ARC-04-S06) cannot describe a catalogue that changes shape, so the catalogue does
 * not change shape. `snow_disco_table_discover` still discovers columns; it just returns them
 * as data instead of minting tools.
 */
/**
 * The role-bundle filter, exported as a pure function of (tools, package name).
 *
 * Separated from the constant below so the bundles can be tested without a test setting an
 * environment variable and calling `collectToolCatalog()` again — which is what the suite used
 * to do, and which now proves nothing, because re-reading the environment is exactly the
 * behaviour that was removed.
 */
export function selectPackage(all, packageName) {
    const key = (packageName || 'full').toLowerCase();
    if (key === 'full')
        return all;
    const allowed = ROLE_BUNDLE_MAP[key];
    if (!allowed) {
        console.error(`[WARN] Unknown MCP_TOOL_PACKAGE "${packageName}". Using "full".`);
        return all;
    }
    const allowedSet = new Set(allowed);
    return all.filter((t) => allowedSet.has(t.name));
}
// ARC-09-C121: every schema is advertised closed, and the router refuses what one does not declare.
const CLOSED_TOOLS = ALL_TOOLS.map(closeTool);
const TOOLS_BY_NAME = new Map(CLOSED_TOOLS.map((t) => [t.name, t]));
const CATALOGUE = selectPackage(CLOSED_TOOLS, process.env.MCP_TOOL_PACKAGE || 'full');
export function collectToolCatalog() {
    return CATALOGUE;
}
async function dispatchTool(client, name, args) {
    // Try each domain handler in order; first non-null result wins
    const handlers = [
        () => dispatchCoreAction(client, name, args),
        () => dispatchIncidentAction(client, name, args),
        () => dispatchProblemAction(client, name, args),
        () => dispatchChangeAction(client, name, args),
        () => dispatchTaskAction(client, name, args),
        () => dispatchKnowledgeAction(client, name, args),
        () => dispatchCatalogAction(client, name, args),
        () => dispatchUserAction(client, name, args),
        () => dispatchReportingAction(client, name, args),
        () => dispatchAtfAction(client, name, args),
        () => dispatchNowAssistAction(client, name, args),
        () => dispatchScriptAction(client, name, args),
        () => dispatchAgileAction(client, name, args),
        () => dispatchHrsdAction(client, name, args),
        () => dispatchCsmAction(client, name, args),
        () => dispatchSecurityAction(client, name, args),
        () => dispatchFlowAction(client, name, args),
        () => dispatchPortalAction(client, name, args),
        () => dispatchIntegrationAction(client, name, args),
        () => dispatchNotificationAction(client, name, args),
        () => dispatchPerformanceAction(client, name, args),
        () => dispatchSysPropertiesAction(client, name, args),
        () => dispatchUpdateSetAction(client, name, args),
        () => dispatchVaAction(client, name, args),
        () => dispatchItamAction(client, name, args),
        () => dispatchDevopsAction(client, name, args),
        () => dispatchAppStudioAction(client, name, args),
        () => dispatchMlAction(client, name, args),
        () => dispatchWorkspaceAction(client, name, args),
        () => dispatchMobileAction(client, name, args),
        () => dispatchDeploymentAction(client, name, args),
        () => dispatchFluentAction(client, name, args),
        () => dispatchNowAssistSkillsAction(client, name, args),
        () => dispatchAiAgentsAction(client, name, args),
        () => dispatchCmdbReconciliationAction(client, name, args),
        () => dispatchOrchestrationAction(client, name, args),
        () => dispatchDiscoveryAction(client, name, args),
    ];
    for (const handler of handlers) {
        const result = await handler();
        if (result !== null)
            return result;
    }
    throw new ServiceNowError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
}
/**
 * Every tool invocation passes through here, so this is where a write is checked against what the
 * platform STORED (ARC-09-C93, `src/servicenow/stored-values.ts`).
 *
 * The client is wrapped for this one invocation. The wrapper only RECORDS a cut it sees (no I/O), and
 * once the tool has returned — or thrown — `settle` reads the dictionary for the cut columns and the
 * warnings go onto the result as `warnings`, or onto the error of a tool that failed after it wrote.
 * A tool needs no edit for its writes to be covered (createRecord, updateRecord, the Batch API,
 * attachments, change requests, a `withUser` copy); what the wrapper cannot compare is listed in the
 * module header. The instance-free core
 * tools arrive with no client and are dispatched as they were. An invocation that arrives holding an
 * already wrapped client (an orchestration step) joins the outer one, which reports for all of them.
 */
export async function routeToolInvocation(client, name, args) {
    // ARC-11-C1, ruling R1, on every build (C6): no valid licence, no tool — the instance-free ones and a
    // playbook's steps included. First, so a refused session learns nothing about any tool's arguments.
    assertLicensed();
    // ARC-11-C141: second, so one refusal names one reason; a tree whose own files could not be restored runs no tool.
    assertIntegrity();
    // ARC-09-C121: before anything else, so an instance-free tool and a playbook's step are checked too.
    const tool = TOOLS_BY_NAME.get(name);
    if (tool)
        refuseUndeclared(tool, args);
    if (!client)
        return dispatchTool(client, name, args);
    const verified = withWriteVerification(client);
    // A check on a write that succeeded must never replace the result, or the real error, with its own.
    const settled = async () => {
        try {
            return await verified.settle();
        }
        catch (e) {
            logger.warn(`${name}: stored-value check failed: ${e instanceof Error ? e.message : String(e)}`);
            return [];
        }
    };
    let result;
    try {
        result = await dispatchTool(verified.client, name, args);
    }
    catch (error) {
        if (verified.owner)
            carryWarningsOnError(error, await settled());
        throw error;
    }
    return verified.owner ? attachMandatoryNotes(attachWarnings(result, await settled()), verified.notes()) : result;
}
