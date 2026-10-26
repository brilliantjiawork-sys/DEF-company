// DEF Company website behavior, UTM attribution, forms, Stories and Events.
// Business form submissions work even when analytics consent is denied.

const DEF_ATTRIBUTION_STORAGE_KEY = 'def_marketing_attribution_v3';
const DEF_ATTRIBUTION_TTL_MS = 30 * 60 * 1000;
const DEF_UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];

let currentLeadSource = 'contact_sales';
let storiesData = [];
let eventsData = [];

// ---------- Utility helpers ----------
function defHasAnalyticsConsent() {
    try {
        const choice = typeof readConsent === 'function' ? readConsent() : null;
        return Boolean(choice && choice.analytics === true);
    } catch (_) {
        return false;
    }
}

function defSafeText(value, maxLength = 500) {
    if (value === null || value === undefined) return '';
    return String(value).trim().slice(0, maxLength);
}

function defParseLocalDate(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const text = String(value).trim();
    // Parse ISO date-only values as local dates to avoid a timezone shifting the day.
    const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
        const result = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
        return Number.isNaN(result.getTime()) ? null : result;
    }
    const result = new Date(text);
    return Number.isNaN(result.getTime()) ? null : result;
}

function fmtDate(value) {
    const dt = defParseLocalDate(value);
    if (!dt) return '';
    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function defGetImageUrl(value, fallback = '') {
    const raw = defSafeText(value, 1200);
    if (!raw) return fallback;
    if (/^https:\/\//i.test(raw)) return raw;
    if (/^http:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return '';
    if (raw.startsWith('/')) return raw;
    if (raw.startsWith('images/')) return '/' + raw;
    // CMS images are configured to live in /images; normalize simple relative paths.
    return '/images/' + raw.replace(/^\.\//, '').replace(/^\/+/, '');
}

function defElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
}

function defShowMessage(container, message) {
    if (!container) return;
    container.replaceChildren(defElement('p', 'content-status-message', message));
}

function defCurrentLandingPage() {
    return window.location.origin + window.location.pathname;
}

function defClearStoredAttribution() {
    // Clear the old long-lived keys that could carry a stale source such as ChatGPT.
    try { localStorage.removeItem('def_utm_attribution_v1'); } catch (_) {}
    try { localStorage.removeItem('def_campaign_attribution_v1'); } catch (_) {}
    try { sessionStorage.removeItem('def_utm_attribution_v1'); } catch (_) {}
    try { sessionStorage.removeItem('def_campaign_attribution_v1'); } catch (_) {}
    try { sessionStorage.removeItem(DEF_ATTRIBUTION_STORAGE_KEY); } catch (_) {}
}

function defReadUtmFromCurrentUrl() {
    try {
        const params = new URL(window.location.href).searchParams;
        const values = {};
        for (const key of DEF_UTM_KEYS) {
            values[key] = defSafeText(params.get(key), 200);
        }
        // Only treat a URL as a marked campaign link if the link explicitly supplies utm_source.
        if (!values.utm_source) return null;
        values.landing_page = defCurrentLandingPage();
        values.capturedAt = Date.now();
        values.expiresAt = values.capturedAt + DEF_ATTRIBUTION_TTL_MS;
        return values;
    } catch (_) {
        return null;
    }
}

function defReadStoredAttribution() {
    if (!defHasAnalyticsConsent()) return null;
    try {
        const value = JSON.parse(sessionStorage.getItem(DEF_ATTRIBUTION_STORAGE_KEY) || 'null');
        if (!value || !value.capturedAt || !value.expiresAt) return null;
        if (Date.now() > Number(value.expiresAt)) {
            sessionStorage.removeItem(DEF_ATTRIBUTION_STORAGE_KEY);
            return null;
        }
        return value;
    } catch (_) {
        return null;
    }
}

function defCaptureUtmTouchIfAllowed() {
    // Clear old persistent attribution once this new version is running.
    try { localStorage.removeItem('def_utm_attribution_v1'); } catch (_) {}
    try { localStorage.removeItem('def_campaign_attribution_v1'); } catch (_) {}

    if (!defHasAnalyticsConsent()) {
        try { sessionStorage.removeItem(DEF_ATTRIBUTION_STORAGE_KEY); } catch (_) {}
        return;
    }

    const current = defReadUtmFromCurrentUrl();
    if (current) {
        try {
            sessionStorage.setItem(DEF_ATTRIBUTION_STORAGE_KEY, JSON.stringify(current));
        } catch (_) {}
    }
}

function defGetAttributionForSubmission() {
    const blank = {
        utm_source: '',
        utm_medium: '',
        utm_campaign: '',
        utm_content: '',
        landing_page: defCurrentLandingPage()
    };

    if (!defHasAnalyticsConsent()) return blank;

    // Capture a current marked URL first, otherwise reuse only this tab's recent UTM touch.
    const current = defReadUtmFromCurrentUrl();
    let record = current;
    if (!record) record = defReadStoredAttribution();
    if (!record) return blank;

    if (current) {
        try { sessionStorage.setItem(DEF_ATTRIBUTION_STORAGE_KEY, JSON.stringify(current)); } catch (_) {}
    }

    return {
        utm_source: defSafeText(record.utm_source, 200),
        utm_medium: defSafeText(record.utm_medium, 200),
        utm_campaign: defSafeText(record.utm_campaign, 200),
        utm_content: defSafeText(record.utm_content, 200),
        landing_page: defSafeText(record.landing_page || defCurrentLandingPage(), 1500)
    };
}

// ---------- GA4 custom events ----------
function track(eventName, params) {
    // Strict opt-in: do not queue custom analytics events unless Analytics consent is granted.
    if (!defHasAnalyticsConsent()) return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: eventName }, params || {}));
}

// ---------- Page navigation ----------
function showPage(id) {
    document.querySelectorAll('.page').forEach((page) => page.classList.remove('active'));
    const page = document.getElementById(id);
    if (page) page.classList.add('active');
    if (id === 'newsroom') switchView('ov');
    window.scrollTo(0, 0);
}

function openContact(source) {
    currentLeadSource = source === 'book_demo' ? 'book_demo' : 'contact_sales';
    const box = document.getElementById('form-container-box');
    const done = document.getElementById('success-screen');
    const form = document.getElementById('detailed-contact-form');
    if (done && done.style.display === 'block') {
        done.style.display = '';
        if (box) box.style.display = '';
        if (form) {
            form.reset();
            const button = form.querySelector('button[type="submit"]');
            if (button) { button.disabled = false; button.textContent = 'Submit Inquiry'; }
        }
    }
    showPage('contact');
}

function switchView(viewId) {
    document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
    const target = document.getElementById('view-' + viewId);
    if (target) target.classList.add('active');
    document.querySelectorAll('.nr-sidebar a').forEach((item) => item.classList.remove('active'));
    const navKey = viewId === 'story-detail' ? 'stories' : viewId;
    const navEl = document.getElementById('nav-' + navKey);
    if (navEl) navEl.classList.add('active');
    window.scrollTo(0, 80);
}

// ---------- Stories rendering ----------
function renderStories() {
    const container = document.getElementById('stories-list');
    if (!container) return;
    container.replaceChildren();

    if (!storiesData.length) {
        defShowMessage(container, 'No stories have been published yet. Please check back soon.');
        return;
    }

    storiesData.forEach((story, index) => {
        const article = defElement('article', 'list-card story-card');
        article.tabIndex = 0;
        article.setAttribute('role', 'button');
        article.setAttribute('aria-label', 'Read story: ' + defSafeText(story.title, 160));

        const imageWrap = defElement('div', 'image-container');
        const image = defElement('img');
        image.src = defGetImageUrl(story.image, '/images/story-cover.jpg');
        image.alt = defSafeText(story.title, 160);
        image.loading = 'lazy';
        image.decoding = 'async';
        image.onerror = () => { image.onerror = null; image.src = '/images/story-cover.jpg'; };
        imageWrap.appendChild(image);

        const info = defElement('div', 'list-info');
        const dateText = fmtDate(story.date);
        if (dateText) info.appendChild(defElement('span', 'date', dateText));
        info.appendChild(defElement('h4', '', story.title || 'Untitled story'));
        const summary = defSafeText(story.summary || story.excerpt || '', 600);
        if (summary) info.appendChild(defElement('p', 'story-summary', summary));

        if (Array.isArray(story.tags) && story.tags.length) {
            const tags = defElement('div', 'story-tags');
            story.tags.forEach((tag) => tags.appendChild(defElement('span', 'kone-tag', tag)));
            info.appendChild(tags);
        }

        article.append(imageWrap, info);
        article.addEventListener('click', () => showStoryDetail(index));
        article.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                showStoryDetail(index);
            }
        });
        container.appendChild(article);
    });
}

function showStoryDetail(index) {
    const story = storiesData[index];
    if (!story) return;

    const image = document.getElementById('sd-img');
    const date = document.getElementById('sd-date');
    const title = document.getElementById('sd-title');
    const summary = document.getElementById('sd-summary');
    const body = document.getElementById('sd-body');

    if (image) {
        image.src = defGetImageUrl(story.image, '/images/story-cover.jpg');
        image.alt = defSafeText(story.title, 160);
        image.onerror = () => { image.onerror = null; image.src = '/images/story-cover.jpg'; };
    }
    if (date) date.textContent = fmtDate(story.date);
    if (title) title.textContent = story.title || 'Untitled story';
    if (summary) {
        summary.textContent = defSafeText(story.summary || story.excerpt || '', 1000);
        summary.hidden = !summary.textContent;
    }
    if (body) {
        try {
            body.innerHTML = window.marked && typeof window.marked.parse === 'function'
                ? window.marked.parse(story.body || '')
                : defSafeText(story.body || '', 50000);
        } catch (_) {
            body.textContent = story.body || '';
        }
    }

    const tagsWrap = document.getElementById('sd-tags');
    if (tagsWrap) {
        tagsWrap.replaceChildren();
        (Array.isArray(story.tags) ? story.tags : []).forEach((tag) => tagsWrap.appendChild(defElement('span', 'kone-tag', tag)));
        tagsWrap.hidden = !tagsWrap.childElementCount;
    }
    switchView('story-detail');
}

// ---------- Events rendering ----------
function defParseLegacyEventRange(value) {
    const text = defSafeText(value, 150);
    // Example: "Nov 12-15, 2026" or "Dec 05–08, 2026".
    const range = text.match(/^([A-Za-z]{3,9})\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s*(\d{4})$/);
    if (range) {
        const start = defParseLocalDate(`${range[1]} ${range[2]}, ${range[4]}`);
        const end = defParseLocalDate(`${range[1]} ${range[3]}, ${range[4]}`);
        return { start, end };
    }
    const twoDates = text.match(/^(.+?)\s*[-–]\s*(.+)$/);
    if (twoDates) {
        return { start: defParseLocalDate(twoDates[1]), end: defParseLocalDate(twoDates[2]) };
    }
    const oneDate = defParseLocalDate(text);
    return { start: oneDate, end: oneDate };
}

function defGetEventDates(event) {
    let start = defParseLocalDate(event.start_date || '');
    let end = defParseLocalDate(event.end_date || '');
    if (!start || !end) {
        const legacy = defParseLegacyEventRange(event.date || '');
        start = start || legacy.start;
        end = end || legacy.end;
    }
    if (!end && start) end = start;
    return { start, end };
}

function defFormatEventDate(event, dates) {
    if (dates.start && dates.end) {
        if (dates.start.toDateString() === dates.end.toDateString()) return fmtDate(dates.start);
        return fmtDate(dates.start) + ' – ' + fmtDate(dates.end);
    }
    return defSafeText(event.date || event.year || '', 150);
}

function defMakeEventCard(event, status) {
    const card = defElement('article', 'event-card');
    const imageWrap = defElement('div', 'event-card-image');
    const image = defElement('img');
    image.src = defGetImageUrl(event.cover, '/images/event-1.jpg');
    image.alt = defSafeText(event.title, 160);
    image.loading = 'lazy';
    image.decoding = 'async';
    image.onerror = () => { image.onerror = null; image.src = '/images/event-1.jpg'; };
    imageWrap.appendChild(image);

    const body = defElement('div', 'event-card-body');
    const badgeLabel = status === 'upcoming' ? 'Upcoming' : status === 'past' ? 'Past event' : 'Date to confirm';
    body.appendChild(defElement('span', 'event-status', badgeLabel));
    body.appendChild(defElement('h3', 'event-title', event.title || 'Untitled event'));

    const dates = defGetEventDates(event);
    const dateLabel = defFormatEventDate(event, dates);
    const meta = defElement('div', 'event-meta');
    if (dateLabel) {
        const dateLine = defElement('p', '', 'Date: ' + dateLabel);
        meta.appendChild(dateLine);
    }
    const location = defSafeText(event.loc || event.location || '', 200);
    if (location) meta.appendChild(defElement('p', '', 'Location: ' + location));
    const booth = defSafeText(event.booth || '', 120);
    if (booth) meta.appendChild(defElement('p', '', 'Booth: ' + booth));
    body.appendChild(meta);

    const theme = defSafeText(event.theme || '', 250);
    if (theme) body.appendChild(defElement('p', 'event-theme', 'Theme: ' + theme));
    const recap = defSafeText(event.recap || '', 12000);
    if (recap && window.marked && typeof window.marked.parse === 'function') {
        const recapNode = defElement('div', 'event-recap');
        recapNode.innerHTML = window.marked.parse(recap);
        body.appendChild(recapNode);
    } else {
        const description = defSafeText(event.desc || event.description || recap, 2500);
        if (description) body.appendChild(defElement('p', 'event-description', description));
    }

    if (Array.isArray(event.gallery) && event.gallery.length) {
        const gallery = defElement('div', 'event-gallery');
        event.gallery.slice(0, 8).forEach((imageValue, index) => {
            const galleryImage = defElement('img');
            galleryImage.src = defGetImageUrl(typeof imageValue === 'string' ? imageValue : (imageValue && (imageValue.image || imageValue.src)), '');
            galleryImage.alt = defSafeText(event.title, 160) + ' - gallery image ' + (index + 1);
            galleryImage.loading = 'lazy';
            galleryImage.decoding = 'async';
            if (galleryImage.src) gallery.appendChild(galleryImage);
        });
        if (gallery.childElementCount) body.appendChild(gallery);
    }

    const eventUrl = defSafeText(event.url || event.website || '', 1000);
    if (/^https:\/\//i.test(eventUrl)) {
        const link = defElement('a', 'event-link', 'Visit event website');
        link.href = eventUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        body.appendChild(link);
    }

    card.append(imageWrap, body);
    return card;
}

function renderEvents() {
    const container = document.getElementById('events-list');
    if (!container) return;
    container.replaceChildren();

    if (!eventsData.length) {
        defShowMessage(container, 'No events have been published yet. Please check back soon.');
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = [];
    const past = [];
    const unknown = [];

    eventsData.forEach((event) => {
        const dates = defGetEventDates(event);
        if (dates.end) {
            if (dates.end < today) past.push({ event, dates });
            else upcoming.push({ event, dates });
        } else {
            unknown.push({ event, dates });
        }
    });

    upcoming.sort((a, b) => (a.dates.start || new Date(8640000000000000)) - (b.dates.start || new Date(8640000000000000)));
    past.sort((a, b) => (b.dates.end || 0) - (a.dates.end || 0));

    const addSection = (title, list, status) => {
        if (!list.length) return;
        container.appendChild(defElement('h3', 'events-section-title', title));
        const grid = defElement('div', 'events-grid');
        list.forEach((item) => grid.appendChild(defMakeEventCard(item.event, status)));
        container.appendChild(grid);
    };

    addSection('Upcoming Global Expos', upcoming, 'upcoming');
    addSection('Past Events & Highlights', past, 'past');
    addSection('Events — Dates to Confirm', unknown, 'unknown');
}

async function loadCloudData() {
    const storiesContainer = document.getElementById('stories-list');
    const eventsContainer = document.getElementById('events-list');

    try {
        const response = await fetch('/data/database.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('Could not load stories data');
        const data = await response.json();
        storiesData = Array.isArray(data.articles) ? data.articles : [];
        renderStories();
    } catch (error) {
        console.error('Stories data could not be loaded.');
        defShowMessage(storiesContainer, 'Stories could not be loaded right now. Please try again later.');
    }

    try {
        const response = await fetch('/data/events.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('Could not load events data');
        const data = await response.json();
        eventsData = Array.isArray(data.exhibitions) ? data.exhibitions : [];
        renderEvents();
    } catch (error) {
        console.error('Events data could not be loaded.');
        defShowMessage(eventsContainer, 'Events could not be loaded right now. Please try again later.');
    }
}

// ---------- Cookie consent events ----------
function initCookieConsent() {
    const get = (id) => document.getElementById(id);
    const banner = get('cookie-banner');
    const panel = get('cookie-panel');
    const reopen = get('cookie-reopen');
    const analyticsBox = get('cookie-analytics');
    const marketingBox = get('cookie-marketing');
    if (!banner || !panel || !reopen || !analyticsBox || !marketingBox) return;

    function showBanner(showDetails) {
        const saved = typeof readConsent === 'function' ? readConsent() : null;
        analyticsBox.checked = Boolean(saved && saved.analytics === true);
        marketingBox.checked = Boolean(saved && saved.marketing === true);
        panel.hidden = !showDetails;
        banner.style.display = 'block';
        reopen.style.display = 'none';
    }

    function saveConsent(choice) {
        const safeChoice = {
            analytics: choice.analytics === true,
            marketing: choice.marketing === true,
            savedAt: Date.now()
        };
        // Consent default is established in config.js before GTM loads.
        if (typeof gtag === 'function' && typeof consentToGtag === 'function') {
            gtag('consent', 'update', consentToGtag(safeChoice));
        }
        try { localStorage.setItem(CONSENT_KEY, JSON.stringify(safeChoice)); } catch (_) { /* storage unavailable */ }
        document.dispatchEvent(new CustomEvent('def:consent-updated', { detail: safeChoice }));
        banner.style.display = 'none';
        reopen.style.display = 'block';
    }

    const accept = get('cookie-accept');
    const reject = get('cookie-reject');
    const customize = get('cookie-customize');
    const save = get('cookie-save');
    if (accept) accept.addEventListener('click', () => saveConsent({ analytics: true, marketing: true }));
    if (reject) reject.addEventListener('click', () => saveConsent({ analytics: false, marketing: false }));
    if (customize) customize.addEventListener('click', () => { panel.hidden = !panel.hidden; });
    if (save) save.addEventListener('click', () => saveConsent({ analytics: analyticsBox.checked, marketing: marketingBox.checked }));
    reopen.addEventListener('click', () => showBanner(true));

    const saved = typeof readConsent === 'function' ? readConsent() : null;
    if (saved) {
        reopen.style.display = 'block';
        banner.style.display = 'none';
    } else {
        showBanner(false);
    }
}

function defApplyConsentToAttribution(choice) {
    if (choice && choice.analytics === true) {
        defCaptureUtmTouchIfAllowed();
    } else {
        defClearStoredAttribution();
    }
}

// ---------- Reliable same-origin POST to Cloudflare Pages Functions ----------
async function defPostForm(endpoint, values) {
    const body = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => body.set(key, value === null || value === undefined ? '' : String(value)));

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: body.toString(),
        credentials: 'same-origin',
        cache: 'no-store'
    });

    let result;
    try { result = await response.json(); }
    catch (_) { throw new Error('The server returned an unreadable response.'); }

    if (!response.ok || !result || result.ok !== true) {
        throw new Error((result && result.message) || 'The submission could not be confirmed. Please try again.');
    }
    return result;
}

function defSetButton(button, text, disabled) {
    if (!button) return;
    button.textContent = text;
    button.disabled = Boolean(disabled);
}

function defResetContactFormUI() {
    const form = document.getElementById('detailed-contact-form');
    const box = document.getElementById('form-container-box');
    const done = document.getElementById('success-screen');
    if (form) form.reset();
    if (box) box.style.display = '';
    if (done) done.style.display = 'none';
    const button = form && form.querySelector('button[type="submit"]');
    defSetButton(button, 'Submit Inquiry', false);
}

function initContactForm() {
    const form = document.getElementById('detailed-contact-form');
    if (!form) return;

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (!form.reportValidity()) return;

        const button = form.querySelector('button[type="submit"]');
        if (button && button.disabled) return;
        defSetButton(button, 'Submitting…', true);

        const values = Object.fromEntries(new FormData(form).entries());
        Object.assign(values, defGetAttributionForSubmission(), {
            form_type: currentLeadSource,
            form_id: 'contact_sales_form'
        });

        try {
            await defPostForm(SITE_CONFIG.contactEndpoint || '/api/contact', values);
            track('generate_lead', {
                form_id: 'contact_sales_form',
                lead_source: currentLeadSource
            });

            const box = document.getElementById('form-container-box');
            const done = document.getElementById('success-screen');
            if (box) box.style.display = 'none';
            if (done) done.style.display = 'block';
            window.scrollTo(0, 0);
        } catch (error) {
            defSetButton(button, 'Submit Inquiry', false);
            alert('We could not confirm your submission. Please check whether it was received before trying again.');
            console.error('Contact form submission was not confirmed:', error);
        }
    });
}

function initNewsletterForm() {
    const form = document.getElementById('newsletter-form');
    if (!form) return;

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (!form.reportValidity()) return;

        const emailInput = document.getElementById('nl-email');
        const email = emailInput ? emailInput.value.trim() : '';
        if (!email) return;

        const button = form.querySelector('button[type="submit"]');
        if (button && button.disabled) return;
        defSetButton(button, 'Subscribing…', true);

        const values = Object.assign(
            { email },
            defGetAttributionForSubmission(),
            { form_id: 'newsletter_form' }
        );

        try {
            await defPostForm(SITE_CONFIG.newsletterEndpoint || '/api/newsletter', values);
            track('newsletter_signup', { form_id: 'newsletter_form' });

            const formContainer = document.getElementById('nl-form-container');
            const success = document.getElementById('nl-success-box');
            if (formContainer) formContainer.style.display = 'none';
            if (success) success.style.display = 'block';
        } catch (error) {
            defSetButton(button, 'Subscribe', false);
            alert('We could not confirm your subscription. Please check whether it was received before trying again.');
            console.error('Newsletter submission was not confirmed:', error);
        }
    });
}

// ---------- Initialization ----------
document.addEventListener('def:consent-updated', (event) => {
    const choice = event.detail || {};
    if (choice.analytics === true) {
        defCaptureUtmTouchIfAllowed();
    } else {
        defClearStoredAttribution();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Remove legacy persistent attribution so old values cannot be re-used.
    if (!defHasAnalyticsConsent()) defClearStoredAttribution();
    else defCaptureUtmTouchIfAllowed();
    loadCloudData();
    initCookieConsent();
    initContactForm();
    initNewsletterForm();
});
