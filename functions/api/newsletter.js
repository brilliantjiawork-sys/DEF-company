import { COMMON_ATTRIBUTION_FIELDS, proxyToAppsScript } from './_shared.js';

const ALLOWED_FIELDS = ['email', 'analytics_consent', ...COMMON_ATTRIBUTION_FIELDS];

export async function onRequestPost({ request, env }) {
  return proxyToAppsScript({
    request,
    env,
    envKey: 'NEWSLETTER_APPS_SCRIPT_URL',
    allowedFields: ALLOWED_FIELDS,
    requiredFields: ['email', 'submission_id'],
    analyticsRequiredFields: ['landing_page']
  });
}
