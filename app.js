// ==========================================
// app.js - 处理页面交互与云端数据拉取
// ==========================================

// 1. 最基础的页面切换逻辑（优先执行，永不报错）
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

// 2. 全局变量
let storiesData = [];
let eventsData = [];

// 3. 从云端拉取数据的逻辑（包含极强的容错）
async function loadCloudData() {
    // --- (1) 拉取并替换全局图片 ---
    try {
        const res = await fetch('data/global_settings.json');
        if (res.ok) {
            const json = await res.json();
            const imgs = json.site_images || {};
            
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
    } catch (err) {
        console.log("图片数据未加载，使用默认图片");
    }

    // --- (2) 拉取并渲染文章列表 ---
    try {
        const res = await fetch('data/database.json');
        if (res.ok) {
            const json = await res.json();
            storiesData = json.articles || [];
            if (storiesData.length > 0) renderStories(storiesData);
        }
    } catch (err) {
        console.log("文章数据未加载，使用默认文章");
    }

    // --- (3) 拉取并渲染展会列表 ---
    try {
        const res = await fetch('data/events.json');
        if (res.ok) {
            const json = await res.json();
            eventsData = json.exhibitions || [];
            if (eventsData.length > 0) renderEvents(eventsData);
        }
    } catch (err) {
        console.log("展会数据未加载，使用默认展会");
    }
}

// 4. 渲染文章列表 (Kone 标签 + 阅读时间)
function renderStories(data) {
    const container = document.getElementById('stories-list');
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

// 5. 点击文章进入详情页
function showStoryDetail(index) {
    const story = storiesData[index];
    if (!story) return;
    document.getElementById('sd-img').src = story.image || 'images/story-cover.jpg';
    document.getElementById('sd-date').innerText = new Date(story.date).toLocaleDateString();
    document.getElementById('sd-title').innerText = story.title;
    
    // 使用 Markdown 解析多图、加粗、标题
    try {
        document.getElementById('sd-body').innerHTML = marked.parse(story.body || "");
    } catch(e) {
        document.getElementById('sd-body').innerText = story.body || "";
    }
    switchView('story-detail');
}

// 6. 渲染展会列表
function renderEvents(data) {
    const container = document.getElementById('events-list');
    container.innerHTML = '';
    data.forEach(ev => {
        const imgSrc = ev.cover || 'images/event-1.jpg';
        container.innerHTML += `
            <div class="event-card">
                <img src="${imgSrc}">
                <div class="event-info">
                    <span class="event-year-badge">${ev.year}</span>
                    <h4>${ev.title}</h4>
                    <p><strong>Date:</strong> ${ev.date}</p>
                    <p><strong>Location:</strong> ${ev.loc}</p>
                    <p><strong>Booth/Info:</strong> ${ev.desc || ''}</p>
                </div>
            </div>
        `;
    });
}

// 7. 页面加载完成后的动作
document.addEventListener("DOMContentLoaded", () => {
    // 拉取云端数据
    loadCloudData();
    
    // 延迟半秒弹出 Cookie
    setTimeout(() => {
        const banner = document.getElementById('cookie-banner');
        if (banner) banner.style.display = 'block';
    }, 500);
});