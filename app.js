/* ========================================================
   DEF B2B 官网核心引擎 (模块化解耦版)
   以后加新功能，直接在最下面加新的模块，绝不影响老代码。
   ======================================================== */

// 模块一：页面路由（防弹版）
const Router = {
    showPage: function(id) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const target = document.getElementById(id);
        if (target) target.classList.add('active');
        if (id === 'newsroom') this.switchView('ov');
        window.scrollTo(0, 0);
    },
    switchView: function(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const target = document.getElementById('view-' + viewId);
        if (target) target.classList.add('active');
        document.querySelectorAll('.nr-sidebar a').forEach(a => a.classList.remove('active'));
        const navEl = document.getElementById('nav-' + viewId.replace('-detail', 's'));
        if (navEl) navEl.classList.add('active');
        window.scrollTo(0, 80);
    }
};

// 全局暴露给HTML的 onclick 使用
function showPage(id) { Router.showPage(id); }
function switchView(viewId) { Router.switchView(viewId); }

// 模块二：数据读取引擎 (自带断网保护，绝不卡死页面)
let storiesData = [];
let eventsData = [];

async function loadCloudData() {
    // 1. 读图片
    try {
        const res = await fetch('data/global_settings.json');
        if (res.ok) {
            const data = await res.json();
            const imgs = data.site_images || {};
            if (imgs.logo) document.querySelector('.logo img').src = imgs.logo;
            if (imgs.hero_bg) document.querySelector('.hero img').src = imgs.hero_bg;
            if (imgs.team) document.querySelector('.nl-img img').src = imgs.team;
            if (imgs.ov_social) document.getElementById('ov-img-social').src = imgs.ov_social;
            if (imgs.ov_stories) document.getElementById('ov-img-stories').src = imgs.ov_stories;
            if (imgs.ov_events) document.getElementById('ov-img-events').src = imgs.ov_events;
            if (imgs.ov_media) document.getElementById('ov-img-media').src = imgs.ov_media;
            if (imgs.social_linkedin) document.getElementById('social-li-img').src = imgs.social_linkedin;
            if (imgs.social_youtube) document.getElementById('social-yt-img').src = imgs.social_youtube;
            if (imgs.social_facebook) document.getElementById('social-fb-img').src = imgs.social_facebook;
            if (imgs.media_1) document.getElementById('media-img-1').src = imgs.media_1;
            if (imgs.media_2) document.getElementById('media-img-2').src = imgs.media_2;
        }
    } catch (e) { console.log("图片加载跳过"); }

    // 2. 读文章
    try {
        const res = await fetch('data/database.json');
        if (res.ok) {
            const data = await res.json();
            storiesData = data.articles || [];
            renderStories(storiesData);
        }
    } catch (e) { console.log("文章加载跳过"); }

    // 3. 读展会
    try {
        const res = await fetch('data/events.json');
        if (res.ok) {
            const data = await res.json();
            eventsData = data.exhibitions || [];
            renderEvents(eventsData);
        }
    } catch (e) { console.log("展会加载跳过"); }
}

// 渲染文章
function renderStories(data) {
    const container = document.getElementById('stories-list');
    if(!container) return;
    container.innerHTML = '';
    data.forEach((story, index) => {
        const plainText = (story.body || "").replace(/<[^>]*>?/gm, '');
        const readingTime = Math.max(1, Math.ceil(plainText.split(/\s+/).length / 150)) + " mins read";
        const tagsHtml = (story.tags || []).map(t => `<span class="kone-tag">${t}</span>`).join('');
        container.innerHTML += `
            <div class="list-card" onclick="showStoryDetail(${index})">
                <img src="${story.image || 'images/story-cover.jpg'}">
                <div class="list-info">
                    <div style="font-size: 13px; color: #888; margin-bottom: 8px;">
                        ${new Date(story.date).toLocaleDateString()} • ${readingTime}
                    </div>
                    <h4>${story.title}</h4>
                    <div class="story-tags">${tagsHtml}</div>
                </div>
            </div>
        `;
    });
}

function showStoryDetail(index) {
    const story = storiesData[index];
    if (!story) return;
    document.getElementById('sd-img').src = story.image || 'images/story-cover.jpg';
    document.getElementById('sd-date').innerText = new Date(story.date).toLocaleDateString();
    document.getElementById('sd-title').innerText = story.title;
    try { document.getElementById('sd-body').innerHTML = marked.parse(story.body || ""); } catch(e) {}
    switchView('story-detail');
}

// 渲染展会
function renderEvents(data) {
    const container = document.getElementById('events-list');
    if(!container) return;
    let upcoming = '', past = '';
    const currentYear = 2026;
    data.forEach(ev => {
        const imgSrc = ev.cover || 'images/event-1.jpg';
        const yearNum = parseInt(ev.year) || 2026;
        const card = `
            <div class="event-card">
                <img src="${imgSrc}">
                <div class="event-info">
                    <span class="event-year-badge">${ev.year}</span>
                    <h4>${ev.title}</h4>
                    <p style="font-size: 18px; font-weight: 600; color: var(--dark); margin-bottom: 8px;">📍 ${ev.booth || 'Booth TBD'}</p>
                    <p><strong>Date:</strong> ${ev.date}</p>
                    <p><strong>Location:</strong> ${ev.loc}</p>
                    <p><strong>Theme:</strong> ${ev.theme || 'Industrial Vision'}</p>
                    <p style="margin-top: 12px;">${ev.desc || ''}</p>
                </div>
            </div>
        `;
        if (yearNum >= currentYear) { upcoming += card; } else { past += card; }
    });
    container.innerHTML = (upcoming ? `<h3 style="font-size:24px; margin: 20px 0; border-bottom: 2px solid var(--yellow); padding-bottom: 10px;">Upcoming Trade Shows</h3>${upcoming}` : '') + 
                          (past ? `<h3 style="font-size:24px; margin: 40px 0 20px; border-bottom: 2px solid var(--line); padding-bottom: 10px;">Past Events & Reviews</h3>${past}` : '');
}

// ========================================================
// 模块三：GA4 / GTM 数据追踪中心 (最标准的做法)
// ========================================================
const Tracker = {
    pushEvent: function(eventName, params = {}) {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            'event': eventName,
            ...params
        });
        console.log("✅ GTM 事件已发送:", eventName, params);
    }
};

// ========================================================
// 模块四：表单处理器 (独立监听，互不干扰)
// ========================================================
const FormHandler = {
    init: function() {
        // 1. Contact Sales 表单
        const contactForm = document.getElementById('detailed-contact-form');
        if (contactForm) {
            contactForm.addEventListener('submit', function(e) {
                e.preventDefault();
                const btn = document.getElementById('submit-btn');
                if(btn) { btn.innerText = 'Submitting...'; btn.disabled = true; }
                
                fetch(SITE_CONFIG.contactUrl, { method: 'POST', mode: 'no-cors', body: new FormData(this) })
                .then(() => {
                    Tracker.pushEvent('contact_sales_lead'); // 触发 GA4 事件
                    document.getElementById('form-container-box').style.display = 'none';
                    document.getElementById('success-screen').style.display = 'block';
                })
                .catch(() => {
                    alert('Network Error. Please try again.');
                    if(btn) { btn.innerText = 'Submit Inquiry'; btn.disabled = false; }
                });
            });
        }

        // 2. Newsletter 表单
        const newsForm = document.getElementById('newsletter-form');
        if (newsForm) {
            newsForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                const email = document.getElementById('nl-email').value.trim();
                if (!email) return alert('Please enter your email.');
                const btn = this.querySelector('button');
                if(btn) { btn.innerText = 'Subscribing...'; btn.disabled = true; }

                try {
                    await fetch(SITE_CONFIG.newsletterUrl, { method: 'POST', body: new URLSearchParams({ email }), mode: 'no-cors' });
                    Tracker.pushEvent('newsletter_signup'); // 触发 GA4 事件
                    
                    document.getElementById('nl-form-container').style.display = 'none';
                    document.getElementById('nl-success-box').style.display = 'block';
                } catch (e) {
                    alert('Subscription failed.');
                    if(btn) { btn.innerText = 'Subscribe'; btn.disabled = false; }
                }
            });
        }
    }
};

// ========================================================
// 引擎启动入口：只管初始化
// ========================================================
document.addEventListener("DOMContentLoaded", () => {
    // 1. 启动表单监听
    FormHandler.init();
    
    // 2. 去云端拉数据
    loadCloudData();
    
    // 3. Cookie 弹窗
    setTimeout(() => {
        const banner = document.getElementById('cookie-banner');
        if (banner) banner.style.display = 'block';
    }, 500);
});