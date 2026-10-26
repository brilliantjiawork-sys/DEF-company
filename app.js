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
    document.getElementById('view-' + viewId).classList.add('active');
    document.querySelectorAll('.nr-sidebar a').forEach(a => a.classList.remove('active'));
    // 文章详情页时，高亮侧边栏的 Stories（原来拼成了 "storys"，找不到）
    const navKey = (viewId === 'story-detail') ? 'stories' : viewId;
    const navEl = document.getElementById('nav-' + navKey);
    if(navEl) navEl.classList.add('active');
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
            body.innerHTML = window.marked && typeof window.marked.parse === 'function'
                ? window.marked.parse(story.body || '')
                : defSafeText(story.body || '', 50000);
        } catch (error) {
            body.textContent = story.body || '';
        }
    }
    switchView('story-detail');
}

// Events read the same start/end-date, recap, gallery and URL fields configured in the CMS.
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
    image.onerror = () => { image.onerror = null; image.src = '/images/event-1.jpg'; };
    imageWrap.appendChild(image);

    const body = defElement('div', 'event-card-body');
    const statusLabel = status === 'upcoming' ? 'Upcoming' : status === 'past' ? 'Past event' : 'Date to confirm';
    body.appendChild(defElement('span', 'event-status', statusLabel));
    body.appendChild(defElement('h3', 'event-title', event.title || 'Untitled event'));

    const dates = defGetEventDates(event);
    const dateLabel = defFormatEventDate(event, dates);
    const meta = defElement('div', 'event-meta');
    if (dateLabel) meta.appendChild(defElement('p', '', 'Date: ' + dateLabel));
    const location = defSafeText(event.loc || event.location || '', 200);
    if (location) meta.appendChild(defElement('p', '', 'Location: ' + location));
    const booth = defSafeText(event.booth || '', 120) || (status === 'past' ? 'Not listed' : 'To be confirmed');
    meta.appendChild(defElement('p', '', 'Booth: ' + booth));
    body.appendChild(meta);

    const theme = defSafeText(event.theme || '', 250);
    if (theme) body.appendChild(defElement('p', 'event-theme', 'Theme: ' + theme));

    const recap = defSafeText(event.recap || '', 12000);
    if (recap && window.marked && typeof window.marked.parse === 'function') {
        const recapNode = defElement('div', 'event-recap');
        recapNode.innerHTML = window.marked.parse(recap);
        body.appendChild(recapNode);
    } else {
        const description = defSafeText(event.desc || event.description || '', 2500);
        if (description) body.appendChild(defElement('p', 'event-description', description));
    }

    if (Array.isArray(event.gallery) && event.gallery.length) {
        const gallery = defElement('div', 'event-gallery');
        event.gallery.slice(0, 8).forEach((value, index) => {
            const imageUrl = typeof value === 'string' ? value : value && (value.image || value.src);
            const galleryImage = defElement('img');
            galleryImage.src = defGetImageUrl(imageUrl, '');
            galleryImage.alt = defSafeText(event.title, 160) + ' - gallery image ' + (index + 1);
            galleryImage.loading = 'lazy';
            if (galleryImage.getAttribute('src')) gallery.appendChild(galleryImage);
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

    function addSection(title, list, status) {
        if (!list.length) return;
        container.appendChild(defElement('h3', 'events-section-title', title));
        const grid = defElement('div', 'events-grid');
        list.forEach((item) => grid.appendChild(defMakeEventCard(item.event, status)));
        container.appendChild(grid);
    }
    addSection('Upcoming Global Expos', upcoming, 'upcoming');
    addSection('Past Events & Highlights', past, 'past');
    addSection('Events — Dates to Confirm', unknown, 'unknown');
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
