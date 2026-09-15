// Public, build-time configuration only. Never put credentials in PUBLIC_* values.
export const leadConfig = {
  mode: import.meta.env.PUBLIC_LEAD_MODE === 'live' ? 'live' : 'demo',
  projectId: (import.meta.env.PUBLIC_LEAD_PROJECT_ID || '').trim(),
  formId: (import.meta.env.PUBLIC_LEAD_FORM_ID || '').trim(),
  timeoutMs: 15000,
};

// Fail closed: a live integration must be explicitly selected and customer configured.
export function hasLiveLeadService() {
  return leadConfig.mode === 'live' && Boolean(leadConfig.projectId && leadConfig.formId);
}
