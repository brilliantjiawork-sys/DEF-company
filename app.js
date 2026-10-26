// ==========================================
// 页面切换
// ==========================================
function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if(id === 'newsroom') switchView('ov');
    window.scrollTo(0, 0);
}

// 从导航栏 "Contact Sales" 或首页 "Book a Demo" 进入表单时，记录入口来源
// （两个入口共用同一张表单，用 lead_source 区分哪个按钮带来的线索）
let currentLeadSource = 'contact_sales';
function openContact(source) {
    currentLeadSource = source || 'contact_sales';

    // 如果上一次提交后停在"成功页"，重新进入时把表单恢复，方便再次提交/测试
    const box  = document.getElementById('form-container-box');
    const done = document.getElementById('success-screen');
    const form = document.getElementById('detailed-contact-form');
    if (done && done.style.display === 'block') {
        done.style.display = '';
        if (box) box.style.display = '';
        if (form) {
            form.reset();
            const b = form.querySelector('button[type="submit"]');
            if (b) { b.disabled = false; b.innerText = 'Submit Inquiry'; }
        }
    }
    showPage('contact');
}

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById('view-' + viewId);
    if (view) view.classList.add('active');
    document.querySelectorAll('.nr-sidebar a').forEach(a => a.classList.remove('active'));
    const navKey = (viewId === 'story-detail') ? 'stories' : ((viewId === 'event-detail') ? 'events' : viewId);
    const navEl = document.getElementById('nav-' + navKey);
    if (navEl) navEl.classList.add('active');
    window.scrollTo(0, 80);
}

// 英文网站统一用英文日期格式（原来跟随浏览器语言，中文电脑会显示 2026/10/25）
function fmtDate(d) {
    const dt = (typeof defParseLocalDate === 'function') ? defParseLocalDate(d) : new Date(d);
    if (!dt || isNaN(dt)) return '';
    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ==========================================
// 数据追踪：统一往 dataLayer 推事件
// 事件名只用小写字母 + 下划线（GA4 规范）
// 不再使用 'gtm.formSubmit' 这个名字——它和 GTM 自带的表单监听同名，会导致重复触发
// ==========================================
function track(eventName, params) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: eventName }, params || {}));
}

// ==========================================
// 加载 CMS 内容
// ==========================================
let storiesData = [];
let eventsData = [];
let activeStoryFilter = 'All topics';

function defSafeText(value, maxLength = 2000) {
    if (value === null || value === undefined) return '';
    return String(value).trim().slice(0, maxLength);
}

function defElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
}

// Render CMS Markdown only after sanitizing its HTML output. Marked by itself does not sanitize HTML.
function defRenderMarkdown(markdown) {
    const source = String(markdown || '');
    if (window.marked && typeof window.marked.parse === 'function' && window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
        return window.DOMPurify.sanitize(window.marked.parse(source), { USE_PROFILES: { html: true } });
    }
    return null;
}

function defShowMessage(container, message) {
    if (!container) return;
    container.replaceChildren(defElement('p', 'content-status-message', message));
}

function defGetImageUrl(value, fallback = '') {
    const raw = defSafeText(value, 1200);
    if (!raw) return fallback;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return fallback;
    if (raw.startsWith('/')) return raw;
    return '/' + raw.replace(/^\.\//, '').replace(/^\/+/, '');
}

function defParseLocalDate(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const text = String(value).trim();
    const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
        const date = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
        return Number.isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
}

// Load CMS data
async function loadCloudData() {
    const storiesContainer = document.getElementById('stories-list');
    const eventsContainer = document.getElementById('events-list');

    try {
        const response = await fetch('/data/database.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('Could not load stories data');
        const data = await response.json();
        storiesData = Array.isArray(data.articles) ? data.articles : [];
        renderStoryFilters();
        renderStories();
    } catch (error) {
        console.error('Stories data could not be loaded.', error);
        defShowMessage(storiesContainer, 'Stories could not be loaded right now. Please try again later.');
    }

    try {
        const response = await fetch('/data/events.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('Could not load events data');
        const data = await response.json();
        eventsData = Array.isArray(data.exhibitions) ? data.exhibitions : [];
        renderEvents();
    } catch (error) {
        console.error('Events data could not be loaded.', error);
        defShowMessage(eventsContainer, 'Events could not be loaded right now. Please try again later.');
    }
}

// Build topics from tags on published CMS stories. Unused CMS options stay hidden until used.
function defGetStoryTopics() {
    const topics = new Set();
    storiesData.forEach((story) => {
        (Array.isArray(story.tags) ? story.tags : []).forEach((tag) => {
            const topic = defSafeText(tag, 80);
            if (topic) topics.add(topic);
        });
    });
    return Array.from(topics).sort((a, b) => a.localeCompare(b));
}

function renderStoryFilters() {
    const container = document.getElementById('stories-filters');
    if (!container) return;
    container.replaceChildren();

    const topics = ['All topics', ...defGetStoryTopics()];
    if (!topics.includes(activeStoryFilter)) activeStoryFilter = 'All topics';

    topics.forEach((topic) => {
        const button = defElement('button', 'story-filter', topic);
        button.type = 'button';
        button.setAttribute('aria-pressed', String(topic === activeStoryFilter));
        if (topic === activeStoryFilter) button.classList.add('is-active');
        button.addEventListener('click', () => {
            activeStoryFilter = topic;
            renderStoryFilters();
            renderStories();
        });
        container.appendChild(button);
    });
}

function renderStories() {
    const container = document.getElementById('stories-list');
    if (!container) return;
    container.replaceChildren();

    if (!storiesData.length) {
        defShowMessage(container, 'No stories have been published yet. Please check back soon.');
        return;
    }

    const visibleStories = activeStoryFilter === 'All topics'
        ? storiesData
        : storiesData.filter((story) => Array.isArray(story.tags) && story.tags.includes(activeStoryFilter));

    if (!visibleStories.length) {
        defShowMessage(container, 'No stories found for this topic yet.');
        return;
    }

    visibleStories.forEach((story) => {
        const originalIndex = storiesData.indexOf(story);
        const card = defElement('article', 'list-card story-card');
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', 'Read story: ' + defSafeText(story.title, 160));

        const imageWrap = defElement('div', 'image-container');
        const image = defElement('img');
        image.src = defGetImageUrl(story.image, '/images/story-cover.jpg');
        image.alt = defSafeText(story.title, 160);
        image.loading = 'lazy';
        image.onerror = () => { image.onerror = null; image.src = '/images/story-cover.jpg'; };
        imageWrap.appendChild(image);

        const info = defElement('div', 'list-info');
        const dateLabel = fmtDate(story.date);
        if (dateLabel) info.appendChild(defElement('span', 'date', dateLabel));
        info.appendChild(defElement('h4', '', story.title || 'Untitled story'));

        const summary = defSafeText(story.summary || story.excerpt || '', 600);
        if (summary) info.appendChild(defElement('p', 'story-summary', summary));

        if (Array.isArray(story.tags) && story.tags.length) {
            const tags = defElement('div', 'story-tags');
            story.tags.forEach((tag) => tags.appendChild(defElement('span', 'kone-tag', tag)));
            info.appendChild(tags);
        }

        card.append(imageWrap, info);
        card.addEventListener('click', () => showStoryDetail(originalIndex));
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                showStoryDetail(originalIndex);
            }
        });
        container.appendChild(card);
    });
}

function showStoryDetail(index) {
    const story = storiesData[index];
    if (!story) return;

    const date = document.getElementById('sd-date');
    const title = document.getElementById('sd-title');
    const summary = document.getElementById('sd-summary');
    const body = document.getElementById('sd-body');
    if (date) date.textContent = fmtDate(story.date);
    if (title) title.textContent = story.title || 'Untitled story';
    if (summary) {
        summary.textContent = defSafeText(story.summary || story.excerpt || '', 1000);
        summary.hidden = !summary.textContent;
    }

    const tags = document.getElementById('sd-tags');
    if (tags) {
        tags.replaceChildren();
        (Array.isArray(story.tags) ? story.tags : []).forEach((tag) => tags.appendChild(defElement('span', 'kone-tag', tag)));
        tags.hidden = !tags.childElementCount;
    }

    if (body) {
        try {
            const safeHtml = defRenderMarkdown(story.body || '');
            if (safeHtml !== null) body.innerHTML = safeHtml;
            else body.textContent = story.body || '';
        } catch (error) {
            body.textContent = story.body || '';
        }
    }
    switchView('story-detail');
}

// Events: the CMS offers two content types — a short announcement card or a full event report.
let activeEventsTab = 'upcoming';
let activeEventFilter = 'All topics';
let activePastEventYear = 'all';

function defParseLegacyEventRange(value) {
    const text = defSafeText(value, 150);
    const range = text.match(/^([A-Za-z]{3,9})\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s*(\d{4})$/);
    if (range) {
        return {
            start: defParseLocalDate(`${range[1]} ${range[2]}, ${range[4]}`),
            end: defParseLocalDate(`${range[1]} ${range[3]}, ${range[4]}`)
        };
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
function defGetEventType(event) {
    const type = String(event.content_type || event.type || '').toLowerCase();
    if (type === 'report' || type === 'story' || event.body || event.recap) return 'report';
    return 'announcement';
}
function defGetEventYear(event) {
    if (event.event_year) return String(event.event_year);
    const dates = defGetEventDates(event);
    if (dates.start) return String(dates.start.getFullYear());
    if (event.published_date) {
        const published = defParseLocalDate(event.published_date);
        if (published) return String(published.getFullYear());
    }
    const legacy = String(event.date || event.year || '').match(/\b(20\d{2})\b/);
    return legacy ? legacy[1] : '';
}
function defFormatEventDate(event, dates) {
    if (dates.start && dates.end) {
        if (dates.start.toDateString() === dates.end.toDateString()) return fmtDate(dates.start);
        return fmtDate(dates.start) + ' – ' + fmtDate(dates.end);
    }
    // Legacy explicit date text is retained if present; year-only reports are shown as a year, not as a date.
    return defSafeText(event.date || '', 150);
}
function defGetBoothLabel(event, status) {
    const booth = defSafeText(event.booth || '', 120);
    if (booth) return booth;
    return status === 'past' ? 'Not listed' : 'To be confirmed';
}
function defGetEventUrl(event) {
    const url = defSafeText(event.url || event.website || '', 1000);
    return /^https:\/\//i.test(url) ? url : '';
}
function defAppendEventTags(container, tags) {
    const values = Array.isArray(tags) ? tags : [];
    if (!values.length) return;
    const wrap = defElement('div', 'story-tags event-card-tags');
    values.forEach(tag => wrap.appendChild(defElement('span', 'kone-tag', tag)));
    container.appendChild(wrap);
}
function defGetEventCollections() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = [];
    const past = [];
    eventsData.forEach((event, index) => {
        const dates = defGetEventDates(event);
        const isReport = defGetEventType(event) === 'report';
        const isPastDate = !!(dates.end && dates.end < today);
        const item = { event, index, dates, year: defGetEventYear(event) };
        if (isReport || isPastDate) past.push(item);
        else upcoming.push(item);
    });
    upcoming.sort((a, b) => {
        const ad = a.dates.start ? a.dates.start.getTime() : Number.MAX_SAFE_INTEGER;
        const bd = b.dates.start ? b.dates.start.getTime() : Number.MAX_SAFE_INTEGER;
        return ad - bd;
    });
    past.sort((a, b) => {
        const ad = a.dates.end ? a.dates.end.getTime() : (Number(a.year) || 0);
        const bd = b.dates.end ? b.dates.end.getTime() : (Number(b.year) || 0);
        return bd - ad;
    });
    return { upcoming, past };
}
function setEventsTab(tab) {
    activeEventsTab = tab === 'past' ? 'past' : 'upcoming';
    activeEventFilter = 'All topics';
    document.querySelectorAll('[data-events-tab]').forEach(button => {
        const active = button.dataset.eventsTab === activeEventsTab;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
    });
    renderEvents();
}
function defMakeEventCard(item, status) {
    const event = item.event;
    const isReport = defGetEventType(event) === 'report';
    const card = defElement('article', 'event-card' + (isReport ? ' is-readable' : ''));
    const imageWrap = defElement('div', 'event-card-image');
    const image = defElement('img');
    image.src = defGetImageUrl(event.cover || event.image, '/images/event-1.jpg');
    image.alt = defSafeText(event.title || 'Trade show', 160);
    image.loading = 'lazy';
    image.onerror = () => { image.onerror = null; image.src = '/images/event-1.jpg'; };
    imageWrap.appendChild(image);

    const body = defElement('div', 'event-card-body');
    const statusLabel = status === 'upcoming' ? 'Upcoming exhibition' : 'Past event';
    body.appendChild(defElement('span', 'event-status', statusLabel));
    body.appendChild(defElement('h3', 'event-title', event.title || 'Untitled event'));

    // Booth appears before the date/location metadata because it is an important visit-planning detail.
    const booth = defGetBoothLabel(event, status);
    body.appendChild(defElement('p', 'event-booth', 'Booth: ' + booth));

    const dateLabel = defFormatEventDate(event, item.dates);
    const meta = defElement('div', 'event-meta');
    if (dateLabel) meta.appendChild(defElement('p', '', 'Date: ' + dateLabel));
    else if (item.year) meta.appendChild(defElement('p', '', 'Year: ' + item.year));
    const location = defSafeText(event.loc || event.location || '', 200);
    if (location) meta.appendChild(defElement('p', '', 'Location: ' + location));
    body.appendChild(meta);

    const theme = defSafeText(event.theme || '', 250);
    if (theme) body.appendChild(defElement('p', 'event-theme', 'Theme: ' + theme));
    const summary = defSafeText(event.summary || event.desc || event.description || '', 1500);
    if (summary) body.appendChild(defElement('p', 'event-card-summary', summary));
    defAppendEventTags(body, event.tags);

    if (isReport) {
        const readLink = defElement('a', 'event-card-cta', 'Read event report');
        readLink.href = '#event-report';
        readLink.addEventListener('click', (clickEvent) => {
            clickEvent.preventDefault();
            showEventDetail(item.index);
        });
        body.appendChild(readLink);
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', 'Read event report: ' + defSafeText(event.title, 160));
        card.addEventListener('click', (clickEvent) => {
            if (clickEvent.target.closest('a')) return;
            showEventDetail(item.index);
        });
        card.addEventListener('keydown', (keyEvent) => {
            if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                keyEvent.preventDefault();
                showEventDetail(item.index);
            }
        });
    } else {
        const url = defGetEventUrl(event);
        if (url) {
            const link = defElement('a', 'event-card-cta', 'Event details & registration');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            body.appendChild(link);
        }
    }
    card.append(imageWrap, body);
    return card;
}
function defRenderEventFilters(items) {
    const container = document.getElementById('events-filters');
    if (!container) return;
    container.replaceChildren();
    const tags = new Set();
    items.forEach(item => {
        (Array.isArray(item.event.tags) ? item.event.tags : []).forEach(tag => {
            const text = defSafeText(tag, 80);
            if (text) tags.add(text);
        });
    });
    const values = ['All topics', ...Array.from(tags).sort((a, b) => a.localeCompare(b))];
    if (!values.includes(activeEventFilter)) activeEventFilter = 'All topics';
    values.forEach(value => {
        const button = defElement('button', 'event-filter' + (activeEventFilter === value ? ' is-active' : ''), value);
        button.type = 'button';
        button.setAttribute('aria-pressed', String(activeEventFilter === value));
        button.addEventListener('click', () => {
            activeEventFilter = value;
            renderEvents();
        });
        container.appendChild(button);
    });
}
function defUpdatePastYearSelect(pastItems) {
    const wrapper = document.getElementById('events-year-filter');
    const select = document.getElementById('events-year-select');
    if (!wrapper || !select) return;
    wrapper.hidden = activeEventsTab !== 'past';
    if (activeEventsTab !== 'past') return;
    const years = Array.from(new Set(pastItems.map(item => item.year).filter(Boolean))).sort((a, b) => Number(b) - Number(a));
    const options = [{ value: 'all', label: 'All years' }, ...years.map(year => ({ value: year, label: year }))];
    select.replaceChildren();
    options.forEach(optionData => {
        const option = document.createElement('option');
        option.value = optionData.value;
        option.textContent = optionData.label;
        select.appendChild(option);
    });
    if (!options.some(option => option.value === activePastEventYear)) activePastEventYear = 'all';
    select.value = activePastEventYear;
}
function renderEvents() {
    const container = document.getElementById('events-list');
    if (!container) return;
    container.replaceChildren();
    if (!eventsData.length) {
        defShowMessage(container, 'No events have been published yet. Please check back soon.');
        const filters = document.getElementById('events-filters');
        if (filters) filters.replaceChildren();
        return;
    }

    const { upcoming, past } = defGetEventCollections();
    defUpdatePastYearSelect(past);
    let items = activeEventsTab === 'upcoming' ? upcoming : past;
    if (activeEventsTab === 'past' && activePastEventYear !== 'all') {
        items = items.filter(item => item.year === activePastEventYear);
    }
    defRenderEventFilters(items);
    if (activeEventFilter !== 'All topics') {
        items = items.filter(item => Array.isArray(item.event.tags) && item.event.tags.includes(activeEventFilter));
    }
    if (!items.length) {
        defShowMessage(container, activeEventsTab === 'upcoming'
            ? 'No upcoming exhibitions match this topic yet.'
            : 'No past event reports match this filter yet.');
        return;
    }

    const heading = activeEventsTab === 'upcoming' ? 'Upcoming Exhibitions' : 'Past Events & Reports';
    container.appendChild(defElement('h3', 'events-section-title', heading));
    const grid = defElement('div', 'events-grid');
    items.forEach(item => grid.appendChild(defMakeEventCard(item, activeEventsTab)));
    container.appendChild(grid);
}
function showEventDetail(index) {
    const event = eventsData[index];
    if (!event) return;
    const published = document.getElementById('ed-published-date');
    const title = document.getElementById('ed-title');
    const summary = document.getElementById('ed-summary');
    const meta = document.getElementById('ed-meta');
    const body = document.getElementById('ed-body');
    const gallery = document.getElementById('ed-gallery');
    const urlLink = document.getElementById('ed-url');

    if (published) {
        const publishedLabel = event.published_date ? 'Published ' + fmtDate(event.published_date) : '';
        published.textContent = publishedLabel;
    }
    if (title) title.textContent = event.title || 'Event report';
    if (summary) {
        summary.textContent = defSafeText(event.summary || event.desc || '', 1500);
        summary.hidden = !summary.textContent;
    }
    const tags = document.getElementById('ed-tags');
    if (tags) {
        tags.replaceChildren();
        (Array.isArray(event.tags) ? event.tags : []).forEach(tag => tags.appendChild(defElement('span', 'kone-tag', tag)));
        tags.hidden = !tags.childElementCount;
    }
    if (meta) {
        meta.replaceChildren();
        const dates = defGetEventDates(event);
        const dateLabel = defFormatEventDate(event, dates);
        if (dateLabel) meta.appendChild(defElement('span', '', 'Event date: ' + dateLabel));
        else if (defGetEventYear(event)) meta.appendChild(defElement('span', '', 'Event year: ' + defGetEventYear(event)));
        const location = defSafeText(event.loc || event.location || '', 200);
        if (location) meta.appendChild(defElement('span', '', 'Location: ' + location));
        meta.appendChild(defElement('span', '', 'Booth: ' + defGetBoothLabel(event, 'past')));
        const theme = defSafeText(event.theme || '', 250);
        if (theme) meta.appendChild(defElement('span', '', 'Theme: ' + theme));
    }
    if (body) {
        const markdown = event.body || event.recap || '';
        try {
            const safeHtml = defRenderMarkdown(markdown);
            if (safeHtml !== null) body.innerHTML = safeHtml;
            else body.textContent = markdown;
        } catch (error) {
            body.textContent = markdown;
        }
    }
    if (gallery) {
        gallery.replaceChildren();
        (Array.isArray(event.gallery) ? event.gallery : []).slice(0, 12).forEach((value, indexInGallery) => {
            const imageUrl = typeof value === 'string' ? value : value && (value.image || value.src);
            if (!imageUrl) return;
            const img = defElement('img');
            img.src = defGetImageUrl(imageUrl, '');
            img.alt = defSafeText(event.title, 160) + ' — image ' + (indexInGallery + 1);
            img.loading = 'lazy';
            img.onerror = () => img.remove();
            gallery.appendChild(img);
        });
    }
    if (urlLink) {
        const url = defGetEventUrl(event);
        urlLink.href = url || '#';
        urlLink.hidden = !url;
    }
    switchView('event-detail');
}
// ==========================================
// Cookie 同意（Consent Mode v2）
//   Accept all  -> 分析 + 营销 全部同意
//   Reject all  -> 全部拒绝
//   Customize   -> 用户自己勾选 分析 / 营销
// 注意：GA4 要"完整追踪"，只需要【分析 Analytics】被同意；
//       营销 Marketing 只影响广告相关功能。
// ==========================================
function initCookieConsent() {
    const $ = (id) => document.getElementById(id);
    const banner = $('cookie-banner');
    const panel  = $('cookie-panel');
    const reopen = $('cookie-reopen');
    const cbA = $('cookie-analytics');
    const cbM = $('cookie-marketing');
    if (!banner) return;

    function openBanner(showPanel) {
        const saved = readConsent();
        cbA.checked = !!(saved && saved.analytics);
        cbM.checked = !!(saved && saved.marketing);
        panel.hidden = !showPanel;
        banner.style.display = 'block';
        reopen.style.display = 'none';
    }

    function save(choice) {
        // ① 告诉 GTM / Google 新的同意状态（这一步就是之前缺的）
        gtag('consent', 'update', consentToGtag(choice));
        // ② 记住选择，下次访问自动恢复
        try {
            localStorage.setItem(CONSENT_KEY, JSON.stringify({
                analytics: !!choice.analytics,
                marketing: !!choice.marketing,
                savedAt: Date.now()
            }));
        } catch (e) {}
        // ③ 收起弹窗，留一个小入口方便改主意
        banner.style.display = 'none';
        reopen.style.display = 'block';
    }

    $('cookie-accept').addEventListener('click', () => save({ analytics: true,  marketing: true  }));
    $('cookie-reject').addEventListener('click', () => save({ analytics: false, marketing: false }));
    $('cookie-customize').addEventListener('click', () => { panel.hidden = !panel.hidden; });
    $('cookie-save').addEventListener('click', () => save({ analytics: cbA.checked, marketing: cbM.checked }));
    reopen.addEventListener('click', () => openBanner(true));

    if (readConsent()) {
        reopen.style.display = 'block';          // 老访客：不再弹窗
    } else {
        setTimeout(() => openBanner(false), 500); // 新访客：稍等再弹出
    }
}

// ==========================================
// 初始化
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    loadCloudData();
    document.querySelectorAll('[data-events-tab]').forEach(button => {
        button.addEventListener('click', () => setEventsTab(button.dataset.eventsTab));
    });
    const eventsYearSelect = document.getElementById('events-year-select');
    if (eventsYearSelect) {
        eventsYearSelect.addEventListener('change', () => {
            activePastEventYear = eventsYearSelect.value || 'all';
            activeEventFilter = 'All topics';
            renderEvents();
        });
    }
    initCookieConsent();

    // Contact Sales / Book a Demo 表单（同一张表）
    const contactForm = document.getElementById('detailed-contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const btn = this.querySelector('button[type="submit"]');
            if(btn) { btn.innerText = 'Submitting...'; btn.disabled = true; }

            fetch(SITE_CONFIG.contactUrl, { method: 'POST', mode: 'no-cors', body: new FormData(this) })
            .then(() => {
                // 线索事件：高意向
                track('generate_lead', { form_id: 'contact_sales_form', lead_source: currentLeadSource });
                document.getElementById('form-container-box').style.display = 'none';
                document.getElementById('success-screen').style.display = 'block';
                window.scrollTo(0,0);
            }, () => {
                // 网络失败：恢复按钮，别让用户卡在 "Submitting..."
                if(btn) { btn.innerText = 'Submit Inquiry'; btn.disabled = false; }
                alert('Network error. Please try again.');
            });
        });
    }

    // Newsletter 表单
    const newsForm = document.getElementById('newsletter-form');
    if (newsForm) {
        newsForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email = document.getElementById('nl-email').value.trim();
            if (!email) return;
            const btn = this.querySelector('button');
            if(btn) { btn.innerText = 'Subscribing...'; btn.disabled = true; }

            try {
                await fetch(SITE_CONFIG.newsletterUrl, { method: 'POST', body: new URLSearchParams({ email }), mode: 'no-cors' });
            } catch (err) {
                if(btn) { btn.innerText = 'Subscribe'; btn.disabled = false; }
                alert('Network error. Please try again.');
                return;
            }
            // 订阅事件：低意向
            track('newsletter_signup', { form_id: 'newsletter_form' });
            document.getElementById('nl-form-container').style.display = 'none';
            document.getElementById('nl-success-box').style.display = 'block';
        });
    }
});
