import { leadConfig, hasLiveLeadService } from '../config/lead';
import { site } from '../config/site';
import { resolveRuntimeMount } from '../utils/runtime-mount.mjs';

export function connectLeadForm(form: HTMLFormElement) {
  if (form.dataset.leadConnected) return;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const status = form.querySelector<HTMLElement>('.form-status');
  if (!button || !status) return;
  form.dataset.leadConnected = 'true';
  const connectedAt = performance.now();
  let submitting = false;
  let submitted = false;

  // Keep native email/ZIP constraints, and allow common phone formatting.
  const validate = () => {
    for (const input of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')) {
      input.setCustomValidity('');
      if (input.required && !input.value.trim()) {
        input.setCustomValidity('Please complete this field.');
      } else if (input.name === 'phone' && input.value) {
        const digits = input.value.replace(/\D/g, '');
        if (!/^[+\d\s().-]+$/.test(input.value) || digits.length < 7 || digits.length > 15) {
          input.setCustomValidity('Please enter a valid phone number.');
        }
      }
    }
  };
  form.addEventListener('input', validate);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting || submitted) return;
    validate();
    if (!form.checkValidity()) {
      form.reportValidity();
      status.textContent = 'Please complete the required fields.';
      return;
    }

    if (!hasLiveLeadService()) {
      status.textContent = leadConfig.mode === 'demo'
        ? 'Demo only. Your request was not sent.'
        : 'Online requests are not configured. Please call us.';
      return;
    }

    // Capture the submission's mount once, including across the delayed redirect.
    const mountBase = resolveRuntimeMount(window.location.pathname);
    const data = new FormData(form);
    // Read every successful named control; preserve repeated names as arrays.
    const fields: Record<string, FormDataEntryValue | FormDataEntryValue[]> = Object.create(null);
    for (const key of new Set(data.keys())) {
      if (key === 'website') continue;
      const values = data.getAll(key);
      fields[key] = values.length === 1 ? values[0] : values;
    }
    const params = new URLSearchParams(window.location.search);
    const submitElapsedMs = Math.round(performance.now() - connectedAt);
    const honeypot = String(data.get('website') || '');
    const metadata = {
      page_url: window.location.href,
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
      utm_term: params.get('utm_term') || '',
      utm_content: params.get('utm_content') || '',
      referrer: document.referrer,
      submit_elapsed_ms: submitElapsedMs,
    };
    const payload = {
      project_id: leadConfig.projectId,
      form_id: leadConfig.formId,
      fields,
      metadata,
      submit_elapsed_ms: submitElapsedMs,
      honeypot,
      // Retain the existing aliases for consumers of the original payload.
      meta: metadata,
      website: honeypot,
    };
    const originalText = button.textContent;
    submitting = true;
    button.disabled = true;
    button.textContent = 'Sending…';
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Sending your request…';
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), leadConfig.timeoutMs);
    try {
      // Never automatically retry: a lost response may still represent an accepted lead.
      const response = await fetch(`${mountBase}api/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
        credentials: 'omit',
        mode: 'same-origin',
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Submission failed');
      const result = await response.json();
      if (result?.success !== true) throw new Error('Submission failed');
      submitted = true;
      const name = String(fields.name || '').trim().split(' ')[0] || 'there';
      status.textContent = `Thanks, ${name}! A ${site.name} roofing specialist will call you shortly.`;
      form.reset();
      form.dispatchEvent(new CustomEvent('rooflume:lead-submitted', { detail: fields, bubbles: true }));

      window.setTimeout(() => {
        window.location.href = `${mountBase}thank-you/`;
      }, 800);
    } catch {
      status.textContent = "We couldn't send your request. Please try again.";
    } finally {
      window.clearTimeout(timeout);
      submitting = false;
      button.disabled = submitted;
      button.textContent = originalText;
      form.removeAttribute('aria-busy');
    }
  });
}
