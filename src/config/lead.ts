// AUTO-SYNCED public routing IDs.
export const leadConfig = {
  projectId: 'rooftero',
  formId: 'rooftero-lead',
  timeoutMs: 15000,
};

export function hasLeadService() {
  return Boolean(leadConfig.projectId && leadConfig.formId);
}
