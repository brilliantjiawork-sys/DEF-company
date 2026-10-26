// DEF Company configuration: Consent Mode v2 and public same-origin API routes.
// Keep this file before the GTM snippet in index.html.

window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }

const CONSENT_KEY = 'def_cookie_consent_v1';
const CONSENT_DAYS = 180;

function consentToGtag(choice) {
    const analytics = choice && choice.analytics === true ? 'granted' : 'denied';
    const marketing = choice && choice.marketing === true ? 'granted' : 'denied';
    return {
        analytics_storage: analytics,
        ad_storage: marketing,
        ad_user_data: marketing,
        ad_personalization: marketing
    };
}

function readConsent() {
    try {
        const saved = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null');
        if (!saved || typeof saved.savedAt !== 'number') return null;
        if (Date.now() - saved.savedAt > CONSENT_DAYS * 86400000) {
            localStorage.removeItem(CONSENT_KEY);
            return null;
        }
        return saved;
    } catch (_) {
        return null;
    }
}

// Default denied before GTM can process any tags.
gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500
});

const savedConsent = readConsent();
if (savedConsent) {
    gtag('consent', 'update', consentToGtag(savedConsent));
}

// API requests go to same-origin Cloudflare Pages Functions, which proxy securely server-side.
// Apps Script URLs are configured as Cloudflare Pages environment variables, not exposed here.
const SITE_CONFIG = {
    gtmId: 'GTM-P6HXR6VF',
    contactEndpoint: '/api/contact',
    newsletterEndpoint: '/api/newsletter'
};
