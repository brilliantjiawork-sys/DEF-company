function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if(id === 'newsroom') switchView('ov');
    window.scrollTo(0, 0);
}

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + viewId).classList.add('active');
    document.querySelectorAll('.nr-sidebar a').forEach(a => a.classList.remove('active'));
    const navEl = document.getElementById('nav-' + viewId.replace('-detail', 's'));
    if(navEl) navEl.classList.add('active');
    window.scrollTo(0, 80);
}

let storiesData = [];
let eventsData = [];

async function loadCloudData() {
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
                            <img src="${story.image || 'images/story-cover.jpg'}">
                            <div class="list-info">
                                <div style="font-size: 13px; color: #888; margin-bottom: 8px;">${new Date(story.date).toLocaleDateString()}</div>
                                <h4>${story.title}</h4>
                                <div style="margin-top:12px;">${tagsHtml}</div>
                            </div>
                        </div>`;
                });
            }
        }
    } catch (e) {}

    try {
        const res = await fetch('data/events.json');
        if (res.ok) {
            const data = await res.json();
            eventsData = data.exhibitions || [];
            const container = document.getElementById('events-list');
            if(container) {
                container.innerHTML = '';
                eventsData.forEach(ev => {
                    container.innerHTML += `
                        <div class="list-card">
                            <img src="${ev.cover || 'images/event-1.jpg'}">
                            <div class="list-info">
                                <span class="kone-tag">${ev.year}</span>
                                <h4 style="margin-top:8px;">${ev.title}</h4>
                                <p style="font-size:16px; font-weight:600; margin:4px 0;">📍 ${ev.booth || 'Booth TBD'}</p>
                                <p style="color:var(--gray); margin:0; font-size:14px;">${ev.date} • ${ev.loc}</p>
                            </div>
                        </div>`;
                });
            }
        }
    } catch (e) {}
}

function showStoryDetail(index) {
    const story = storiesData[index];
    if(!story) return;
    document.getElementById('sd-img').src = story.image || 'images/story-cover.jpg';
    document.getElementById('sd-date').innerText = new Date(story.date).toLocaleDateString();
    document.getElementById('sd-title').innerText = story.title;
    try { document.getElementById('sd-body').innerHTML = marked.parse(story.body || ""); } catch(e) {}
    switchView('story-detail');
}

document.addEventListener("DOMContentLoaded", () => {
    loadCloudData();

    // Contact Sales 表单提交与 GTM 触发
    const contactForm = document.getElementById('detailed-contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const btn = this.querySelector('button');
            if(btn) { btn.innerText = 'Submitting...'; btn.disabled = true; }

            fetch(SITE_CONFIG.contactUrl, { method: 'POST', mode: 'no-cors', body: new FormData(this) })
            .then(() => {
                // 🎯 空投 GTM 底层事件，100% 触发你的 Form Submission
                window.dataLayer = window.dataLayer || [];
                window.dataLayer.push({
                    'event': 'gtm.formSubmit',
                    'form_id': 'contact_sales_form'
                });

                document.getElementById('form-container-box').style.display = 'none';
                document.getElementById('success-screen').style.display = 'block';
                window.scrollTo(0,0);
            });
        });
    }

    // Newsletter 表单提交与 GTM 触发
    const newsForm = document.getElementById('newsletter-form');
    if (newsForm) {
        newsForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email = document.getElementById('nl-email').value.trim();
            if (!email) return;
            const btn = this.querySelector('button');
            if(btn) { btn.innerText = 'Subscribing...'; btn.disabled = true; }

            await fetch(SITE_CONFIG.newsletterUrl, { method: 'POST', body: new URLSearchParams({ email }), mode: 'no-cors' });
            
            // 🎯 空投 GTM 底层事件，100% 触发你的 Form Submission
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({
                'event': 'gtm.formSubmit',
                'form_id': 'newsletter_form'
            });
            
            document.getElementById('nl-form-container').style.display = 'none';
            document.getElementById('nl-success-box').style.display = 'block';
        });
    }

    // Cookie 弹窗
    setTimeout(() => {
        const banner = document.getElementById('cookie-banner');
        if (banner) banner.style.display = 'block';
    }, 500);
});