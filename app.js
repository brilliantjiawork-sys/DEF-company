// DEF Company website behavior, UTM attribution, forms, Stories and Events.
// Business form submissions work even when analytics consent is denied.

const DEF_UTM_STORAGE_KEY = 'def_utm_attribution_v1';
const DEF_UTM_RETENTION_DAYS = 180;
const DEF_PENDING_CONTACT_KEY = 'def_pending_contact_submission_id';
const DEF_PENDING_NEWSLETTER_KEY = 'def_pending_newsletter_submission_id';
const DEF_CONVERSION_SENT_PREFIX = 'def_conversion_sent_';
const DEF_UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];
const defMemorySentConversions = new Set();

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

function defCreateId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return 'sub-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
}

function defGetOrCreatePendingId(storageKey) {
    try {
        const existing = sessionStorage.getItem(storageKey);
        if (existing) return existing;
        const created = defCreateId();
        sessionStorage.setItem(storageKey, created);
        return created;
    } catch (_) {
        // Fallback is less resilient across reloads, but remains unique for this attempt.
        return defCreateId();
    }
}

function defClearPendingId(storageKey) {
    try { sessionStorage.removeItem(storageKey); } catch (_) { /* storage unavailable */ }
}

// ---------- UTM attribution: first valid touch + latest valid UTM touch ----------
function defReadUtmFromCurrentUrl() {
    try {
        const url = new URL(window.location.href);
        const values = {};
        for (const key of DEF_UTM_KEYS) {
            values[key] = defSafeText(url.searchParams.get(key), 200);
        }
        // A source is required to treat a URL as a valid UTM touch.
        if (!values.utm_source) return null;
        return values;
    } catch (_) {
        return null;
    }
}

function defReadStoredAttribution() {
    if (!defHasAnalyticsConsent()) return null;
    try {
        const value = JSON.parse(localStorage.getItem(DEF_UTM_STORAGE_KEY) || 'null');
        if (!value || !value.createdAt || !value.expiresAt) return null;
        if (Date.now() > Number(value.expiresAt)) {
            localStorage.removeItem(DEF_UTM_STORAGE_KEY);
            return null;
        }
        return value;
    } catch (_) {
        return null;
    }
}

function defClearStoredAttribution() {
    try { localStorage.removeItem(DEF_UTM_STORAGE_KEY); } catch (_) { /* storage unavailable */ }
}

function defCaptureUtmTouchIfAllowed() {
    if (!defHasAnalyticsConsent()) return;
    const touch = defReadUtmFromCurrentUrl();
    if (!touch) return;

    const now = Date.now();
    const existing = defReadStoredAttribution();
    const retentionMs = DEF_UTM_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const record = existing ? {
        first: existing.first || touch,
        latest: touch,
        createdAt: Number(existing.createdAt),
        expiresAt: Number(existing.expiresAt)
    } : {
        first: touch,
        latest: touch,
        createdAt: now,
        expiresAt: now + retentionMs
    };

    // A newer UTM URL updates latest but never replaces first while the record is valid.
    try { localStorage.setItem(DEF_UTM_STORAGE_KEY, JSON.stringify(record)); } catch (_) { /* no persistence available */ }
}

function defGetAttributionForSubmission() {
    if (!defHasAnalyticsConsent()) return {
        first_utm_source: '', first_utm_medium: '', first_utm_campaign: '',
        latest_utm_source: '', latest_utm_medium: '', latest_utm_campaign: ''
    };

    const record = defReadStoredAttribution();
    const first = record && record.first ? record.first : {};
    const latest = record && record.latest ? record.latest : {};
    return {
        first_utm_source: defSafeText(first.utm_source, 200),
        first_utm_medium: defSafeText(first.utm_medium, 200),
        first_utm_campaign: defSafeText(first.utm_campaign, 200),
        latest_utm_source: defSafeText(latest.utm_source, 200),
        latest_utm_medium: defSafeText(latest.utm_medium, 200),
        latest_utm_campaign: defSafeText(latest.utm_campaign, 200)
    };
}

// ---------- GA4 custom events ----------
function track(eventName, params) {
    // Strict opt-in: do not queue custom analytics events unless Analytics consent is granted.
    if (!defHasAnalyticsConsent()) return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: eventName }, params || {}));
}

function defTrackConversionOnce(submissionId, eventName, params) {
    if (!defHasAnalyticsConsent()) return;
    const key = DEF_CONVERSION_SENT_PREFIX + submissionId;
    try {
        if (sessionStorage.getItem(key) === '1') return;
        // Mark before pushing to avoid duplicate events on immediate retries in the same tab.
        sessionStorage.setItem(key, '1');
    } catch (_) {
        if (defMemorySentConversions.has(submissionId)) return;
        defMemorySentConversions.add(submissionId);
    }
    track(eventName, params);
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
        defClearPendingId(DEF_PENDING_CONTACT_KEY);
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

        const submissionId = defGetOrCreatePendingId(DEF_PENDING_CONTACT_KEY);
        const values = Object.fromEntries(new FormData(form).entries());
        const attribution = defGetAttributionForSubmission();
        Object.assign(values, attribution, {
            submission_id: submissionId,
            form_id: 'contact_sales_form',
            lead_source: currentLeadSource
        });

        try {
            const result = await defPostForm(SITE_CONFIG.contactEndpoint || '/api/contact', values);

            // A duplicate response means the backend already has this submission ID.
            // It is still a confirmed submission, but idempotent tracking prevents duplicate events.
            if (result.created === true || result.duplicate === true) {
                defTrackConversionOnce(submissionId, 'generate_lead', {
                    form_id: 'contact_sales_form',
                    lead_source: currentLeadSource
                });
            }

            defClearPendingId(DEF_PENDING_CONTACT_KEY);
            const box = document.getElementById('form-container-box');
            const done = document.getElementById('success-screen');
            if (box) box.style.display = 'none';
            if (done) done.style.display = 'block';
            window.scrollTo(0, 0);
        } catch (error) {
            defSetButton(button, 'Submit Inquiry', false);
            alert('We could not confirm your submission. Please try again. If the request was received, retrying is safe.');
            console.error('Contact form submission was not confirmed.');
            // Keep the same pending submission ID so retrying cannot create a duplicate row.
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

        const submissionId = defGetOrCreatePendingId(DEF_PENDING_NEWSLETTER_KEY);
        const values = Object.assign({ email }, defGetAttributionForSubmission(), {
            submission_id: submissionId,
            form_id: 'newsletter_form'
        });

        try {
            const result = await defPostForm(SITE_CONFIG.newsletterEndpoint || '/api/newsletter', values);
            if (result.created === true || result.duplicate === true) {
                defTrackConversionOnce(submissionId, 'newsletter_signup', { form_id: 'newsletter_form' });
            }
            defClearPendingId(DEF_PENDING_NEWSLETTER_KEY);
            const formContainer = document.getElementById('nl-form-container');
            const success = document.getElementById('nl-success-box');
            if (formContainer) formContainer.style.display = 'none';
            if (success) success.style.display = 'block';
        } catch (error) {
            defSetButton(button, 'Subscribe', false);
            alert('We could not confirm your subscription. Please try again. If the request was received, retrying is safe.');
            console.error('Newsletter submission was not confirmed.');
            // Keep the same pending submission ID for safe retry.
        }
    });
}

// ---------- Initialization ----------
document.addEventListener('def:consent-updated', (event) => {
    defApplyConsentToAttribution(event.detail || {});
});

document.addEventListener('DOMContentLoaded', () => {
    // If Analytics consent is absent/expired/denied, remove previously persisted marketing attribution.
    if (!defHasAnalyticsConsent()) defClearStoredAttribution();
    // If consent was granted on a previous visit, capture UTM parameters from this landing URL.
    defCaptureUtmTouchIfAllowed();
    loadCloudData();
    initCookieConsent();
    initContactForm();
    initNewsletterForm();
});
