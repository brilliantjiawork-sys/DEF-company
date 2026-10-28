import { COMMON_ATTRIBUTION_FIELDS, proxyToAppsScript } from './_shared.js';

const ALLOWED_FIELDS = [
  'email', 'first_name', 'last_name', 'company', 'phone', 'country', 'zip_code', 'industry', 'message',
  'analytics_consent', 'form_entry', 'content_type', 'content_title', 'cta_label', ...COMMON_ATTRIBUTION_FIELDS
];

export async function onRequestPost({ request, env }) {
  return proxyToAppsScript({
    request,
    env,
    envKey: 'CONTACT_APPS_SCRIPT_URL',
    allowedFields: ALLOWED_FIELDS,
    requiredFields: [
      'email', 'first_name', 'last_name', 'company', 'phone', 'country', 'zip_code',
      'submission_id'
    ],
    analyticsRequiredFields: ['form_entry', 'cta_label', 'landing_page']
  });
}
