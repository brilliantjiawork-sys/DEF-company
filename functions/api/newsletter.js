import { COMMON_ATTRIBUTION_FIELDS, proxyToAppsScript } from './_shared.js';

const ALLOWED_FIELDS = ['email', ...COMMON_ATTRIBUTION_FIELDS];

export async function onRequestPost({ request, env }) {
  return proxyToAppsScript({
    request,
    env,
    envKey: 'NEWSLETTER_APPS_SCRIPT_URL',
    allowedFields: ALLOWED_FIELDS,
    requiredFields: ['email', 'landing_page', 'submission_id']
  });
}
