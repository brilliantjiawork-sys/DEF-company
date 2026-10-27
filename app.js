// DEF Company website behavior, UTM attribution, forms, Stories and Events.
// Business form submissions work even when analytics consent is denied.

const DEF_ATTRIBUTION_STORAGE_KEY = 'def_marketing_attribution_v4';
const DEF_LANDING_PAGE_STORAGE_KEY = 'def_first_landing_page_v1';
const DEF_UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];

// This is the action used internally by the shared sales form, not a Google Sheet column.
let currentLeadSource = 'contact_sales';
let currentLeadContext = { formEntry: 'Home', contentType: '', contentTitle: '', ctaLabel: 'Contact Sales' };
let firstLandingPage = '';
let pendingContactSubmissionId = '';
let pendingNewsletterSubmissionId = '';
const trackedSubmissionIds = new Set();
let storiesData = [];
let eventsData = [];
let currentEventsTab = 'upcoming';
let currentEventsYear = 'all';
let currentEventsTopic = 'all';
let currentEventDetailIndex = null;
let currentStoryDetailIndex = null;

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
    return window.location.origin + (window.location.pathname || '/');
}

function defGetFirstLandingPage() {
    try {
        const existing = sessionStorage.getItem(DEF_LANDING_PAGE_STORAGE_KEY);
        if (existing) return existing;
        const current = defCurrentLandingPage();
        sessionStorage.setItem(DEF_LANDING_PAGE_STORAGE_KEY, current);
        return current;
    } catch (_) {
        return defCurrentLandingPage();
    }
}

function defClearStoredAttribution() {
    // Remove legacy keys and the one current UTM record. The landing-page value remains in session only.
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
        for (const key of DEF_UTM_KEYS) values[key] = defSafeText(params.get(key), 200);
        if (!DEF_UTM_KEYS.some(key => values[key])) return null;
        return values;
    } catch (_) { return null; }
}

function defReadStoredAttribution() {
    if (!defHasAnalyticsConsent()) return null;
    try {
        const value = JSON.parse(sessionStorage.getItem(DEF_ATTRIBUTION_STORAGE_KEY) || 'null');
        if (!value || typeof value !== 'object') return null;
        return value;
    } catch (_) { return null; }
}

function defCaptureUtmTouchIfAllowed() {
    if (!defHasAnalyticsConsent()) {
        try { sessionStorage.removeItem(DEF_ATTRIBUTION_STORAGE_KEY); } catch (_) {}
        return;
    }

    // Keep the first UTM set encountered in this tab session; later internal navigation or campaign URLs do not overwrite it.
    const stored = defReadStoredAttribution();
    if (stored && DEF_UTM_KEYS.some(key => stored[key])) return;
    const current = defReadUtmFromCurrentUrl();
    if (current) {
        try { sessionStorage.setItem(DEF_ATTRIBUTION_STORAGE_KEY, JSON.stringify(current)); } catch (_) {}
    }
}

function defGetAttributionForSubmission() {
    const result = {
        landing_page: firstLandingPage || defGetFirstLandingPage(),
        utm_source: '',
        utm_medium: '',
        utm_campaign: '',
        utm_content: ''
    };
    if (!defHasAnalyticsConsent()) return result;

    let utm = defReadStoredAttribution();
    if (!utm) {
        utm = defReadUtmFromCurrentUrl();
        if (utm) {
            try { sessionStorage.setItem(DEF_ATTRIBUTION_STORAGE_KEY, JSON.stringify(utm)); } catch (_) {}
        }
    }
    if (utm) {
        result.utm_source = defSafeText(utm.utm_source, 200);
        result.utm_medium = defSafeText(utm.utm_medium, 200);
        result.utm_campaign = defSafeText(utm.utm_campaign, 200);
        result.utm_content = defSafeText(utm.utm_content, 200);
    }
    return result;
}

function track(eventName, params) {
    if (!defHasAnalyticsConsent()) return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: eventName }, params || {}));
}

function defContentSlug(content, index = 0) {
    const source = defSafeText(content && (content.slug || content.id || content.title), 200);
    const slug = source.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
    return slug || 'content-' + (Number(index) + 1);
}

function defCreateSubmissionId() {
    try { if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID(); } catch (_) {}
    return 'def-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
}

function defTrackVirtualPageView(path, pageTitle) {
    const virtualPath = path && path.startsWith('/')
        ? path
        : '/' + String(path || '').replace(/^\/+/, '');

    track('virtual_page_view', {
        page_location: window.location.origin + virtualPath,
        page_path: virtualPath,
        page_title: pageTitle || document.title
    });
}

// ---------- Page navigation ----------
function showPage(id) {
    document.querySelectorAll('.page').forEach((page) => page.classList.remove('active'));
    const page = document.getElementById(id);
    if (page) page.classList.add('active');
    if (id === 'newsroom') switchView('ov');
    window.scrollTo(0, 0);
}

function defNormalizeFormEntry(value) {
    const text = defSafeText(value, 80).toLowerCase();
    return ['newsroom', 'stories', 'events', 'trade shows'].includes(text) ? 'Newsroom' : 'Home';
}

function defNormalizeContentType(value) {
    const text = defSafeText(value, 80).toLowerCase();
    if (text === 'story' || text === 'stories') return 'Story';
    if (['trade shows', 'trade show', 'event', 'events'].includes(text)) return 'Trade Shows';
    return '';
}

function defInferLeadContextFromCurrentView() {
    const activePage = document.querySelector('.page.active');
    if (activePage && activePage.id === 'contact' && currentLeadContext) {
        return Object.assign({}, currentLeadContext);
    }

    const inNewsroom = Boolean(activePage && activePage.id === 'newsroom');
    const result = { formEntry: inNewsroom ? 'Newsroom' : 'Home', contentType: '', contentTitle: '' };
    const storyDetail = document.getElementById('view-story-detail');
    const tradeShowDetail = document.getElementById('view-event-detail');

    if (inNewsroom && storyDetail && storyDetail.classList.contains('active')) {
        const story = storiesData[currentStoryDetailIndex];
        if (story) {
            result.contentType = 'Story';
            result.contentTitle = defSafeText(story.title || '', 300);
        }
        return result;
    }

    if (inNewsroom && tradeShowDetail && tradeShowDetail.classList.contains('active')) {
        const item = eventsData[currentEventDetailIndex];
        if (item) {
            result.contentType = 'Trade Shows';
            result.contentTitle = defSafeText(item.title || '', 300);
        }
        return result;
    }

    return result;
}

function openContact(source, contentTitle, ctaLabel, contentType, sourceSection) {
    // `source` identifies the requested action internally; the sheet records its visible CTA label instead.
    currentLeadSource = source === 'book_demo' ? 'book_demo' : 'contact_sales';
    const inferred = defInferLeadContextFromCurrentView();
    const suppliedEntry = sourceSection ? defNormalizeFormEntry(sourceSection) : inferred.formEntry;
    const entry = suppliedEntry || 'Home';
    const requestedType = defNormalizeContentType(contentType || inferred.contentType);
    const requestedTitle = defSafeText(contentTitle || inferred.contentTitle || '', 300);
    const hasContentContext = entry === 'Newsroom' && Boolean(requestedType && requestedTitle);
    const normalizedType = hasContentContext ? requestedType : '';
    const title = hasContentContext ? requestedTitle : '';
    const label = defSafeText(
        ctaLabel || (currentLeadSource === 'book_demo' ? 'Book a Demo' : 'Contact Sales'),
        200
    );

    currentLeadContext = {
        formEntry: entry,
        contentType: normalizedType,
        contentTitle: title,
        ctaLabel: label
    };

    track('cta_click', {
        form_entry: entry,
        content_type: normalizedType,
        content_title: title,
        cta_label: label
    });

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
        pendingContactSubmissionId = '';
    }
    showPage('contact');
}

function switchView(viewId, options = {}) {
    document.querySelectorAll('.view').forEach((view) => view.classList.remove('active'));
    const target = document.getElementById('view-' + viewId);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nr-sidebar a').forEach((item) => item.classList.remove('active'));
    const navKey = viewId === 'story-detail'
        ? 'stories'
        : viewId === 'event-detail'
            ? 'events'
            : viewId;
    const navEl = document.getElementById('nav-' + navKey);
    if (navEl) navEl.classList.add('active');

    // Return to the Events list with the previously selected Upcoming/Past tab intact.
    if (viewId === 'events') renderEvents();

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
    currentStoryDetailIndex = index;

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

    const storyCtaContainer = document.getElementById('sd-cta');
    if (storyCtaContainer) {
        storyCtaContainer.replaceChildren();
        if (story.cta_enabled === true) {
            const ctaLabel = defSafeText(story.cta_label || 'Talk to our team', 200);
            const storyCta = defElement('button', 'btn-y event-detail-cta', ctaLabel);
            storyCta.type = 'button';
            storyCta.addEventListener('click', () => openContact('contact_sales', story.title || '', ctaLabel, 'Story', 'Newsroom'));
            storyCtaContainer.appendChild(storyCta);
        }
    }

    switchView('story-detail');
    track('content_view', { content_type: 'Story', content_title: defSafeText(story.title || 'Untitled story', 300) });
    defTrackVirtualPageView('/newsroom/stories/' + encodeURIComponent(defContentSlug(story, index)), defSafeText(story.title || 'Untitled story', 300));
}

// ---------- Events rendering ----------
function defParseLegacyEventRange(value) {
    const text = defSafeText(value, 200);
    const range = text.match(/^([A-Za-z]{3,9})\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s*(\d{4})$/);
    if (range) {
        const start = defParseLocalDate(`${range[1]} ${range[2]}, ${range[4]}`);
        const end = defParseLocalDate(`${range[1]} ${range[3]}, ${range[4]}`);
        return { start, end };
    }
    const twoDates = text.match(/^(.+?)\s*[-–]\s*(.+)$/);
    if (twoDates) return { start: defParseLocalDate(twoDates[1]), end: defParseLocalDate(twoDates[2]) };
    const oneDate = defParseLocalDate(text);
    return { start: oneDate, end: oneDate };
}

function defGetEventDates(event) {
    let start = defParseLocalDate(event.start_date || event.startDate || '');
    let end = defParseLocalDate(event.end_date || event.endDate || '');

    if (!start || !end) {
        const legacy = defParseLegacyEventRange(event.date || '');
        start = start || legacy.start;
        end = end || legacy.end;
    }

    // Older reports may only have a year; use it for classification, not to invent a full date label.
    const eventYear = Number(event.event_year || event.year || 0);
    if ((!start || !end) && eventYear >= 1900 && eventYear <= 2200) {
        const yearDate = new Date(eventYear, 11, 31);
        start = start || yearDate;
        end = end || yearDate;
    }

    if (!end && start) end = start;
    return { start, end };
}

function defFormatEventDate(event, dates) {
    const hasExplicitDates = Boolean(event.start_date || event.end_date || event.date);
    if (dates.start && dates.end && hasExplicitDates) {
        if (dates.start.toDateString() === dates.end.toDateString()) return fmtDate(dates.start);
        return fmtDate(dates.start) + ' – ' + fmtDate(dates.end);
    }

    const year = event.event_year || event.year;
    if (year && !hasExplicitDates) return String(year);
    return defSafeText(event.date || year || 'Date to be confirmed', 150);
}

function defGetEventStatus(event) {
    if (event && (event._contentType === 'report' || event.content_type === 'report' || event.type === 'report')) {
        return 'past';
    }

    const dates = defGetEventDates(event || {});
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dates.end && dates.end < today) return 'past';
    return 'upcoming';
}

function defNormalizeEventsPayload(data) {
    if (!data || typeof data !== 'object') return [];

    // New CMS structure: separate short announcements and long-form reports.
    if (Array.isArray(data.announcements) || Array.isArray(data.reports)) {
        const announcements = (Array.isArray(data.announcements) ? data.announcements : [])
            .map((event) => Object.assign({}, event, { _contentType: 'announcement' }));
        const reports = (Array.isArray(data.reports) ? data.reports : [])
            .map((event) => Object.assign({}, event, { _contentType: 'report' }));
        return announcements.concat(reports);
    }

    // Legacy CMS structure: one exhibitions array. Detect recap/body-only historical items.
    if (Array.isArray(data.exhibitions)) {
        return data.exhibitions.map((event) => {
            const dates = defGetEventDates(event || {});
            const isReport = Boolean(
                event && (
                    event.event_year ||
                    event.published_date ||
                    event.recap ||
                    event.body
                ) && (!dates.end || dates.end < new Date())
            );
            return Object.assign({}, event, {
                _contentType: isReport ? 'report' : 'announcement'
            });
        });
    }

    if (Array.isArray(data.events)) {
        return data.events.map(event => Object.assign({}, event, {
            _contentType: event.content_type || event.type || 'announcement'
        }));
    }

    return [];
}

function defGetEventLocation(event) {
    return defSafeText(event.loc || event.location || event.venue || '', 250);
}

function defGetEventSummary(event) {
    return defSafeText(event.summary || event.excerpt || event.desc || event.description || '', 1500);
}

function defGetEventYear(event) {
    if (event.event_year || event.year) return String(event.event_year || event.year);
    const dates = defGetEventDates(event);
    const date = dates.end || dates.start;
    return date ? String(date.getFullYear()) : '';
}

function defGetEventsForTab() {
    let items = eventsData.map((event, index) => ({ event, index, status: defGetEventStatus(event) }))
        .filter(item => item.status === currentEventsTab);

    if (currentEventsTab === 'past' && currentEventsYear !== 'all') {
        items = items.filter(item => defGetEventYear(item.event) === currentEventsYear);
    }

    if (currentEventsTopic !== 'all') {
        items = items.filter(item => Array.isArray(item.event.tags) && item.event.tags.includes(currentEventsTopic));
    }

    if (currentEventsTab === 'upcoming') {
        items.sort((a, b) => {
            const dateA = defGetEventDates(a.event).start;
            const dateB = defGetEventDates(b.event).start;
            return (dateA ? dateA.getTime() : Number.MAX_SAFE_INTEGER) -
                (dateB ? dateB.getTime() : Number.MAX_SAFE_INTEGER);
        });
    } else {
        items.sort((a, b) => {
            const dateA = defGetEventDates(a.event).end;
            const dateB = defGetEventDates(b.event).end;
            return (dateB ? dateB.getTime() : 0) - (dateA ? dateA.getTime() : 0);
        });
    }

    return items;
}

function defRenderEventTopicFilters(availableItems) {
    const container = document.getElementById('events-filters');
    if (!container) return;
    container.replaceChildren();

    const topics = new Set();
    availableItems.forEach(({ event }) => {
        (Array.isArray(event.tags) ? event.tags : []).forEach(tag => {
            const clean = defSafeText(tag, 80);
            if (clean) topics.add(clean);
        });
    });

    const topicList = ['all', ...Array.from(topics).sort((a, b) => a.localeCompare(b))];
    if (!topicList.includes(currentEventsTopic)) currentEventsTopic = 'all';

    topicList.forEach(topic => {
        const label = topic === 'all' ? 'All topics' : topic;
        const button = defElement('button', topic === currentEventsTopic ? 'is-active' : '', label);
        button.type = 'button';
        button.setAttribute('aria-pressed', String(topic === currentEventsTopic));
        button.addEventListener('click', () => {
            currentEventsTopic = topic;
            renderEvents();
        });
        container.appendChild(button);
    });
}

function defUpdateEventsTabs() {
    document.querySelectorAll('[data-events-tab]').forEach(button => {
        const isActive = button.dataset.eventsTab === currentEventsTab;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-selected', String(isActive));
        button.tabIndex = isActive ? 0 : -1;
    });
}

function initEventsControls() {
    // This missing binding was the reason Past Trade Shows did not respond to clicks.
    document.querySelectorAll('[data-events-tab]').forEach(button => {
        button.addEventListener('click', () => {
            const nextTab = button.dataset.eventsTab;
            if (!['upcoming', 'past'].includes(nextTab)) return;
            currentEventsTab = nextTab;
            currentEventsYear = 'all';
            currentEventsTopic = 'all';
            defUpdateEventsTabs();
            renderEvents();
        });
    });

    const yearSelect = document.getElementById('events-year-select');
    if (yearSelect) {
        yearSelect.addEventListener('change', () => {
            currentEventsYear = yearSelect.value || 'all';
            renderEvents();
        });
    }

    defUpdateEventsTabs();
}

function defMakeEventCard(event, index, status) {
    const card = defElement('article', 'event-card event-card-clickable');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', 'View trade show: ' + defSafeText(event.title || 'Untitled event', 160));

    const imageWrap = defElement('div', 'event-card-image');
    const image = defElement('img');
    image.src = defGetImageUrl(event.cover || event.image, '/images/event-1.jpg');
    image.alt = defSafeText(event.title, 160);
    image.loading = 'lazy';
    image.decoding = 'async';
    image.onerror = () => { image.onerror = null; image.src = '/images/event-1.jpg'; };
    imageWrap.appendChild(image);

    const body = defElement('div', 'event-card-body');
    const badgeLabel = status === 'upcoming' ? 'Upcoming' : 'Past';
    body.appendChild(defElement('span', 'event-status', badgeLabel));
    body.appendChild(defElement('h3', 'event-title', event.title || 'Untitled event'));

    const dates = defGetEventDates(event);
    const dateLabel = defFormatEventDate(event, dates);
    if (dateLabel) body.appendChild(defElement('p', 'event-card-date', 'Date: ' + dateLabel));

    const location = defGetEventLocation(event);
    if (location) body.appendChild(defElement('p', 'event-card-location', 'Location: ' + location));

    card.append(imageWrap, body);
    card.addEventListener('click', () => showEventDetail(index));
    card.addEventListener('keydown', (eventObject) => {
        if (eventObject.key === 'Enter' || eventObject.key === ' ') {
            eventObject.preventDefault();
            showEventDetail(index);
        }
    });

    return card;
}

function defSetOptionalText(id, value) {
    const element = document.getElementById(id);
    if (!element) return;
    const text = defSafeText(value, 5000);
    element.textContent = text;
    element.hidden = !text;
}

function defRenderMarkdownInto(element, markdown) {
    if (!element) return;
    element.replaceChildren();
    const text = String(markdown || '').trim();
    if (!text) return;

    if (window.marked && typeof window.marked.parse === 'function') {
        const html = window.marked.parse(text);
        if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
            element.innerHTML = window.DOMPurify.sanitize(html);
        } else {
            // Avoid inserting un-sanitized CMS HTML if the sanitizer is unavailable.
            element.textContent = text;
        }
    } else {
        element.textContent = text;
    }
}

function showEventDetail(index) {
    const event = eventsData[index];
    if (!event) return;

    currentEventDetailIndex = index;
    const status = defGetEventStatus(event);
    const dates = defGetEventDates(event);
    const titleText = defSafeText(event.title || 'Untitled trade show', 300);
    const slug = defContentSlug(event, index);

    const coverWrap = document.getElementById('ed-cover-wrap');
    const cover = document.getElementById('ed-cover');
    if (cover) {
        const imageUrl = defGetImageUrl(event.cover || event.image, '');
        cover.src = imageUrl || '/images/event-1.jpg';
        cover.alt = titleText;
        cover.hidden = !imageUrl;
        cover.onerror = () => { cover.onerror = null; cover.hidden = true; };
    }
    if (coverWrap) coverWrap.hidden = !(cover && cover.src && !cover.hidden);

    const statusElement = document.getElementById('ed-status');
    if (statusElement) {
        statusElement.textContent = status === 'upcoming' ? 'Upcoming' : 'Past';
        statusElement.className = 'event-status ' + (status === 'upcoming' ? 'is-upcoming' : 'is-past');
        statusElement.hidden = false;
    }

    defSetOptionalText('ed-published-date', defFormatEventDate(event, dates));
    defSetOptionalText('ed-title', titleText);
    defSetOptionalText('ed-summary', defGetEventSummary(event));

    const tags = document.getElementById('ed-tags');
    if (tags) {
        tags.replaceChildren();
        (Array.isArray(event.tags) ? event.tags : []).forEach(tag => {
            tags.appendChild(defElement('span', 'kone-tag', tag));
        });
        tags.hidden = !tags.childElementCount;
    }

    const meta = document.getElementById('ed-meta');
    if (meta) {
        meta.replaceChildren();
        const dateLabel = defFormatEventDate(event, dates);
        const location = defGetEventLocation(event);
        const booth = defSafeText(event.booth || '', 160);
        const theme = defSafeText(event.theme || '', 300);
        const addMeta = (label, value) => {
            if (!value) return;
            const item = defElement('span', 'event-detail-meta-item');
            item.appendChild(defElement('strong', '', label + ': '));
            item.appendChild(document.createTextNode(value));
            meta.appendChild(item);
        };
        addMeta('Date', dateLabel);
        addMeta('Location', location);
        addMeta('Booth', booth);
        addMeta('Theme', theme);
        meta.hidden = !meta.childElementCount;
    }

    const highlightsSection = document.getElementById('ed-highlights-section');
    const highlights = document.getElementById('ed-highlights');
    if (highlightsSection && highlights) {
        const highlightValue = event.highlights || event.key_highlights || event.highlights_markdown || '';
        defRenderMarkdownInto(highlights, Array.isArray(highlightValue) ? highlightValue.map(x => '- ' + String(x)).join('\n') : highlightValue);
        highlightsSection.hidden = !String(Array.isArray(highlightValue) ? highlightValue.join('') : highlightValue).trim();
    }

    const bodySection = document.getElementById('ed-body-section');
    const bodyHeading = document.getElementById('ed-body-heading');
    const body = document.getElementById('ed-body');
    const longBody = defSafeText(event.body || event.article_body || '', 50000);
    if (body) defRenderMarkdownInto(body, longBody);
    if (bodySection) bodySection.hidden = !longBody;
    if (bodyHeading) bodyHeading.textContent = status === 'past' ? 'Trade Show Report' : 'About This Show';

    const recapSection = document.getElementById('ed-recap-section');
    const recap = document.getElementById('ed-recap');
    const recapText = status === 'past' ? defSafeText(event.recap || '', 30000) : '';
    if (recap) defRenderMarkdownInto(recap, recapText);
    if (recapSection) recapSection.hidden = !recapText;

    const gallery = document.getElementById('ed-gallery');
    if (gallery) {
        gallery.replaceChildren();
        const images = Array.isArray(event.gallery) ? event.gallery : [];
        images.forEach((galleryItem, galleryIndex) => {
            const imageValue = typeof galleryItem === 'string'
                ? galleryItem
                : (galleryItem && (galleryItem.image || galleryItem.src || galleryItem.url));
            const imageUrl = defGetImageUrl(imageValue, '');
            if (!imageUrl) return;

            const figure = defElement('figure', 'event-detail-gallery-item');
            const img = defElement('img');
            img.src = imageUrl;
            img.alt = defSafeText(
                (galleryItem && galleryItem.alt) || titleText + ' gallery image ' + (galleryIndex + 1),
                250
            );
            img.loading = 'lazy';
            img.decoding = 'async';
            figure.appendChild(img);
            const caption = defSafeText(galleryItem && galleryItem.caption || '', 300);
            if (caption) figure.appendChild(defElement('figcaption', '', caption));
            gallery.appendChild(figure);
        });
        gallery.hidden = !gallery.childElementCount;
    }

    const url = document.getElementById('ed-url');
    const eventUrl = defSafeText(event.url || event.website || '', 1000);
    if (url) {
        if (/^https:\/\//i.test(eventUrl)) {
            url.href = eventUrl;
            url.hidden = false;
        } else {
            url.removeAttribute('href');
            url.hidden = true;
        }
    }

    const ctaContainer = document.getElementById('ed-cta');
    if (ctaContainer) {
        ctaContainer.replaceChildren();
        // Existing CMS records without the new field keep their current CTA until the user edits them in CMS.
        const ctaEnabled = event.cta_enabled !== false;
        const ctaLabel = defSafeText(
            event.cta_label || (status === 'upcoming' ? 'Book a meeting at this show' : 'Talk to our team'),
            200
        );
        if (ctaEnabled) {
            const cta = defElement('button', 'btn-y event-detail-cta', ctaLabel);
            cta.type = 'button';
            cta.addEventListener('click', () => openContact('contact_sales', titleText, ctaLabel, 'Trade Shows', 'Newsroom'));
            ctaContainer.appendChild(cta);
        }
    }

    // Send only business-relevant context, not an internal Content ID.
    switchView('event-detail', { suppressVirtualPageView: true });
    track('content_view', {
        content_type: 'Trade Shows',
        content_title: titleText
    });
    defTrackVirtualPageView('/newsroom/events/' + encodeURIComponent(slug), titleText);
}

function renderEvents() {
    const container = document.getElementById('events-list');
    if (!container) return;
    container.replaceChildren();

    const allItems = eventsData.map((event, index) => ({
        event,
        index,
        status: defGetEventStatus(event)
    }));
    const upcomingAll = allItems.filter(item => item.status === 'upcoming');
    const pastAll = allItems.filter(item => item.status === 'past');

    const yearFilter = document.getElementById('events-year-filter');
    const yearSelect = document.getElementById('events-year-select');
    if (yearSelect) {
        const years = Array.from(new Set(pastAll.map(item => defGetEventYear(item.event)).filter(Boolean)))
            .sort((a, b) => Number(b) - Number(a));
        if (currentEventsYear !== 'all' && !years.includes(currentEventsYear)) currentEventsYear = 'all';
        yearSelect.replaceChildren();
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = 'All years';
        yearSelect.appendChild(allOption);
        years.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        });
        yearSelect.value = currentEventsYear;
    }
    if (yearFilter) yearFilter.hidden = currentEventsTab !== 'past' || !pastAll.some(item => defGetEventYear(item.event));

    let tabItems = currentEventsTab === 'past' ? pastAll : upcomingAll;
    if (currentEventsTab === 'past' && currentEventsYear !== 'all') {
        tabItems = tabItems.filter(item => defGetEventYear(item.event) === currentEventsYear);
    }

    defRenderEventTopicFilters(tabItems);
    const visibleItems = currentEventsTopic === 'all'
        ? tabItems
        : tabItems.filter(item => Array.isArray(item.event.tags) && item.event.tags.includes(currentEventsTopic));

    if (!visibleItems.length) {
        defShowMessage(
            container,
            currentEventsTab === 'past'
                ? 'No past trade shows match these filters yet.'
                : 'No upcoming trade shows match these filters yet.'
        );
        return;
    }

    const sectionTitle = currentEventsTab === 'past' ? 'Past Trade Shows' : 'Upcoming Trade Shows';
    container.appendChild(defElement('h3', 'events-section-title', sectionTitle));
    const grid = defElement('div', 'events-grid');
    visibleItems.forEach(item => {
        grid.appendChild(defMakeEventCard(item.event, item.index, item.status));
    });
    container.appendChild(grid);
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
        eventsData = defNormalizeEventsPayload(data);
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
        if (!pendingContactSubmissionId) pendingContactSubmissionId = defCreateSubmissionId();
        const submissionId = pendingContactSubmissionId;
        const attribution = defGetAttributionForSubmission();
        Object.assign(values, attribution, {
            submission_id: submissionId, // Internal retry key only; never written into a Sheet column.
            form_entry: currentLeadContext.formEntry || 'Home',
            content_type: currentLeadContext.contentType || '',
            content_title: currentLeadContext.contentTitle || '',
            cta_label: currentLeadContext.ctaLabel || (currentLeadSource === 'book_demo' ? 'Book a Demo' : 'Contact Sales')
        });

        try {
            await defPostForm(SITE_CONFIG.contactEndpoint || '/api/contact', values);
            if (!trackedSubmissionIds.has(submissionId)) {
                track('generate_lead', {
                    form_entry: currentLeadContext.formEntry || 'Home',
                    content_type: currentLeadContext.contentType || '',
                    content_title: currentLeadContext.contentTitle || '',
                    cta_label: currentLeadContext.ctaLabel || (currentLeadSource === 'book_demo' ? 'Book a Demo' : 'Contact Sales'),
                    landing_page: attribution.landing_page,
                    utm_source: attribution.utm_source,
                    utm_medium: attribution.utm_medium,
                    utm_campaign: attribution.utm_campaign,
                    utm_content: attribution.utm_content
                });
                trackedSubmissionIds.add(submissionId);
            }
            pendingContactSubmissionId = '';

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

        if (!pendingNewsletterSubmissionId) pendingNewsletterSubmissionId = defCreateSubmissionId();
        const submissionId = pendingNewsletterSubmissionId;
        const values = Object.assign(
            { email },
            defGetAttributionForSubmission(),
            { submission_id: submissionId } // Internal retry key only; never written into a Sheet column.
        );

        try {
            await defPostForm(SITE_CONFIG.newsletterEndpoint || '/api/newsletter', values);
            if (!trackedSubmissionIds.has(submissionId)) {
                track('newsletter_signup', { form_id: 'newsletter_form' });
                trackedSubmissionIds.add(submissionId);
            }
            pendingNewsletterSubmissionId = '';

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
    firstLandingPage = defGetFirstLandingPage();
    // Remove legacy persistent attribution so old values cannot be re-used.
    if (!defHasAnalyticsConsent()) defClearStoredAttribution();
    else defCaptureUtmTouchIfAllowed();
    initEventsControls();
    loadCloudData();
    initCookieConsent();
    initContactForm();
    initNewsletterForm();
});
