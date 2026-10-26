import { COMMON_ATTRIBUTION_FIELDS, proxyToAppsScript } from './_shared.js';

const ALLOWED_FIELDS = [
  'email', 'first_name', 'last_name', 'company', 'phone', 'country',
  'industry', 'message', 'form_type', ...COMMON_ATTRIBUTION_FIELDS
];

export async function onRequestPost({ request, env }) {
  return proxyToAppsScript({
    request,
    env,
    envKey: 'CONTACT_APPS_SCRIPT_URL',
    allowedFields: ALLOWED_FIELDS,
    requiredFields: [
      'email', 'first_name', 'last_name', 'company', 'phone', 'country', 'form_type'
    ]
  });
}
