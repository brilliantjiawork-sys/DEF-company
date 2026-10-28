const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
export const COMMON_ATTRIBUTION_FIELDS = [...UTM_FIELDS, 'landing_page', 'submission_id'];
const ATTRIBUTION_ONLY_FIELDS = ['landing_page', 'form_entry', 'content_type', 'content_title', 'cta_label', ...UTM_FIELDS];

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function safeField(value, maxLength = 1000) {
  return String(value == null ? '' : value).trim().slice(0, maxLength);
}

export async function proxyToAppsScript({ request, env, envKey, allowedFields, requiredFields, analyticsRequiredFields = [] }) {
  if (request.method !== 'POST') return jsonResponse({ ok: false, code: 'method_not_allowed' }, 405);

  let incoming;
  try { incoming = await request.formData(); }
  catch (_) { return jsonResponse({ ok: false, code: 'invalid_form_body' }, 400); }

  const limits = {
    email: 254, first_name: 120, last_name: 120, company: 250, phone: 100,
    country: 120, zip_code: 40, industry: 150, message: 5000,
    form_entry: 40, content_type: 80, content_title: 300, cta_label: 200,
    landing_page: 1500, submission_id: 120, analytics_consent: 10,
    utm_source: 200, utm_medium: 200, utm_campaign: 200, utm_content: 200
  };

  const outgoing = new URLSearchParams();
  const analyticsConsent = incoming.get('analytics_consent') === 'true';
  for (const field of allowedFields) {
    const raw = incoming.get(field);
    if (raw === null || typeof raw !== 'string') continue;
    outgoing.set(field, safeField(raw, limits[field] || 1000));
  }

  // Enforce the user's explicit Analytics choice at the server boundary too.
  // Marketing consent controls advertising tags; it does not decide whether a form is saved.
  if (!analyticsConsent) {
    for (const field of ATTRIBUTION_ONLY_FIELDS) {
      if (allowedFields.includes(field)) outgoing.set(field, '');
    }
  }
  outgoing.set('analytics_consent', analyticsConsent ? 'true' : 'false');

  const missing = requiredFields.filter(field => !outgoing.get(field));
  if (missing.length) return jsonResponse({ ok: false, code: 'missing_required_fields', fields: missing }, 400);

  if (analyticsConsent) {
    const missingAnalytics = analyticsRequiredFields.filter(field => !outgoing.get(field));
    if (missingAnalytics.length) {
      return jsonResponse({ ok: false, code: 'missing_attribution_fields', fields: missingAnalytics }, 400);
    }
  }

  const endpoint = String(env[envKey] || '').trim();
  let endpointUrl;
  try { endpointUrl = new URL(endpoint); } catch (_) {}
  if (!endpointUrl || endpointUrl.protocol !== 'https:' || endpointUrl.hostname !== 'script.google.com' ||
      !endpointUrl.pathname.includes('/macros/s/') || !endpointUrl.pathname.endsWith('/exec')) {
    return jsonResponse({ ok: false, code: 'backend_not_configured' }, 500);
  }

  try {
    const upstream = await fetch(endpointUrl.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'accept': 'application/json' },
      body: outgoing.toString(),
      redirect: 'follow'
    });
    const raw = await upstream.text();
    let result;
    try { result = JSON.parse(raw); } catch (_) { result = null; }

    if (!upstream.ok || !result || result.ok !== true) {
      return jsonResponse({ ok: false, code: result && result.code ? result.code : 'upstream_write_failed', message: result && result.message ? result.message : 'The form could not be saved.' }, 502);
    }

    // The internal retry key is not returned to the browser and is never written as a Sheet column.
    return jsonResponse({ ok: true, created: result.created !== false, duplicate: result.duplicate === true });
  } catch (_) {
    return jsonResponse({ ok: false, code: 'upstream_unreachable', message: 'The form could not be saved. Please try again.' }, 502);
  }
}
