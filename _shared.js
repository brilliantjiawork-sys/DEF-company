const COMMON_ATTRIBUTION_FIELDS = [
  'first_utm_source', 'first_utm_medium', 'first_utm_campaign',
  'latest_utm_source', 'latest_utm_medium', 'latest_utm_campaign',
  'submission_id', 'form_id'
];

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function clean(value, max = 1000) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function readForm(request) {
  const form = await request.formData();
  const result = {};
  for (const [key, value] of form.entries()) {
    // This endpoint accepts text fields only; do not accept arbitrary files.
    if (typeof value === 'string') result[key] = value;
  }
  return result;
}

async function proxyToAppsScript({ request, env, envKey, allowedFields, requiredFields }) {
  const scriptUrl = clean(env[envKey], 2000);
  if (!scriptUrl || !/^https:\/\/script\.google\.com\/macros\/s\//i.test(scriptUrl)) {
    return jsonResponse({ ok: false, message: 'The form endpoint is not configured.' }, 503);
  }

  // Browser calls are same-origin. Reject cross-origin browser requests if an Origin header is present.
  const origin = request.headers.get('Origin');
  const requestOrigin = new URL(request.url).origin;
  if (origin && origin !== requestOrigin) {
    return jsonResponse({ ok: false, message: 'Cross-origin form submissions are not allowed.' }, 403);
  }

  let input;
  try { input = await readForm(request); }
  catch (_) { return jsonResponse({ ok: false, message: 'Invalid form request.' }, 400); }

  const payload = {};
  for (const key of allowedFields) payload[key] = clean(input[key], key === 'message' ? 5000 : 500);

  for (const field of requiredFields) {
    if (!payload[field]) return jsonResponse({ ok: false, message: 'Please complete all required fields.' }, 400);
  }
  if (!validEmail(payload.email)) return jsonResponse({ ok: false, message: 'Please enter a valid email address.' }, 400);
  if (!payload.submission_id || payload.submission_id.length > 120) {
    return jsonResponse({ ok: false, message: 'The submission ID is missing. Please try again.' }, 400);
  }

  const outgoing = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) outgoing.set(key, value);

  try {
    const upstream = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: outgoing.toString(),
      redirect: 'follow'
    });
    const text = await upstream.text();
    let result;
    try { result = JSON.parse(text); }
    catch (_) {
      // Do not treat a legacy plain-text "Success" as proof that this new idempotent flow is active.
      return jsonResponse({ ok: false, message: 'The spreadsheet endpoint did not return a verifiable JSON result. Check the deployed Apps Script version.' }, 502);
    }

    if (!upstream.ok || result.ok !== true) {
      return jsonResponse({ ok: false, message: 'The spreadsheet could not confirm the write. Please retry.' }, 502);
    }
    return jsonResponse({
      ok: true,
      created: result.created === true,
      duplicate: result.duplicate === true,
      submission_id: payload.submission_id
    }, 200);
  } catch (_) {
    return jsonResponse({ ok: false, message: 'The spreadsheet service could not be reached. Please retry.' }, 502);
  }
}

export { COMMON_ATTRIBUTION_FIELDS, jsonResponse, proxyToAppsScript };
