// 1. 页面切换
function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    if (id === 'newsroom') switchView('ov');
    window.scrollTo(0, 0);
}

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById('view-' + viewId);
    if (target) target.classList.add('active');
    document.querySelectorAll('.nr-sidebar a').forEach(a => a.classList.remove('active'));
    const navEl = document.getElementById('nav-' + viewId.replace('-detail', 's'));
    if (navEl) navEl.classList.add('active');
    window.scrollTo(0, 80);
}

// 2. 全局数据
let storiesData = [];
let eventsData = [];

// 3. 核心：读取云端数据
async function loadData() {
    try {
        // 图片
        const gRes = await fetch('data/global_settings.json');
        if (gRes.ok) {
            const gData = await gRes.json();
            const imgs = gData.site_images || {};
            if (imgs.logo) document.querySelector('.logo img').src = imgs.logo;
            if (imgs.hero_bg) document.querySelector('.hero img').src = imgs.hero_bg;
            if (imgs.team) document.querySelector('.nl-img img').src = imgs.team;
            // 这里可以加更多图片的替换，假设你用全局配置覆盖了首页和社媒
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
    } catch (err) { console.log("图片读取跳过"); }

    try {
        // 文章
        const sRes = await fetch('data/database.json');
        if (sRes.ok) {
            const sData = await sRes.json();
            storiesData = sData.articles || [];
            renderStories(storiesData);
        }
    } catch (err) { console.log("文章读取跳过"); }

    try {
        // 展会
        const eRes = await fetch('data/events.json');
        if (eRes.ok) {
            const eData = await eRes.json();
            eventsData = eData.exhibitions || [];
            renderEvents(eventsData);
        }
    } catch (err) { console.log("展会读取跳过"); }
}

// 4. 渲染文章列表
function renderStories(data) {
    const container = document.getElementById('stories-list');
    if(!container) return;
    container.innerHTML = '';
    data.forEach((story, index) => {
        const plainText = (story.body || "").replace(/<[^>]*>?/gm, '');
        const readingTime = Math.max(1, Math.ceil(plainText.split(/\s+/).length / 150)) + " mins read";
        const tagsHtml = (story.tags || []).map(t => `<span class="kone-tag">${t}</span>`).join('');
        const imgSrc = story.image || 'images/story-cover.jpg';
        
        container.innerHTML += `
            <div class="list-card" onclick="showStoryDetail(${index})">
                <img src="${imgSrc}">
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

// 5. 点击文章详情
function showStoryDetail(index) {
    const story = storiesData[index];
    if (!story) return;
    document.getElementById('sd-img').src = story.image || 'images/story-cover.jpg';
    document.getElementById('sd-date').innerText = new Date(story.date).toLocaleDateString();
    document.getElementById('sd-title').innerText = story.title;
    try {
        document.getElementById('sd-body').innerHTML = marked.parse(story.body || "");
    } catch(e) {
        document.getElementById('sd-body').innerText = story.body || "";
    }
    switchView('story-detail');
}

// 6. 渲染展会 (分为 Upcoming 和 Past)
function renderEvents(data) {
    const container = document.getElementById('events-list');
    if(!container) return;
    
    let upcomingHtml = '';
    let pastHtml = '';
    // 设定一个当前参考年份 (2026)
    const currentYear = 2026;

    data.forEach(ev => {
        const imgSrc = ev.cover || 'images/event-1.jpg';
        const yearNum = parseInt(ev.year) || 2026;
        
        const cardHtml = `
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

        if (yearNum >= currentYear) {
            upcomingHtml += cardHtml;
        } else {
            pastHtml += cardHtml;
        }
    });

    let finalHtml = '';
    if (upcomingHtml) {
        finalHtml += `<h3 style="font-size:24px; margin: 20px 0; border-bottom: 2px solid var(--yellow); padding-bottom: 10px;">Upcoming Trade Shows</h3>`;
        finalHtml += upcomingHtml;
    }
    if (pastHtml) {
        finalHtml += `<h3 style="font-size:24px; margin: 40px 0 20px; border-bottom: 2px solid var(--line); padding-bottom: 10px;">Past Events & Reviews</h3>`;
        finalHtml += pastHtml;
    }
    container.innerHTML = finalHtml;
}

// 7. 页面初始化与表单提交逻辑
document.addEventListener("DOMContentLoaded", () => {
    loadData();
    
    // Cookie 弹窗
    setTimeout(() => {
        const banner = document.getElementById('cookie-banner');
        if (banner) banner.style.display = 'block';
    }, 500);

    document.querySelectorAll('.toggle-switch').forEach(t => {
        t.addEventListener('click', function() {
            if(!this.previousElementSibling || !this.previousElementSibling.classList.contains('disabled')) {
                this.classList.toggle('active');
            }
        });
    });

    // 1. Contact Sales 表单逻辑
    const contactForm = document.getElementById('detailed-contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault(); 
            const formElement = this;
            const submitBtn = document.getElementById('submit-btn');
            const originalText = submitBtn.innerText;
            
            submitBtn.innerText = 'Submitting...';
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.7';

            const formData = new FormData(this);

            fetch(SITE_CONFIG.contactUrl, { method: 'POST', mode: 'no-cors', body: formData })
            .then(() => {
                // 触发标准 GTM 事件
                formElement.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                // 切换 UI
                document.getElementById('form-container-box').style.display = 'none';
                document.getElementById('success-screen').style.display = 'block';
            })
            .catch(error => {
                alert('Submission failed. Please check your network.');
                submitBtn.innerText = originalText;
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
            });
        });
    }

    // 2. Newsletter 表单逻辑 (现在它是标准的 form 了)
    const newsletterForm = document.getElementById('newsletter-form');
    if (newsletterForm) {
        newsletterForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const formElement = this;
            const email = document.getElementById('nl-email').value.trim();
            if (!email) return alert('Please enter your email.');

            const btn = formElement.querySelector('button');
            const originalText = btn.innerText;
            btn.innerText = 'Subscribing...';
            btn.disabled = true;
            btn.style.opacity = '0.7';

            try {
                await fetch(SITE_CONFIG.newsletterUrl, { method: 'POST', body: new URLSearchParams({ email }), mode: 'no-cors' });
                
                // 触发标准 GTM 事件
                formElement.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

                // 切换 UI
                document.getElementById('nl-form-container').style.display = 'none';
                document.getElementById('nl-success-box').style.display = 'block';
            } catch (error) {
                alert('Subscription failed. Please try again.');
                btn.innerText = originalText;
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        });
    }
});