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

let currentStoryCategory = 'all';
let currentStoryTopic = 'all';
let currentStoryIndustry = 'all';

const DEF_STORY_CATEGORIES = [
    'Product & Technology',
    'Industry Applications',
    'Industry Insights',
    'Company & Culture',
    'Brand News & Updates'
];
const DEF_TOPIC_TAGS = [
    'Machine Vision', 'AI & Deep Learning', 'Defect Detection', 'Quality Control',
    'AOI', '3D Vision', 'Robotics & Automation', 'Positioning & Measurement',
    'Electronics & Semiconductors', 'Food & Beverage Inspection', 'Packaging Inspection',
    'Warehouse & Logistics', 'Innovation', 'Sustainability'
];
const DEF_INDUSTRIES = [
    'Automotive', 'Electronics', 'Food & Beverage', 'Packaging', 'Semiconductors',
    'Logistics', 'Pharmaceuticals'
];
const DEF_LEGACY_CATEGORY_MAP = {
    'Product & Technology': 'Product & Technology',
    'Application & Use Cases': 'Industry Applications',
    'Customer Stories': 'Industry Applications',
    'Case Study': 'Industry Applications',
    'Industry Insights': 'Industry Insights',
    'Company & Culture': 'Company & Culture',
    'Company News': 'Brand News & Updates',
    'Brand News & Updates': 'Brand News & Updates'
};
const DEF_NON_TOPIC_EVENT_LABELS = new Set([
    'Trade Shows & Exhibitions', 'Product Demonstrations', 'New Product Launch', 'Industry Conference'
]);

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
    // Landing-page attribution is saved only after Analytics consent is granted.
    if (!defHasAnalyticsConsent()) return '';
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
    // Clear all attribution storage and in-memory values when Analytics consent is absent/revoked.
    try { localStorage.removeItem('def_utm_attribution_v1'); } catch (_) {}
    try { localStorage.removeItem('def_campaign_attribution_v1'); } catch (_) {}
    try { sessionStorage.removeItem('def_utm_attribution_v1'); } catch (_) {}
    try { sessionStorage.removeItem('def_campaign_attribution_v1'); } catch (_) {}
    try { sessionStorage.removeItem(DEF_ATTRIBUTION_STORAGE_KEY); } catch (_) {}
    try { sessionStorage.removeItem(DEF_LANDING_PAGE_STORAGE_KEY); } catch (_) {}
    firstLandingPage = '';
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
        defClearStoredAttribution();
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
    const blank = {
        landing_page: '',
        utm_source: '',
        utm_medium: '',
        utm_campaign: '',
        utm_content: ''
    };

    // If Analytics consent is denied, do not send landing page or UTM attribution to either Sheet.
    if (!defHasAnalyticsConsent()) return blank;

    firstLandingPage = firstLandingPage || defGetFirstLandingPage();
    const result = Object.assign({}, blank, { landing_page: firstLandingPage });

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
    if (id === 'newsroom') switchView('stories');
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

    if (viewId === 'events') renderEvents();
    if (viewId === 'stories') renderStories();

    window.scrollTo(0, 80);
}


function defNormalizeTopicTag(value) {
    const text = defSafeText(value, 100);
    const normalized = text.toLowerCase();
    if (normalized === 'ai vision' || normalized === 'ai inspection') return 'AI & Deep Learning';
    if (normalized === 'quality inspection') return 'Quality Control';
    if (normalized === 'warehouse automation') return 'Warehouse & Logistics';
    return text;
}

function defGetStoryCategory(story) {
    const direct = defSafeText(story && story.category, 100);
    if (DEF_STORY_CATEGORIES.includes(direct)) return direct;
    const rawTags = story && Array.isArray(story.tags) ? story.tags : [];
    for (const tag of rawTags) {
        if (DEF_LEGACY_CATEGORY_MAP[tag]) return DEF_LEGACY_CATEGORY_MAP[tag];
    }
    return 'Product & Technology';
}

function defGetTopicTags(content) {
    const rawTags = content && Array.isArray(content.tags) ? content.tags : [];
    const topics = [];
    for (const rawTag of rawTags) {
        const original = defSafeText(rawTag, 100);
        if (!original || DEF_LEGACY_CATEGORY_MAP[original] || DEF_NON_TOPIC_EVENT_LABELS.has(original)) continue;
        const tag = defNormalizeTopicTag(original);
        if (tag && !topics.includes(tag)) topics.push(tag);
    }
    return topics;
}

function defGetContentIndustries(content) {
    if (!content) return [];
    const raw = Array.isArray(content.industries)
        ? content.industries
        : (Array.isArray(content.industry) ? content.industry : (content.industry ? [content.industry] : []));
    return [...new Set(raw.map(value => defSafeText(value, 100)).filter(Boolean))];
}

function defGetStringList(value) {
    if (Array.isArray(value)) return value.map(item => {
        if (item && typeof item === 'object') return defSafeText(item.title || item.name || item.value || '', 250);
        return defSafeText(item, 250);
    }).filter(Boolean);
    return value ? [defSafeText(value, 250)] : [];
}

function defContentNameMatches(values, content) {
    const names = defGetStringList(values).map(value => value.toLowerCase());
    if (!content) return false;
    const title = defSafeText(content.title, 300).toLowerCase();
    const slug = defContentSlug(content).toLowerCase();
    return names.some(name => name === title || name === slug || name === defSafeText(content.slug, 250).toLowerCase());
}

function defContentMatchScore(left, right) {
    const leftTags = defGetTopicTags(left);
    const rightTags = defGetTopicTags(right);
    const sharedTags = leftTags.filter(tag => rightTags.includes(tag));
    const leftIndustries = defGetContentIndustries(left);
    const rightIndustries = defGetContentIndustries(right);
    const sharedIndustries = leftIndustries.filter(industry => rightIndustries.includes(industry));
    return { score: sharedTags.length * 5 + sharedIndustries.length * 2, sharedTags, sharedIndustries };
}

function defIsPreShowStory(story) {
    const stage = defSafeText(story && (story.event_content_stage || story.content_stage || story.content_format), 100).toLowerCase();
    return stage.includes('pre-show') || stage.includes('preview') || stage.includes('展前预告');
}

function defPlainTextLength(markdown) {
    return String(markdown || '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/[`*_>#~|-]/g, ' ')
        .replace(/\s+/g, ' ').trim().length;
}

function defIsLongForm(content) {
    return defPlainTextLength(content && (content.body || content.recap || content.article_body || '')) >= 220;
}

function defHasPastShowContent(event) {
    return Boolean(
        defPlainTextLength(event && (event.body || event.recap || event.highlights || event.key_highlights || '')) >= 80 ||
        (Array.isArray(event && event.gallery) && event.gallery.length > 0)
    );
}

function defRenderFilterGroup(container, title, values, selected, onSelect, allLabel) {
    const group = defElement('div', 'stories-filter-group');
    group.appendChild(defElement('span', 'stories-filter-label', title));
    const options = defElement('div', 'stories-filter-options');
    const complete = ['all', ...values];
    complete.forEach(value => {
        const label = value === 'all' ? allLabel : value;
        const button = defElement('button', selected === value ? 'is-active' : '', label);
        button.type = 'button';
        button.setAttribute('aria-pressed', String(selected === value));
        button.addEventListener('click', () => onSelect(value));
        options.appendChild(button);
    });
    group.appendChild(options);
    container.appendChild(group);
}

function defRenderStoriesFilters() {
    const container = document.getElementById('stories-filters');
    if (!container) return;
    container.replaceChildren();

    const availableCategories = DEF_STORY_CATEGORIES.slice();
    const availableTopics = [...new Set(storiesData.flatMap(defGetTopicTags))].sort((a, b) => a.localeCompare(b));
    const availableIndustries = [...new Set(storiesData.flatMap(defGetContentIndustries))].sort((a, b) => a.localeCompare(b));
    if (!availableCategories.includes(currentStoryCategory)) currentStoryCategory = 'all';
    if (!availableTopics.includes(currentStoryTopic)) currentStoryTopic = 'all';
    if (!availableIndustries.includes(currentStoryIndustry)) currentStoryIndustry = 'all';

    defRenderFilterGroup(container, 'Category', availableCategories, currentStoryCategory, value => {
        currentStoryCategory = value; renderStories();
    }, 'All categories');
    if (availableTopics.length) {
        defRenderFilterGroup(container, 'Topic', availableTopics, currentStoryTopic, value => {
            currentStoryTopic = value; renderStories();
        }, 'All topics');
    }
    if (availableIndustries.length) {
        defRenderFilterGroup(container, 'Industry', availableIndustries, currentStoryIndustry, value => {
            currentStoryIndustry = value; renderStories();
        }, 'All industries');
    }
}

function defMakeRecommendationCard(content, index, type, badgeText) {
    const isStory = type === 'story';
    const card = defElement('article', 'recommendation-card');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', (isStory ? 'Read story: ' : 'View trade show: ') + defSafeText(content.title, 180));

    const imageWrap = defElement('div', 'recommendation-card-image');
    const image = defElement('img');
    image.src = isStory
        ? defGetImageUrl(content.image, '/images/story-cover.jpg')
        : defGetImageUrl(content.cover || content.image, '/images/event-1.jpg');
    image.alt = defSafeText(content.title, 180);
    image.loading = 'lazy';
    image.decoding = 'async';
    image.onerror = () => { image.onerror = null; image.src = isStory ? '/images/story-cover.jpg' : '/images/event-1.jpg'; };
    imageWrap.appendChild(image);

    const body = defElement('div', 'recommendation-card-body');
    const badge = badgeText || (isStory ? defGetStoryCategory(content) : (defGetEventStatus(content) === 'past' ? 'Past Trade Show' : 'Upcoming Trade Show'));
    if (badge) body.appendChild(defElement('span', 'recommendation-card-kicker', badge));
    body.appendChild(defElement('h4', 'recommendation-card-title', defSafeText(content.title, 300) || (isStory ? 'Untitled story' : 'Untitled trade show')));

    const summary = isStory
        ? defSafeText(content.summary || content.excerpt || '', 360)
        : defGetEventSummary(content);
    if (summary) body.appendChild(defElement('p', 'recommendation-card-summary', summary));

    const dateLabel = isStory ? fmtDate(content.date || content.published_date) : defFormatEventDate(content, defGetEventDates(content));
    if (dateLabel) body.appendChild(defElement('span', 'recommendation-card-date', dateLabel));
    const tags = defElement('div', 'recommendation-card-tags');
    const contentTags = defGetTopicTags(content).slice(0, 3);
    contentTags.forEach(tag => tags.appendChild(defElement('span', 'kone-tag', tag)));
    if (tags.childElementCount) body.appendChild(tags);

    card.append(imageWrap, body);
    const activate = () => isStory ? showStoryDetail(index) : showEventDetail(index);
    card.addEventListener('click', activate);
    card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
    });
    return card;
}

function defRenderRecommendationSection(sectionId, gridId, items, type, heading, emptyHide = true) {
    const section = document.getElementById(sectionId);
    const grid = document.getElementById(gridId);
    if (!section || !grid) return;
    grid.replaceChildren();
    (items || []).forEach(item => {
        grid.appendChild(defMakeRecommendationCard(item.content, item.index, type, item.badge || ''));
    });
    section.hidden = emptyHide && !grid.childElementCount;
    const headingElement = section.querySelector('h3');
    if (headingElement && heading) headingElement.textContent = heading;
}

function defFindRelatedStoriesForStory(story, currentIndex, limit = 3) {
    return storiesData.map((content, index) => {
        if (index === currentIndex || defIsPreShowStory(content)) return null;
        const match = defContentMatchScore(story, content);
        const explicit = defContentNameMatches(story && story.related_story_titles, content);
        return (match.score > 0 || explicit) ? { content, index, score: match.score + (explicit ? 20 : 0) } : null;
    }).filter(Boolean).sort((a, b) => b.score - a.score || (defParseLocalDate(b.content.date) || new Date(0)) - (defParseLocalDate(a.content.date) || new Date(0))).slice(0, limit);
}

function defFindRelatedEventsForStory(story, limit = 3) {
    const matches = eventsData.map((content, index) => {
        const match = defContentMatchScore(story, content);
        const explicit = defContentNameMatches(story && story.related_event_titles, content);
        const score = match.score + (explicit ? 20 : 0);
        if (score <= 0) return null;
        const status = defGetEventStatus(content);
        if (status === 'past' && !defHasPastShowContent(content)) return null;
        return { content, index, status, score, badge: status === 'past' ? 'Past Trade Show · Recap' : 'Upcoming Trade Show' };
    }).filter(Boolean);

    const upcoming = matches.filter(item => item.status === 'upcoming').sort((a, b) => b.score - a.score || ((defGetEventDates(a.content).start || new Date(8640000000000000)) - (defGetEventDates(b.content).start || new Date(8640000000000000))));
    const past = matches.filter(item => item.status === 'past').sort((a, b) => b.score - a.score);
    // Keep recommendations focused: when a matching future/in-progress show exists, use it to drive attendance.
    // Only fall back to a relevant past show when no matching upcoming show exists.
    return upcoming.length ? upcoming.slice(0, limit) : past.slice(0, limit);
}

function defFindRelatedStoriesForEvent(event, eventStatus, limit = 3) {
    return storiesData.map((content, index) => {
        const match = defContentMatchScore(event, content);
        const explicit = defContentNameMatches(event && event.related_story_titles, content) ||
            defContentNameMatches(content && content.related_event_titles, event);
        const score = match.score + (explicit ? 20 : 0);
        if (score <= 0) return null;
        // Pre-show previews are not generic related-story suggestions. They are only surfaced
        // on the exact upcoming event they are linked to in the CMS.
        if (defIsPreShowStory(content)) {
            if (eventStatus === 'past' || !explicit) return null;
        }
        return { content, index, score };
    }).filter(Boolean).sort((a, b) => b.score - a.score || (defParseLocalDate(b.content.date) || new Date(0)) - (defParseLocalDate(a.content.date) || new Date(0))).slice(0, limit);
}

function defFindRelatedEventsForEvent(event, currentIndex, limit = 3) {
    const matches = eventsData.map((content, index) => {
        if (index === currentIndex) return null;
        const match = defContentMatchScore(event, content);
        const score = match.score + (defContentNameMatches(event && event.related_event_titles, content) ? 20 : 0);
        if (score <= 0) return null;
        const status = defGetEventStatus(content);
        if (status === 'past' && !defHasPastShowContent(content)) return null;
        return { content, index, status, score, badge: status === 'past' ? 'Past Trade Show · Recap' : 'Upcoming Trade Show' };
    }).filter(Boolean);
    const upcoming = matches.filter(item => item.status === 'upcoming').sort((a, b) => b.score - a.score);
    const past = matches.filter(item => item.status === 'past').sort((a, b) => b.score - a.score);
    // Promote future event attendance; historical shows appear only as a fallback.
    return upcoming.length ? upcoming.slice(0, limit) : past.slice(0, limit);
}

// ---------- Stories rendering ----------
function renderStories() {
    const container = document.getElementById('stories-list');
    if (!container) return;
    container.replaceChildren();
    defRenderStoriesFilters();

    if (!storiesData.length) {
        defShowMessage(container, 'No stories have been published yet. Please check back soon.');
        return;
    }

    const visibleStories = storiesData.map((story, index) => ({ story, index })).filter(({ story }) => {
        if (currentStoryCategory !== 'all' && defGetStoryCategory(story) !== currentStoryCategory) return false;
        if (currentStoryTopic !== 'all' && !defGetTopicTags(story).includes(currentStoryTopic)) return false;
        if (currentStoryIndustry !== 'all' && !defGetContentIndustries(story).includes(currentStoryIndustry)) return false;
        return true;
    });

    if (!visibleStories.length) {
        defShowMessage(container, 'No stories match these filters. Try another category, topic or industry.');
        return;
    }

    const grid = defElement('div', 'stories-grid');
    visibleStories.forEach(({ story, index }) => {
        const article = defElement('article', 'list-card story-card');
        article.tabIndex = 0;
        article.setAttribute('role', 'button');
        article.setAttribute('aria-label', 'Read story: ' + defSafeText(story.title, 160));

        const imageWrap = defElement('div', 'image-container');
        const image = defElement('img');
        image.src = defGetImageUrl(story.image, '/images/story-cover.jpg');
        image.alt = defSafeText(story.image_alt || story.title, 160);
        image.loading = 'lazy';
        image.decoding = 'async';
        image.onerror = () => { image.onerror = null; image.src = '/images/story-cover.jpg'; };
        imageWrap.appendChild(image);

        const info = defElement('div', 'list-info');
        const dateText = fmtDate(story.date || story.published_date);
        if (dateText) info.appendChild(defElement('span', 'date', dateText));
        info.appendChild(defElement('span', 'story-category-label', defGetStoryCategory(story)));
        info.appendChild(defElement('h3', '', story.title || 'Untitled story'));
        const summary = defSafeText(story.summary || story.excerpt || '', 600);
        if (summary) info.appendChild(defElement('p', 'story-summary', summary));

        const tagsList = defGetTopicTags(story).slice(0, 4);
        if (tagsList.length) {
            const tags = defElement('div', 'story-tags');
            tagsList.forEach(tag => tags.appendChild(defElement('span', 'kone-tag', tag)));
            info.appendChild(tags);
        }

        article.append(imageWrap, info);
        article.addEventListener('click', () => showStoryDetail(index));
        article.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showStoryDetail(index); }
        });
        grid.appendChild(article);
    });
    container.appendChild(grid);
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
    if (body) defRenderMarkdownInto(body, story.body || '');

    const category = document.getElementById('sd-category');
    if (category) { category.textContent = defGetStoryCategory(story); category.hidden = false; }
    const industry = document.getElementById('sd-industry');
    if (industry) {
        const values = defGetContentIndustries(story);
        industry.textContent = values.join(' · ');
        industry.hidden = !values.length;
    }
    const fictionalBadge = document.getElementById('sd-fictional-badge');
    if (fictionalBadge) {
        const isIllustrative = story.illustrative_example === true || story.content_format === 'Illustrative Use Case';
        fictionalBadge.hidden = !isIllustrative;
    }
    const tagsWrap = document.getElementById('sd-tags');
    if (tagsWrap) {
        tagsWrap.replaceChildren();
        defGetTopicTags(story).forEach(tag => tagsWrap.appendChild(defElement('span', 'kone-tag', tag)));
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

    const relatedStories = defIsLongForm(story) ? defFindRelatedStoriesForStory(story, index, 3) : [];
    const relatedEvents = defIsLongForm(story) ? defFindRelatedEventsForStory(story, 3) : [];
    defRenderRecommendationSection('sd-related-stories-section', 'sd-related-stories', relatedStories, 'story', 'Explore the Solution');
    defRenderRecommendationSection('sd-related-events-section', 'sd-related-events', relatedEvents, 'event', 'Explore Related Trade Shows');

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
    const dates = defGetEventDates(event || {});
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dates.end) return dates.end < today ? 'past' : 'upcoming';
    if (dates.start) return dates.start < today ? 'past' : 'upcoming';
    if (event && (event._contentType === 'report' || event.content_type === 'report' || event.type === 'report' || event.event_year || event.year)) return 'past';
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
        items = items.filter(item => defGetTopicTags(item.event).includes(currentEventsTopic));
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
        defGetTopicTags(event).forEach(tag => { if (tag) topics.add(tag); });
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

function defCreateMetaIcon(kind) {
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.classList.add('event-card-meta-icon');
    const addPath = (tag, attributes) => {
        const node = document.createElementNS(svgNs, tag);
        Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
        svg.appendChild(node);
    };
    if (kind === 'calendar') {
        addPath('rect', { x: 3, y: 5, width: 18, height: 16, rx: 2, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7 });
        addPath('path', { d: 'M16 3v4M8 3v4M3 10h18', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round' });
    } else {
        addPath('path', { d: 'M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7 });
        addPath('circle', { cx: 12, cy: 10, r: 2.4, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7 });
    }
    return svg;
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
    body.appendChild(defElement('span', 'event-status ' + (status === 'upcoming' ? 'is-upcoming' : 'is-past'), badgeLabel));
    body.appendChild(defElement('h3', 'event-title', event.title || 'Untitled event'));

    const booth = defSafeText(event.booth || '', 120);
    if (booth) {
        const boothBadge = defElement('p', 'event-card-booth');
        boothBadge.appendChild(defElement('span', 'event-card-booth-label', 'Booth'));
        boothBadge.appendChild(defElement('strong', 'event-card-booth-value', booth));
        body.appendChild(boothBadge);
    }

    const dates = defGetEventDates(event);
    const dateLabel = defFormatEventDate(event, dates);
    const location = defGetEventLocation(event);
    if (dateLabel || location) {
        const meta = defElement('div', 'event-card-meta');
        if (dateLabel) {
            const dateItem = defElement('span', 'event-card-meta-item');
            dateItem.appendChild(defCreateMetaIcon('calendar'));
            dateItem.appendChild(defElement('span', '', dateLabel));
            meta.appendChild(dateItem);
        }
        if (dateLabel && location) meta.appendChild(defElement('span', 'event-card-meta-separator', '·'));
        if (location) {
            const locationItem = defElement('span', 'event-card-meta-item');
            locationItem.appendChild(defCreateMetaIcon('location'));
            locationItem.appendChild(defElement('span', '', location));
            meta.appendChild(locationItem);
        }
        body.appendChild(meta);
    }

    const theme = defSafeText(event.theme || '', 250);
    if (theme) body.appendChild(defElement('p', 'event-card-theme', theme));
    const summary = defGetEventSummary(event);
    if (summary) body.appendChild(defElement('p', 'event-card-summary', summary));
    const tagWrap = defElement('div', 'recommendation-card-tags');
    defGetTopicTags(event).slice(0, 3).forEach(tag => tagWrap.appendChild(defElement('span', 'kone-tag', tag)));
    if (tagWrap.childElementCount) body.appendChild(tagWrap);

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
        defGetTopicTags(event).forEach(tag => { tags.appendChild(defElement('span', 'kone-tag', tag)); });
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
        addMeta('Booth', booth);
        addMeta('Date', dateLabel);
        addMeta('Location', location);
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
    if (bodyHeading) bodyHeading.textContent = status === 'past' ? 'Products & Solutions Showcased' : 'What We Will Showcase';

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
        const ctaEnabled = event.cta_enabled !== false;
        const hasRecap = Boolean(defPlainTextLength(event.body || event.recap || event.highlights || event.key_highlights || '') >= 80 || (Array.isArray(event.gallery) && event.gallery.length));
        if (status === 'upcoming' && ctaEnabled) {
            const ctaLabel = defSafeText(event.cta_label || 'Book a Meeting at This Show', 200);
            const cta = defElement('button', 'btn-y event-detail-cta', ctaLabel);
            cta.type = 'button';
            cta.addEventListener('click', () => openContact('contact_sales', titleText, ctaLabel, 'Trade Shows', 'Newsroom'));
            ctaContainer.appendChild(cta);
        } else if (status === 'past' && hasRecap) {
            const cta = defElement('button', 'btn-y event-detail-cta', 'Read Recap');
            cta.type = 'button';
            cta.addEventListener('click', () => {
                const target = document.getElementById(event.recap ? 'ed-recap-section' : (event.highlights || event.key_highlights ? 'ed-highlights-section' : 'ed-body-section'));
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            ctaContainer.appendChild(cta);
        } else if (status === 'past' && ctaEnabled) {
            const requestedLabel = defSafeText(event.cta_label || 'Talk to Our Team', 200);
            const ctaLabel = /book a meeting|book a demo/i.test(requestedLabel) ? 'Talk to Our Team' : requestedLabel;
            const cta = defElement('button', 'btn-y event-detail-cta', ctaLabel);
            cta.type = 'button';
            cta.addEventListener('click', () => openContact('contact_sales', titleText, ctaLabel, 'Trade Shows', 'Newsroom'));
            ctaContainer.appendChild(cta);
        }
    }

    const relatedStories = defFindRelatedStoriesForEvent(event, status, 3);
    const relatedEvents = defFindRelatedEventsForEvent(event, index, 3);
    defRenderRecommendationSection('ed-related-stories-section', 'ed-related-stories', relatedStories, 'story', 'Explore the Solutions');
    defRenderRecommendationSection('ed-related-events-section', 'ed-related-events', relatedEvents, 'event', 'Related Trade Shows');

    // Send only the existing content_view and virtual_page_view contracts; recommendation clicks do not add a new event.
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
        : tabItems.filter(item => defGetTopicTags(item.event).includes(currentEventsTopic));

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
        // Start attribution collection only from the time Analytics consent is granted.
        firstLandingPage = defGetFirstLandingPage();
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
        const analyticsConsent = defHasAnalyticsConsent();
        const attribution = defGetAttributionForSubmission();
        Object.assign(values, attribution, {
            analytics_consent: analyticsConsent ? 'true' : 'false',
            submission_id: submissionId, // Internal retry key only; never written into a Sheet column.
            // The following fields are attribution-only and remain blank when Analytics consent is denied.
            form_entry: analyticsConsent ? (currentLeadContext.formEntry || 'Home') : '',
            content_type: analyticsConsent ? (currentLeadContext.contentType || '') : '',
            content_title: analyticsConsent ? (currentLeadContext.contentTitle || '') : '',
            cta_label: analyticsConsent ? (currentLeadContext.ctaLabel || (currentLeadSource === 'book_demo' ? 'Book a Demo' : 'Contact Sales')) : ''
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
        const analyticsConsent = defHasAnalyticsConsent();
        const values = Object.assign(
            { email },
            defGetAttributionForSubmission(),
            {
                analytics_consent: analyticsConsent ? 'true' : 'false',
                submission_id: submissionId // Internal retry key only; never written into a Sheet column.
            }
        );

        try {
            await defPostForm(SITE_CONFIG.newsletterEndpoint || '/api/newsletter', values);
            if (!trackedSubmissionIds.has(submissionId)) {
                track('newsletter_signup');
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
    defApplyConsentToAttribution(event.detail || {});
});

document.addEventListener('DOMContentLoaded', () => {
    // Never persist a landing page or UTM before Analytics consent has been granted.
    if (defHasAnalyticsConsent()) {
        firstLandingPage = defGetFirstLandingPage();
        defCaptureUtmTouchIfAllowed();
    } else {
        defClearStoredAttribution();
    }
    initEventsControls();
    loadCloudData();
    initCookieConsent();
    initContactForm();
    initNewsletterForm();
});
