const UTM_FIELDS = [
  'first_utm_source', 'first_utm_medium', 'first_utm_campaign',
  'latest_utm_source', 'latest_utm_medium', 'latest_utm_campaign'
];

export const COMMON_ATTRIBUTION_FIELDS = [...UTM_FIELDS, 'submission_id'];

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function safeField(value, maxLength = 1000) {
  return String(value == null ? '' : value).trim().slice(0, maxLength);
}

export async function proxyToAppsScript({ request, env, envKey, allowedFields, requiredFields }) {
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'method_not_allowed' }, 405);
  }

  let incoming;
  try {
    incoming = await request.formData();
  } catch (_) {
    return jsonResponse({ ok: false, code: 'invalid_form_body' }, 400);
  }

  const limits = {
    email: 254, first_name: 100, last_name: 100, company: 200, phone: 80,
    country: 100, zip_code: 40, industry: 150, message: 5000,
    lead_source: 80, submission_id: 120,
    first_utm_source: 200, first_utm_medium: 200, first_utm_campaign: 200,
    latest_utm_source: 200, latest_utm_medium: 200, latest_utm_campaign: 200
  };
  const outgoing = new URLSearchParams();
  for (const field of allowedFields) {
    const raw = incoming.get(field);
    if (raw === null || typeof raw !== 'string') continue;
    const value = safeField(raw, limits[field] || 1000);
    if (value) outgoing.set(field, value);
  }

  const missing = requiredFields.filter((field) => !outgoing.get(field));
  if (missing.length) {
    return jsonResponse({ ok: false, code: 'missing_required_fields', fields: missing }, 400);
  }

  const endpoint = String(env[envKey] || '').trim();
  let endpointUrl;
  try { endpointUrl = new URL(endpoint); } catch (_) {}
  if (!endpointUrl || endpointUrl.protocol !== 'https:' || endpointUrl.hostname !== 'script.google.com' || !endpointUrl.pathname.includes('/macros/s/') || !endpointUrl.pathname.endsWith('/exec')) {
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
      return jsonResponse({ ok: false, code: 'upstream_write_failed' }, 502);
    }

    return jsonResponse({
      ok: true,
      created: result.created,
      duplicate: result.duplicate,
      submission_id: result.submission_id || outgoing.get('submission_id')
    });
  } catch (_) {
    return jsonResponse({ ok: false, code: 'upstream_unreachable' }, 502);
  }
}
