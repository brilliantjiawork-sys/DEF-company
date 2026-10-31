// DEF Company website behavior, UTM attribution, forms, Stories and Events.
// Business form submissions work even when analytics consent is denied.

const DEF_ATTRIBUTION_STORAGE_KEY = 'def_marketing_attribution_v4';
const DEF_LANDING_PAGE_STORAGE_KEY = 'def_first_landing_page_v1';
const DEF_UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];

// This is the action used internally by the shared sales form, not a Google Sheet column.
let currentLeadSource = 'contact_sales';
let currentLeadContext = { formEntry: 'Home', contentType: '', contentTitle: '', contentCategory: '', contentTopic: '', ctaLabel: 'Contact Sales', ctaLocation: 'Home Page' };
let firstLandingPage = '';
let pendingContactSubmissionId = '';
let pendingNewsletterSubmissionId = '';
const trackedSubmissionIds = new Set();
let storiesData = [];
let eventsData = [];
let currentEventsTopic = 'all';
let currentEventDetailIndex = null;
let currentStoryDetailIndex = null;
let currentStoryOrigin = 'stories';

// Page-level copy is managed separately from article/event records in the CMS.
let storiesPageSettings = {
    page_title: 'Explore our stories',
    page_intro: 'Explore industrial vision technology, applications and industry insights.',
    back_button: '← Back to Stories'
};
let tradeShowsPageSettings = {
    page_title: 'Trade Shows',
    page_intro: 'Explore upcoming exhibitions or browse trade show articles and technical highlights.',
    upcoming_tab_label: 'Upcoming',
    articles_tab_label: 'Trade Show Articles',
    articles_intro: 'Pre-show previews, during-show updates and post-show recaps.',
    back_button: '← Back to Trade Shows'
};

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
    if (['trade show article', 'trade show articles', 'event coverage'].includes(text)) return 'Trade Show Article';
    if (['upcoming trade show', 'upcoming show', 'trade show event'].includes(text)) return 'Upcoming Trade Show';
    if (['trade shows', 'trade show', 'event', 'events'].includes(text)) return 'Upcoming Trade Show';
    return '';
}

function defInferLeadContextFromCurrentView() {
    const activePage = document.querySelector('.page.active');
    if (activePage && activePage.id === 'contact' && currentLeadContext) {
        return Object.assign({}, currentLeadContext);
    }
    const inNewsroom = Boolean(activePage && activePage.id === 'newsroom');
    const result = {
        formEntry: inNewsroom ? 'Newsroom' : 'Home',
        contentType: '',
        contentTitle: '',
        contentCategory: '',
        contentTopic: '',
        ctaLocation: inNewsroom ? 'Newsroom Page' : 'Home Page'
    };
    const storyDetail = document.getElementById('view-story-detail');
    const tradeShowDetail = document.getElementById('view-event-detail');
    if (inNewsroom && storyDetail && storyDetail.classList.contains('active')) {
        const story = storiesData[currentStoryDetailIndex];
        if (story) {
            result.contentType = story.is_event_coverage ? 'Trade Show Article' : 'Story';
            result.contentTitle = defSafeText(story.title || '', 300);
            result.contentCategory = defGetAnalyticsContentCategory(story);
            result.contentTopic = defGetAnalyticsContentTopic(story);
            result.ctaLocation = story.is_event_coverage ? 'Trade Show Article CTA Area' : 'Story Detail CTA Area';
        }
        return result;
    }
    if (inNewsroom && tradeShowDetail && tradeShowDetail.classList.contains('active')) {
        const item = eventsData[currentEventDetailIndex];
        if (item) {
            result.contentType = defGetEventAnalyticsContentType(item);
            result.contentTitle = defSafeText(item.title || '', 300);
            result.contentTopic = defGetAnalyticsContentTopic(item);
            result.ctaLocation = defGetEventStatus(item) === 'upcoming' ? 'Upcoming Trade Show Detail' : 'Past Trade Show Detail';
        }
        return result;
    }
    return result;
}

function openContact(source, contentTitle, ctaLabel, contentType, sourceSection, ctaLocation, contentTopic, contentCategory) {
    // The visible CTA text and its physical page location are separate values.
    currentLeadSource = source === 'book_demo' ? 'book_demo' : 'contact_sales';
    const inferred = defInferLeadContextFromCurrentView();
    const suppliedEntry = sourceSection ? defNormalizeFormEntry(sourceSection) : inferred.formEntry;
    const entry = suppliedEntry || 'Home';
    const requestedType = defNormalizeContentType(contentType || inferred.contentType);
    const requestedTitle = defSafeText(contentTitle || inferred.contentTitle || '', 300);
    const hasContentContext = entry === 'Newsroom' && Boolean(requestedType && requestedTitle);
    const normalizedType = hasContentContext ? requestedType : '';
    const title = hasContentContext ? requestedTitle : '';
    const category = hasContentContext && normalizedType === 'Story'
        ? defSafeText(contentCategory || inferred.contentCategory || '', 100)
        : '';
    const topic = hasContentContext
        ? defSafeText(contentTopic || inferred.contentTopic || '', 1000)
        : '';
    const label = defSafeText(
        ctaLabel || (currentLeadSource === 'book_demo' ? 'Book a Demo' : 'Contact Sales'),
        200
    );
    const location = defSafeText(
        ctaLocation || inferred.ctaLocation || (entry === 'Newsroom' ? 'Newsroom Page' : 'Home Page'),
        100
    );
    currentLeadContext = {
        formEntry: entry,
        contentType: normalizedType,
        contentTitle: title,
        contentCategory: category,
        contentTopic: topic,
        ctaLabel: label,
        ctaLocation: location
    };
    track('cta_click', {
        form_entry: entry,
        content_type: normalizedType,
        content_title: title,
        content_category: category,
        content_topic: topic,
        cta_label: label,
        cta_location: location
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
        ? (currentStoryOrigin === 'events' ? 'events' : 'stories')
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

function defGetAnalyticsContentCategory(content) {
    // Only ordinary Story records have an editorial Content Category.
    // Trade Show Articles may contain a legacy CMS category, which must never be sent to GA4.
    if (!content || content.is_event_coverage) return '';
    return defSafeText(content.category || '', 100);
}

function defGetAnalyticsContentTopic(content) {
    // Preserve every CMS Topic Tag in one readable parameter value.
    return defGetTopicTags(content).join(' | ');
}

function defGetEventAnalyticsContentType(event) {
    return defGetEventStatus(event) === 'upcoming' ? 'Upcoming Trade Show' : 'Trade Show Article';
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

function defGetCoverageStage(content) {
    return defSafeText(content && (content.event_content_stage || content.content_stage || ''), 100).toLowerCase();
}

function defFindLinkedEventCoverage(event, stages) {
    const allowed = Array.isArray(stages) ? stages.map(value => String(value).toLowerCase()) : [];
    return storiesData.map((story, index) => ({ story, index })).filter(({ story }) => {
        if (!story || !story.is_event_coverage) return false;
        if (defContentMatchScore(event, story).sharedTags.length === 0) return false;
        const stage = defGetCoverageStage(story);
        if (allowed.length && !allowed.some(value => stage.includes(value))) return false;
        return defPlainTextLength(story.body || story.highlights || '') >= 80 || (Array.isArray(story.gallery) && story.gallery.length > 0);
    }).sort((a, b) => (defParseLocalDate(b.story.date) || new Date(0)) - (defParseLocalDate(a.story.date) || new Date(0)));
}

function defHasPastShowContent(event) {
    // Past show cards are useful only when the same topics appear in a published recap or live report.
    return defFindLinkedEventCoverage(event, ['post-show', 'during-show']).length > 0;
}

function defRenderFilterGroup(container, title, values, selected, onSelect, allLabel, id) {
    const group = defElement('div', 'stories-filter-group');
    const label = defElement('label', 'stories-filter-label', title);
    const select = defElement('select', 'stories-filter-select');
    select.id = id;
    select.setAttribute('aria-label', title);
    label.htmlFor = id;
    const options = [['all', allLabel], ...values.map(value => [value, value])];
    options.forEach(([value, optionLabel]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = optionLabel;
        option.selected = selected === value;
        select.appendChild(option);
    });
    select.addEventListener('change', () => onSelect(select.value));
    group.append(label, select);
    container.appendChild(group);
}

function defRenderStoriesFilters() {
    const container = document.getElementById('stories-filters');
    if (!container) return;
    container.replaceChildren();

    // Keep the full taxonomy selectable even before the first Story is published.
    const availableCategories = DEF_STORY_CATEGORIES.slice();
    const availableTopics = DEF_TOPIC_TAGS.slice().sort((a, b) => a.localeCompare(b));
    const availableIndustries = DEF_INDUSTRIES.slice().sort((a, b) => a.localeCompare(b));
    if (!availableCategories.includes(currentStoryCategory)) currentStoryCategory = 'all';
    if (!availableTopics.includes(currentStoryTopic)) currentStoryTopic = 'all';
    if (!availableIndustries.includes(currentStoryIndustry)) currentStoryIndustry = 'all';

    defRenderFilterGroup(container, 'Content Category', availableCategories, currentStoryCategory, value => {
        currentStoryCategory = value; renderStories();
    }, 'All categories', 'stories-category-filter');
    defRenderFilterGroup(container, 'Industry', availableIndustries, currentStoryIndustry, value => {
        currentStoryIndustry = value; renderStories();
    }, 'All industries', 'stories-industry-filter');
    defRenderFilterGroup(container, 'Topic', availableTopics, currentStoryTopic, value => {
        currentStoryTopic = value; renderStories();
    }, 'All topics', 'stories-topic-filter');
}

function defMakeRecommendationCard(content, index, type, badgeText) {
    const isStory = type === 'story';
    const card = defElement('article', 'recommendation-card ' + (isStory ? 'recommendation-card-story' : 'recommendation-card-related-event'));
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', (isStory ? 'Read story: ' : 'View trade show details: ') + defSafeText(content.title, 180));

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
    if (isStory) {
        const firstTopic = defGetTopicTags(content)[0] || '';
        const badge = firstTopic || badgeText || defGetStoryCategory(content);
        if (badge) body.appendChild(defElement('span', 'recommendation-card-kicker', badge));
        const dateLabel = fmtDate(content.date || content.published_date);
        if (dateLabel) body.appendChild(defElement('span', 'recommendation-card-date', dateLabel));
        body.appendChild(defElement('h4', 'recommendation-card-title', defSafeText(content.title, 300) || 'Untitled story'));
        const summary = defSafeText(content.summary || content.excerpt || '', 360);
        if (summary) {
            const summaryElement = defElement('p', 'recommendation-card-summary', summary);
            defApplyCmsFontSize(summaryElement, content.summary_font_size, 16, 14, 18, 1.65);
            body.appendChild(summaryElement);
        }
    } else {
        // Related-show cards stay concise and scannable: name, booth, date/location, then details.
        const eventTitle = defSafeText(content.title, 300) || 'Untitled trade show';
        body.appendChild(defElement('h4', 'recommendation-card-title', eventTitle));

        const booth = defSafeText(content.booth || content.booth_number || content.boothNumber || '', 100);
        if (booth) {
            const boothText = /^booth\b/i.test(booth) ? booth : 'Booth ' + booth;
            body.appendChild(defElement('div', 'recommendation-card-booth', boothText));
        }

        const dates = defGetEventDates(content);
        const dateLabel = defFormatEventDate(content, dates);
        const location = defGetEventLocation(content);
        const metadata = defElement('div', 'recommendation-card-event-meta');

        const makeMetaIcon = kind => {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('aria-hidden', 'true');
            svg.setAttribute('focusable', 'false');
            svg.setAttribute('class', 'recommendation-card-meta-icon');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', 'currentColor');
            path.setAttribute('stroke-width', '1.7');
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            path.setAttribute('d', kind === 'date'
                ? 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z'
                : 'M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z');
            svg.appendChild(path);
            return svg;
        };
        const appendMeta = (kind, value) => {
            if (!value) return;
            const row = defElement('div', 'recommendation-card-event-meta-item');
            row.appendChild(makeMetaIcon(kind));
            row.appendChild(defElement('span', 'recommendation-card-meta-value', value));
            metadata.appendChild(row);
        };
        appendMeta('date', dateLabel);
        appendMeta('location', location);
        if (metadata.childElementCount) body.appendChild(metadata);

        const cta = defElement('button', 'recommendation-card-cta', 'Explore Trade Show Details');
        cta.type = 'button';
        cta.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            showEventDetail(index);
        });
        body.appendChild(cta);
    }

    card.append(imageWrap, body);
    const activate = () => isStory ? showStoryDetail(index, content.is_event_coverage ? 'events' : 'stories') : showEventDetail(index);
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
    grid.classList.toggle('recommendation-grid-related-events', type === 'event');
    grid.classList.toggle('recommendation-grid-related-stories', type === 'story');
    grid.replaceChildren();
    (items || []).forEach(item => {
        if (type === 'event') {
            // Reuse the exact Upcoming/Past card layout; recommendations remain tag-match only.
            grid.appendChild(defMakeEventCard(item.content, item.index, item.status || defGetEventStatus(item.content), 'recommendation-event-card'));
        } else {
            grid.appendChild(defMakeRecommendationCard(item.content, item.index, type, item.badge || ''));
        }
    });
    section.hidden = emptyHide && !grid.childElementCount;
    const headingElement = section.querySelector('h3');
    if (headingElement && heading) headingElement.textContent = heading;
}

function defFindRelatedStoriesForStory(story, currentIndex, limit = 3) {
    // Explore the Solution contains regular Stories only, never event announcements or coverage articles.
    return storiesData.map((content, index) => {
        if (index === currentIndex || content.is_event_coverage || defIsPreShowStory(content)) return null;
        const match = defContentMatchScore(story, content);
        return match.sharedTags.length > 0 ? { content, index, score: match.score } : null;
    }).filter(Boolean)
      .sort((a, b) => b.score - a.score || (defParseLocalDate(b.content.date) || new Date(0)) - (defParseLocalDate(a.content.date) || new Date(0)))
      .slice(0, limit);
}

function defFindRelatedEventsForStory(story, limit = 3) {
    // Explore Related Trade Shows contains event cards only. It is independent from Story recommendations.
    const matches = eventsData.map((content, index) => {
        const match = defContentMatchScore(story, content);
        if (match.sharedTags.length === 0) return null;
        const status = defGetEventStatus(content);
        if (status === 'past' && !defHasPastShowContent(content)) return null;
        return { content, index, status, score: match.score, badge: status === 'past' ? 'Past Show · Relevant Recap' : 'Upcoming' };
    }).filter(Boolean);
    const upcoming = matches.filter(item => item.status === 'upcoming')
        .sort((a, b) => b.score - a.score || ((defGetEventDates(a.content).start || new Date(8640000000000000)) - (defGetEventDates(b.content).start || new Date(8640000000000000))));
    const past = matches.filter(item => item.status === 'past').sort((a, b) => b.score - a.score);
    return [...upcoming, ...past].slice(0, limit);
}

function defFindRelatedStoriesForEvent(event, eventStatus, limit = 3) {
    // A show detail can recommend relevant regular Stories, never other show articles.
    return storiesData.map((content, index) => {
        if (content.is_event_coverage || defIsPreShowStory(content)) return null;
        const match = defContentMatchScore(event, content);
        return match.sharedTags.length > 0 ? { content, index, score: match.score } : null;
    }).filter(Boolean)
      .sort((a, b) => b.score - a.score || (defParseLocalDate(b.content.date) || new Date(0)) - (defParseLocalDate(a.content.date) || new Date(0)))
      .slice(0, limit);
}

function defFindRelatedEventsForEvent(event, currentIndex, limit = 3) {
    const matches = eventsData.map((content, index) => {
        if (index === currentIndex) return null;
        const match = defContentMatchScore(event, content);
        if (match.sharedTags.length === 0) return null;
        const status = defGetEventStatus(content);
        if (status === 'past' && !defHasPastShowContent(content)) return null;
        return { content, index, status, score: match.score, badge: status === 'past' ? 'Past Show · Relevant Recap' : 'Upcoming' };
    }).filter(Boolean);
    const upcoming = matches.filter(item => item.status === 'upcoming').sort((a, b) => b.score - a.score);
    const past = matches.filter(item => item.status === 'past').sort((a, b) => b.score - a.score);
    return upcoming.length ? upcoming.slice(0, limit) : past.slice(0, limit);
}



// ---------- Stories rendering ----------
function renderStories() {
    const container = document.getElementById('stories-list');
    if (!container) return;
    container.replaceChildren();
    defRenderStoriesFilters();

    if (!storiesData.some(story => !story.is_event_coverage)) {
        defShowMessage(container, 'No Stories have been published yet. Add a Story in CMS; its content category, topic tags and industry selections will appear here automatically.');
        return;
    }

    const visibleStories = storiesData.map((story, index) => ({ story, index })).filter(({ story }) => {
        if (story.is_event_coverage) return false;
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
        // Editorial cards show date, title and summary only. Category, industry and topic tags
        // remain available in the article detail page and as filters; don't stack taxonomies on cards.
        info.appendChild(defElement('h3', 'story-card-title', story.title || 'Untitled story'));
        const summary = defSafeText(story.summary || story.excerpt || '', 600);
        if (summary) {
            const summaryElement = defElement('p', 'story-summary', summary);
            defApplyCmsFontSize(summaryElement, story.summary_font_size, 16, 14, 18, 1.65);
            info.appendChild(summaryElement);
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
function showStoryDetail(index, origin = 'stories') {
    const story = storiesData[index];
    if (!story) return;
    currentStoryDetailIndex = index;
    currentStoryOrigin = story.is_event_coverage ? 'events' : origin;
    const backLink = document.getElementById('story-detail-back');
    if (backLink) {
        backLink.textContent = currentStoryOrigin === 'events' ? tradeShowsPageSettings.back_button : storiesPageSettings.back_button;
        backLink.onclick = () => switchView(currentStoryOrigin === 'events' ? 'events' : 'stories');
    }

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
    if (title) {
        title.textContent = story.title || 'Untitled story';
        defApplyCmsFontSize(title, story.detail_title_font_size, 34, 28, 42, 1.2);
    }
    if (summary) {
        summary.textContent = defSafeText(story.summary || story.excerpt || '', 1000);
        summary.hidden = !summary.textContent;
        defApplyCmsFontSize(summary, story.summary_font_size, 16, 14, 18, 1.7);
    }
    if (body) {
        defRenderMarkdownInto(body, story.body || '');
        defApplyCmsFontSize(body, story.body_font_size, 17, 14, 20, 1.8);
    }

    const category = document.getElementById('sd-category');
    const categoryMeta = document.getElementById('sd-category-meta');
    if (category) {
        // Trade Show Articles use Industry + Topics only; the Story content-focus taxonomy is not applicable.
        const categoryValue = story.is_event_coverage ? '' : defGetStoryCategory(story);
        category.textContent = categoryValue;
        category.hidden = !categoryValue;
        if (categoryMeta) categoryMeta.hidden = !categoryValue;
    }
    const industry = document.getElementById('sd-industry');
    const industryMeta = document.getElementById('sd-industry-meta');
    if (industry) {
        const values = defGetContentIndustries(story);
        industry.textContent = values.join(' · ');
        industry.hidden = !values.length;
        if (industryMeta) industryMeta.hidden = !values.length;
    }
    const fictionalBadge = document.getElementById('sd-fictional-badge');
    if (fictionalBadge) {
        const isIllustrative = story.illustrative_example === true || story.content_format === 'Illustrative Use Case';
        fictionalBadge.hidden = !isIllustrative;
    }
    const tagsWrap = document.getElementById('sd-tags');
    const topicsMeta = document.getElementById('sd-topics-meta');
    if (tagsWrap) {
        tagsWrap.replaceChildren();
        defGetTopicTags(story).forEach(tag => tagsWrap.appendChild(defElement('span', 'kone-tag', tag)));
        if (topicsMeta) topicsMeta.hidden = !tagsWrap.childElementCount;
    }

    const storyCtaContainer = document.getElementById('sd-cta');
    if (storyCtaContainer) {
        storyCtaContainer.replaceChildren();
        if (story.cta_enabled === true) {
            const ctaLabel = defSafeText(story.cta_label || 'Talk to our team', 200);
            const storyCta = defElement('button', 'btn-y event-detail-cta', ctaLabel);
            storyCta.type = 'button';
            storyCta.addEventListener('click', () => openContact('contact_sales', story.title || '', ctaLabel, story.is_event_coverage ? 'Trade Show Article' : 'Story', 'Newsroom', story.is_event_coverage ? 'Trade Show Article CTA Area' : 'Story Detail CTA Area', defGetAnalyticsContentTopic(story), defGetAnalyticsContentCategory(story)));
            storyCtaContainer.appendChild(storyCta);
        }
    }

    const relatedStories = defIsLongForm(story) ? defFindRelatedStoriesForStory(story, index, 3) : [];
    const relatedEvents = defIsLongForm(story) ? defFindRelatedEventsForStory(story, 3) : [];
    defRenderRecommendationSection('sd-related-stories-section', 'sd-related-stories', relatedStories, 'story', 'Explore the Solution');
    defRenderRecommendationSection('sd-related-events-section', 'sd-related-events', relatedEvents, 'event', 'Explore Related Trade Shows');

    switchView('story-detail');
    track('content_view', {
        content_type: story.is_event_coverage ? 'Trade Show Article' : 'Story',
        content_title: defSafeText(story.title || 'Untitled story', 300),
        content_category: defGetAnalyticsContentCategory(story),
        content_topic: defGetAnalyticsContentTopic(story)
    });
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

function initEventsControls() {
    // Topic controls are bound by defRenderEventTopicFilters. The old Upcoming/Past tabs were removed.
    return;
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

function defMakeEventCard(event, index, status, extraClass = '') {
    const card = defElement('article', 'event-card' + (extraClass ? ' ' + extraClass : ''));

    // Full-width image: preserve the uploaded asset's intrinsic aspect ratio.
    const imageWrap = defElement('div', 'event-card-image');
    const image = defElement('img');
    image.alt = defSafeText(event.cover_alt || event.title, 180);
    image.loading = 'lazy';
    image.decoding = 'async';
    image.src = defGetImageUrl(event.cover || event.image, '/images/event-1.jpg');
    imageWrap.appendChild(image);

    const body = defElement('div', 'event-card-body');
    const badgeLabel = status === 'upcoming' ? 'Upcoming' : 'Past';
    body.appendChild(defElement('span', 'event-status ' + (status === 'upcoming' ? 'is-upcoming' : 'is-past'), badgeLabel));

    body.appendChild(defElement('h3', 'event-title', event.title || 'Untitled event'));

    // Booth is intentionally shown before date and location.
    const booth = defSafeText(event.booth || event.booth_number || '', 120);
    if (booth) {
        const boothItem = defElement('div', 'event-card-booth');
        boothItem.appendChild(defElement('span', 'event-card-booth-label', 'Booth'));
        boothItem.appendChild(defElement('span', 'event-card-booth-value', booth));
        body.appendChild(boothItem);
    }

    const dates = defGetEventDates(event);
    const dateLabel = defFormatEventDate(event, dates);
    const location = defGetEventLocation(event);
    if (dateLabel || location) {
        const meta = defElement('div', 'event-card-meta');
        if (dateLabel) {
            const dateItem = defElement('span', 'event-card-meta-item');
            dateItem.appendChild(defCreateMetaIcon('calendar'));
            dateItem.appendChild(defElement('span', 'event-card-meta-value', dateLabel));
            meta.appendChild(dateItem);
        }
        if (location) {
            const locationItem = defElement('span', 'event-card-meta-item');
            locationItem.appendChild(defCreateMetaIcon('location'));
            locationItem.appendChild(defElement('span', 'event-card-meta-value', location));
            meta.appendChild(locationItem);
        }
        body.appendChild(meta);
    }

    const topics = defGetTopicTags(event);
    if (topics.length) {
        const topicWrap = defElement('div', 'event-card-topics');
        topicWrap.setAttribute('aria-label', 'Topics');
        topics.forEach(topic => topicWrap.appendChild(defElement('span', 'event-card-topic', topic)));
        body.appendChild(topicWrap);
    }

    if (status === 'upcoming' && event.cta_enabled !== false) {
        const ctaLabel = defSafeText(event.cta_label || 'Book a Meeting', 200);
        const actions = defElement('div', 'event-card-actions');
        const ctaButton = defElement('button', 'btn-y event-card-cta', ctaLabel);
        ctaButton.type = 'button';
        ctaButton.addEventListener('click', () => openContact(
            'contact_sales',
            defSafeText(event.title || '', 300),
            ctaLabel,
            'Upcoming Trade Show',
            'Newsroom',
            'Upcoming Trade Show Card',
            defGetAnalyticsContentTopic(event),
            ''
        ));
        actions.appendChild(ctaButton);
        body.appendChild(actions);
    }

    card.append(imageWrap, body);
    return card;
}

function defSetOptionalText(id, value) {
    const element = document.getElementById(id);
    if (!element) return;
    const text = defSafeText(value, 5000);
    element.textContent = text;
    element.hidden = !text;
}

function defApplyCmsFontSize(element, value, fallback = 16, min = 12, max = 22, lineHeight = 1.65) {
    if (!element) return;
    const parsed = Number.parseInt(String(value ?? ''), 10);
    const size = Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
    element.style.fontSize = size + 'px';
    element.style.lineHeight = String(lineHeight);
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
        cover.alt = defSafeText(event.cover_alt || titleText, 300);
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
    defApplyCmsFontSize(document.getElementById('ed-title'), event.detail_title_font_size, 34, 28, 42, 1.2);
    const eventSummaryText = defGetEventSummary(event);
    defSetOptionalText('ed-summary', eventSummaryText);
    const eventDescriptionSection = document.getElementById('ed-description-section');
    if (eventDescriptionSection) eventDescriptionSection.hidden = !eventSummaryText;
    defApplyCmsFontSize(document.getElementById('ed-summary'), event.description_font_size, 16, 14, 20, 1.75);

    const industryWrap = document.getElementById('ed-industry');
    const industryMeta = document.getElementById('ed-industry-meta');
    if (industryWrap) {
        industryWrap.replaceChildren();
        defGetContentIndustries(event).forEach(value => industryWrap.appendChild(defElement('span', 'story-industry-chip', value)));
        if (industryMeta) industryMeta.hidden = !industryWrap.childElementCount;
    }

    const tags = document.getElementById('ed-tags');
    const topicsMeta = document.getElementById('ed-topics-meta');
    if (tags) {
        tags.replaceChildren();
        defGetTopicTags(event).forEach(tag => { tags.appendChild(defElement('span', 'kone-tag', tag)); });
        if (topicsMeta) topicsMeta.hidden = !tags.childElementCount;
    }

    const meta = document.getElementById('ed-meta');
    if (meta) {
        meta.replaceChildren();
        const dateLabel = defFormatEventDate(event, dates);
        const location = defGetEventLocation(event);
        const booth = defSafeText(event.booth || '', 160);
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
        meta.hidden = !meta.childElementCount;
    }

    const highlightsSection = document.getElementById('ed-highlights-section');
    const highlights = document.getElementById('ed-highlights');
    if (highlightsSection && highlights) {
        const highlightValue = event.highlights || event.key_highlights || event.highlights_markdown || '';
        defRenderMarkdownInto(highlights, Array.isArray(highlightValue) ? highlightValue.map(x => '- ' + String(x)).join('\n') : highlightValue);
        defApplyCmsFontSize(highlights, event.body_font_size, 16, 14, 20, 1.8);
        highlightsSection.hidden = !String(Array.isArray(highlightValue) ? highlightValue.join('') : highlightValue).trim();
    }

    const bodySection = document.getElementById('ed-body-section');
    const bodyHeading = document.getElementById('ed-body-heading');
    const body = document.getElementById('ed-body');
    const longBody = defSafeText(event.body || event.article_body || '', 50000);
    if (body) {
        defRenderMarkdownInto(body, longBody);
        defApplyCmsFontSize(body, event.body_font_size, 16, 14, 20, 1.8);
    }
    if (bodySection) bodySection.hidden = !longBody;
    if (bodyHeading) bodyHeading.textContent = status === 'past' ? 'Products & Solutions Showcased' : 'What We Will Showcase';

    const recapSection = document.getElementById('ed-recap-section');
    const recap = document.getElementById('ed-recap');
    const recapText = status === 'past' ? defSafeText(event.recap || '', 30000) : '';
    if (recap) {
        defRenderMarkdownInto(recap, recapText);
        defApplyCmsFontSize(recap, event.body_font_size, 16, 14, 20, 1.8);
    }
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
        const linkedRecaps = status === 'past' ? defFindLinkedEventCoverage(event, ['post-show']) : [];
        const linkedDuringUpdates = status === 'past' ? defFindLinkedEventCoverage(event, ['during-show']) : [];
        const hasRecap = Boolean(defPlainTextLength(event.body || event.recap || event.highlights || event.key_highlights || '') >= 80 || (Array.isArray(event.gallery) && event.gallery.length) || linkedRecaps.length || linkedDuringUpdates.length);
        if (status === 'upcoming' && ctaEnabled) {
            const ctaLabel = defSafeText(event.cta_label || 'Book a Meeting at This Show', 200);
            const cta = defElement('button', 'btn-y event-detail-cta', ctaLabel);
            cta.type = 'button';
            cta.addEventListener('click', () => openContact('contact_sales', titleText, ctaLabel, defGetEventAnalyticsContentType(event), 'Newsroom', status === 'upcoming' ? 'Upcoming Trade Show Detail' : 'Past Trade Show Detail', defGetAnalyticsContentTopic(event), ''));
            ctaContainer.appendChild(cta);
        } else if (status === 'past' && hasRecap) {
            const cta = defElement('button', 'btn-y event-detail-cta', 'Read Related Recap');
            cta.type = 'button';
            cta.addEventListener('click', () => {
                const linkedContent = linkedRecaps[0] || linkedDuringUpdates[0];
                if (linkedContent) {
                    showStoryDetail(linkedContent.index, 'events');
                    return;
                }
                const target = document.getElementById(event.recap ? 'ed-recap-section' : (event.highlights || event.key_highlights ? 'ed-highlights-section' : 'ed-body-section'));
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            ctaContainer.appendChild(cta);
        } else if (status === 'past' && ctaEnabled) {
            const requestedLabel = defSafeText(event.cta_label || 'Talk to Our Team', 200);
            const ctaLabel = /book a meeting|book a demo/i.test(requestedLabel) ? 'Talk to Our Team' : requestedLabel;
            const cta = defElement('button', 'btn-y event-detail-cta', ctaLabel);
            cta.type = 'button';
            cta.addEventListener('click', () => openContact('contact_sales', titleText, ctaLabel, defGetEventAnalyticsContentType(event), 'Newsroom', status === 'upcoming' ? 'Upcoming Trade Show Detail' : 'Past Trade Show Detail', defGetAnalyticsContentTopic(event), ''));
            ctaContainer.appendChild(cta);
        }
    }

    const relatedStories = defFindRelatedStoriesForEvent(event, status, 3);
    const relatedEvents = defFindRelatedEventsForEvent(event, index, 3);
    defRenderRecommendationSection('ed-related-stories-section', 'ed-related-stories', relatedStories, 'story', 'Explore the Solution');
    defRenderRecommendationSection('ed-related-events-section', 'ed-related-events', relatedEvents, 'event', 'Explore Related Trade Shows');

    // Send only the existing content_view and virtual_page_view contracts; recommendation clicks do not add a new event.
    switchView('event-detail', { suppressVirtualPageView: true });
    track('content_view', {
        content_type: defGetEventAnalyticsContentType(event),
        content_title: titleText,
        content_category: '',
        content_topic: defGetAnalyticsContentTopic(event)
    });
    defTrackVirtualPageView('/newsroom/events/' + encodeURIComponent(slug), titleText);
}

function switchTradeShowTab(tab) {
    const upcomingSelected = tab !== 'articles';
    const upcomingPanel = document.getElementById('events-upcoming-panel');
    const articlesPanel = document.getElementById('event-articles-panel');
    const upcomingTab = document.getElementById('tab-upcoming-shows');
    const articlesTab = document.getElementById('tab-trade-show-articles');
    if (!upcomingPanel || !articlesPanel || !upcomingTab || !articlesTab) return;

    upcomingPanel.hidden = !upcomingSelected;
    articlesPanel.hidden = upcomingSelected;
    upcomingTab.classList.toggle('is-active', upcomingSelected);
    articlesTab.classList.toggle('is-active', !upcomingSelected);
    upcomingTab.setAttribute('aria-selected', String(upcomingSelected));
    articlesTab.setAttribute('aria-selected', String(!upcomingSelected));
}

function renderEvents() {
    const container = document.getElementById('events-list');
    if (!container) return;
    container.replaceChildren();

    const upcoming = eventsData.map((event, index) => ({ event, index, status: defGetEventStatus(event) }))
        .filter(item => item.status === 'upcoming')
        .sort((a, b) => {
            const aDate = defGetEventDates(a.event).start;
            const bDate = defGetEventDates(b.event).start;
            return (aDate ? aDate.getTime() : Number.MAX_SAFE_INTEGER) - (bDate ? bDate.getTime() : Number.MAX_SAFE_INTEGER);
        });
    defRenderEventTopicFilters(upcoming);
    const visible = currentEventsTopic === 'all' ? upcoming : upcoming.filter(item => defGetTopicTags(item.event).includes(currentEventsTopic));
    if (!visible.length) {
        defShowMessage(container, 'No upcoming trade shows match these topics yet.');
    } else {
        const grid = defElement('div', 'events-grid');
        visible.forEach(item => grid.appendChild(defMakeEventCard(item.event, item.index, 'upcoming')));
        container.appendChild(grid);
    }
    renderEventCoverageArticles();
}

function renderEventCoverageArticles() {
    const container = document.getElementById('event-coverage-list');
    if (!container) return;
    container.replaceChildren();
    const articles = storiesData.map((story, index) => ({ story, index }))
        .filter(item => item.story && item.story.is_event_coverage)
        .sort((a, b) => (defParseLocalDate(b.story.date) || new Date(0)) - (defParseLocalDate(a.story.date) || new Date(0)));
    if (!articles.length) {
        defShowMessage(container, 'No trade show articles have been published yet. Add a pre-show preview, during-show update or post-show recap in CMS.');
        return;
    }
    const grid = defElement('div', 'event-coverage-grid');
    articles.forEach(({ story, index }) => {
        const card = defElement('article', 'event-coverage-card');
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', 'Read trade show article: ' + defSafeText(story.title, 180));
        const imageWrap = defElement('div', 'event-coverage-card-image');
        const image = defElement('img');
        image.src = defGetImageUrl(story.image, '/images/story-cover.jpg');
        image.alt = defSafeText(story.image_alt || story.title, 180);
        image.loading = 'lazy';
        image.decoding = 'async';
        image.onerror = () => { image.onerror = null; image.src = '/images/story-cover.jpg'; };
        imageWrap.appendChild(image);
        const body = defElement('div', 'event-coverage-card-body');
        const stage = defSafeText(story.event_content_stage || story.content_stage || 'Trade Show Article', 100);
        body.appendChild(defElement('span', 'event-stage-badge', stage));
        const date = fmtDate(story.date || story.published_date);
        if (date) body.appendChild(defElement('span', 'date', date));
        body.appendChild(defElement('h3', '', defSafeText(story.title || 'Untitled trade show article', 300)));
        const summary = defSafeText(story.summary || story.excerpt || '', 500);
        if (summary) body.appendChild(defElement('p', 'story-summary', summary));
        // Keep topic tags on the article detail page, not on the list card.
        card.append(imageWrap, body);
        card.addEventListener('click', () => showStoryDetail(index, 'events'));
        card.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showStoryDetail(index, 'events'); }
        });
        grid.appendChild(card);
    });
    container.appendChild(grid);
}


function defIsPublishedContent(item) {
    const status = String(item && (item.status || item.publication_status) || 'published').trim().toLowerCase();
    return !['draft', 'unpublished'].includes(status);
}

async function defLoadEventCoverage() {
    const path = '/data/event-coverage.json';
    try {
        const response = await fetch(path, { cache: 'no-store' });
        if (!response.ok) throw new Error(path + ' returned ' + response.status);
        const data = await response.json();
        const validStages = ['Pre-show Preview', 'During-show Update', 'Post-show Recap'];
        return (Array.isArray(data.articles) ? data.articles : []).filter(defIsPublishedContent).map(article => {
            const stage = validStages.includes(article.content_stage) ? article.content_stage : 'Post-show Recap';
            return Object.assign({}, article, {
                event_content_stage: stage,
                is_event_coverage: true,
                content_format: 'Trade Show Coverage'
            });
        });
    } catch (error) {
        console.warn('Trade show articles could not be loaded:', path, error);
        return [];
    }
}



async function defLoadPageSettings() {
    const loadJson = async (path) => {
        try {
            const response = await fetch(path, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.warn('CMS page settings could not be loaded:', path, error);
            return null;
        }
    };

    const [storiesSettings, eventsSettings] = await Promise.all([
        loadJson('/data/stories-page-settings.json'),
        loadJson('/data/trade-shows-page-settings.json')
    ]);
    if (storiesSettings && typeof storiesSettings === 'object') {
        storiesPageSettings = { ...storiesPageSettings, ...storiesSettings };
    }
    if (eventsSettings && typeof eventsSettings === 'object') {
        tradeShowsPageSettings = { ...tradeShowsPageSettings, ...eventsSettings };
        // Normalize the old default label so legacy CMS settings do not restore the longer wording.
        if (tradeShowsPageSettings.upcoming_tab_label === 'Upcoming Trade Shows') {
            tradeShowsPageSettings.upcoming_tab_label = 'Upcoming';
        }
    }

    const setText = (id, value) => {
        const element = document.getElementById(id);
        const text = defSafeText(value, 500);
        if (element && text) element.textContent = text;
    };
    setText('stories-page-title', storiesPageSettings.page_title);
    setText('stories-page-intro', storiesPageSettings.page_intro);
    setText('events-page-title', tradeShowsPageSettings.page_title);
    setText('events-page-intro', tradeShowsPageSettings.page_intro);
    setText('tab-upcoming-shows', 'Upcoming');
    setText('tab-trade-show-articles', tradeShowsPageSettings.articles_tab_label);
    setText('event-articles-intro', tradeShowsPageSettings.articles_intro);
    setText('event-detail-back', tradeShowsPageSettings.back_button);
}

async function loadCloudData() {
    const storiesContainer = document.getElementById('stories-list');
    const eventsContainer = document.getElementById('events-list');

    try {
        const response = await fetch('/data/database.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('Could not load stories data');
        const data = await response.json();
        storiesData = (Array.isArray(data.articles) ? data.articles : []).filter(defIsPublishedContent);
        const coverageArticles = await defLoadEventCoverage();
        storiesData = storiesData.concat(coverageArticles);
        renderStories();
    } catch (error) {
        console.error('Stories data could not be loaded:', error);
        defShowMessage(storiesContainer, 'Stories could not be loaded right now. Please try again later.');
    }

    try {
        const response = await fetch('/data/events.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('Could not load events data');
        const data = await response.json();
        eventsData = defNormalizeEventsPayload(data);
        renderEvents();
    } catch (error) {
        console.error('Events data could not be loaded:', error);
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
            content_topic: analyticsConsent ? (currentLeadContext.contentTopic || '') : '',
            cta_location: analyticsConsent ? (currentLeadContext.ctaLocation || '') : '',
            cta_label: analyticsConsent ? (currentLeadContext.ctaLabel || (currentLeadSource === 'book_demo' ? 'Book a Demo' : 'Contact Sales')) : ''
        });

        try {
            await defPostForm(SITE_CONFIG.contactEndpoint || '/api/contact', values);
            if (!trackedSubmissionIds.has(submissionId)) {
                track('generate_lead', {
                    form_entry: currentLeadContext.formEntry || 'Home',
                    content_type: currentLeadContext.contentType || '',
                    content_title: currentLeadContext.contentTitle || '',
                    content_category: currentLeadContext.contentCategory || '',
                    content_topic: currentLeadContext.contentTopic || '',
                    cta_location: currentLeadContext.ctaLocation || '',
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
    defLoadPageSettings();
    loadCloudData();
    initCookieConsent();
    initContactForm();
    initNewsletterForm();
});
