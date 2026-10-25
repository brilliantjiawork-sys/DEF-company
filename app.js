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
    const dt = new Date(d);
    if (isNaN(dt)) return '';
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

async function loadCloudData() {
    // 1. 加载文章
    try {
        const res = await fetch('data/database.json');
        if (res.ok) {
            const data = await res.json();
            storiesData = data.articles || [];
            const container = document.getElementById('stories-list');
            if(container) {
                container.innerHTML = '';
                storiesData.forEach((story, index) => {
                    const tagsHtml = (story.tags || []).map(t => `<span class="kone-tag">${t}</span>`).join('');
                    container.innerHTML += `
                        <div class="list-card" onclick="showStoryDetail(${index})">
                            <div class="image-container">
                                <img src="${story.image || 'images/story-cover.jpg'}" loading="lazy" alt="">
                            </div>
                            <div class="list-info">
                                <span class="date">${fmtDate(story.date)}</span>
                                <h4>${story.title}</h4>
                                <div style="margin-top:12px;">${tagsHtml}</div>
                            </div>
                        </div>`;
                });
            }
        }
    } catch (e) {}

    // 2. 加载展会 (自动分类)
    try {
        const res = await fetch('data/events.json');
        if (res.ok) {
            const data = await res.json();
            eventsData = data.exhibitions || [];
            const container = document.getElementById('events-list');
            if(container) {
                container.innerHTML = '';
                let upcomingHtml = '';
                let pastHtml = '';
                const currentYear = 2026; // 以 2026 年为界

                eventsData.forEach(ev => {
                    const yearNum = parseInt(ev.year) || 2026;
                    const cardHtml = `
                        <div class="list-card">
                            <div class="image-container">
                                <img src="${ev.cover || 'images/event-1.jpg'}" loading="lazy" alt="">
                            </div>
                            <div class="list-info">
                                <span class="kone-tag">${ev.year}</span>
                                <h4 style="margin-top:8px;">${ev.title}</h4>
                                <p style="font-size:16px; font-weight:600; margin:4px 0;">📍 ${ev.booth || 'Booth TBD'}</p>
                                <p style="color:var(--gray); margin:0; font-size:14px;">
                                    <strong>Date:</strong> ${ev.date} | <strong>Location:</strong> ${ev.loc}<br>
                                    <strong>Theme:</strong> ${ev.theme || 'Industrial Vision'}
                                </p>
                            </div>
                        </div>`;

                    if (yearNum >= currentYear) {
                        upcomingHtml += cardHtml;
                    } else {
                        pastHtml += cardHtml;
                    }
                });

                if(upcomingHtml) {
                    container.innerHTML += `<h3 style="font-size:24px; margin: 20px 0; border-bottom: 2px solid var(--yellow); padding-bottom: 10px;">Upcoming Global Expos</h3>` + upcomingHtml;
                }
                if(pastHtml) {
                    container.innerHTML += `<h3 style="font-size:24px; margin: 40px 0 20px; border-bottom: 2px solid var(--line); padding-bottom: 10px;">Past Engagements & Reviews</h3>` + pastHtml;
                }
            }
        }
    } catch (e) {}
}

function showStoryDetail(index) {
    const story = storiesData[index];
    if(!story) return;
    document.querySelector('.detail-img-container img').src = story.image || 'images/story-cover.jpg';
    document.getElementById('sd-date').innerText = fmtDate(story.date);
    document.getElementById('sd-title').innerText = story.title;
    try { document.getElementById('sd-body').innerHTML = marked.parse(story.body || ""); } catch(e) {}
    switchView('story-detail');
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
