/*
 * DEF Company CMS-driven marketing content.
 * Marketing-owned text, images, social links, and media contacts are read from data/*.json,
 * so routine content updates can be completed in Sveltia CMS without editing HTML.
 */
(() => {
  'use strict';

  const safeText = (value, max = 5000) => String(value ?? '').trim().slice(0, max);
  let activeNewsroomCopy = {};

  function applyEventSectionHeadings() {
    document.querySelectorAll('#events-list .events-section-title').forEach((heading) => {
      const original = safeText(heading.textContent, 300).toLowerCase();
      let desired = '';
      if (/upcoming|future|exhibition/.test(original)) {
        desired = safeText(activeNewsroomCopy.events_upcoming_heading || 'Upcoming Trade Shows');
      } else if (/past|report|highlight|historical/.test(original)) {
        desired = safeText(activeNewsroomCopy.events_past_heading || 'Past Trade Shows');
      } else if (/confirm|unknown|date/.test(original)) {
        desired = safeText(activeNewsroomCopy.events_unknown_heading || 'Trade Shows — Dates to Be Confirmed');
      }
      if (desired && heading.textContent.trim() !== desired) heading.textContent = desired;
    });
    const visitLabel = safeText(activeNewsroomCopy.events_visit_link || 'Visit trade show website');
    document.querySelectorAll('#events-list a.event-link').forEach((link) => {
      if (link.textContent.trim() !== visitLabel) link.textContent = visitLabel;
    });
  }

  function watchEventSectionHeadings() {
    const container = document.getElementById('events-list');
    if (!container || container.dataset.headingObserverReady === 'true') return;
    container.dataset.headingObserverReady = 'true';
    const observer = new MutationObserver(applyEventSectionHeadings);
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    applyEventSectionHeadings();
  }
  const get = (object, path) => path.split('.').reduce((value, key) => value && value[key], object);
  const setText = (selector, value) => {
    const element = document.querySelector(selector);
    if (element && value !== undefined && value !== null) element.textContent = safeText(value);
  };
  const setImage = (element, value, alt = '') => {
    if (!element || !value) return;
    const raw = safeText(value, 1200);
    if (!raw || raw.startsWith('//') || /^javascript:/i.test(raw)) return;
    element.setAttribute('src', raw.startsWith('/') || /^https:\/\//i.test(raw) ? raw : '/' + raw.replace(/^\.\//, '').replace(/^\//, ''));
    element.setAttribute('alt', safeText(alt, 300));
    element.loading = 'lazy';
  };
  const safeHttps = (value) => {
    const raw = safeText(value, 1000);
    return /^https:\/\//i.test(raw) ? raw : '';
  };
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };
  async function readJson(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    return response.json();
  }

  function applySiteContent(data) {
    if (!data || typeof data !== 'object') return;
    const brand = data.brand || {};
    const nav = data.navigation || {};
    const home = data.home || {};
    const newsroom = data.newsroom || {};
    activeNewsroomCopy = newsroom;
    const contact = data.contact || {};
    const cookie = data.cookie || {};

    if (brand.page_title) document.title = safeText(brand.page_title);
    const logo = document.querySelector('.logo img');
    setImage(logo, brand.logo, brand.logo_alt || brand.name);
    setText('.logo h1', brand.name);
    setText('.logo span', brand.tagline);

    const menu = document.querySelector('.menu');
    if (menu) {
      const links = menu.querySelectorAll('a');
      const labels = [nav.home, nav.products, nav.solutions, nav.support, nav.newsroom, nav.contact_sales];
      labels.forEach((label, index) => { if (links[index] && label) links[index].textContent = safeText(label, 120); });
    }
    const sidebarLabels = {
      '#nav-ov': newsroom.sidebar_overview,
      '#nav-stories': newsroom.sidebar_stories,
      '#nav-events': newsroom.sidebar_events,
      '#nav-social': newsroom.sidebar_social,
      '#nav-media': newsroom.sidebar_media
    };
    Object.entries(sidebarLabels).forEach(([selector, value]) => setText(selector, value));

    setText('#home .hero-text h2', home.hero_title);
    setText('#home .hero-text p', home.hero_description);
    setText('#home .hero-text button', home.hero_button);
    setImage(document.querySelector('#home .hero > img'), home.hero_image, home.hero_image_alt);
    setImage(document.querySelector('.nl-img img'), home.newsletter_image, home.newsletter_image_alt);
    setText('.nl-img p', home.newsletter_image_caption);
    setText('#newsletter-form h3', home.newsletter_title);
    setText('#newsletter-form p', home.newsletter_description);
    const emailInput = document.getElementById('nl-email');
    if (emailInput && home.newsletter_email_placeholder) emailInput.placeholder = safeText(home.newsletter_email_placeholder, 120);
    setText('#newsletter-form button[type="submit"]', home.newsletter_button);
    setText('#nl-success-box h3', home.newsletter_success_title);
    setText('#nl-success-box p', home.newsletter_success_description);

    setText('#view-ov > .nr-title', newsroom.overview_title);
    renderOverviewCards(newsroom.overview_cards || {});
    setText('#view-stories > .nr-title', newsroom.stories_title);
    setText('#view-stories .stories-intro', newsroom.stories_intro);
    setText('#view-story-detail .back-btn', newsroom.stories_back_button);
    setText('#view-events > .nr-title', newsroom.events_title);
    setText('#view-events .events-intro', newsroom.events_intro);
    setText('#view-event-detail .back-btn', newsroom.events_back_button);
    setText('[data-events-tab="upcoming"]', newsroom.events_upcoming_tab);
    setText('[data-events-tab="past"]', newsroom.events_past_tab);
    applyEventSectionHeadings();
    setText('#events-year-filter label', newsroom.events_year_label);
    const eventVisit = document.getElementById('ed-url');
    if (eventVisit && newsroom.events_visit_link) eventVisit.textContent = safeText(newsroom.events_visit_link, 100);
    setText('#view-social > .nr-title', newsroom.social_title);
    setText('#view-media > .nr-title', newsroom.media_title);

    setText('#contact .form-header h2', contact.title);
    setText('#contact .form-header p', contact.description);
    const formFields = [
      ['email', contact.email_label], ['first_name', contact.first_name_label], ['last_name', contact.last_name_label],
      ['company', contact.company_label], ['phone', contact.phone_label], ['country', contact.country_label],
      ['zip_code', contact.zip_code_label], ['industry', contact.industry_label], ['message', contact.message_label]
    ];
    formFields.forEach(([name, label]) => {
      const field = document.querySelector(`#detailed-contact-form [name="${name}"]`);
      const labelElement = field && field.closest('.form-group') && field.closest('.form-group').querySelector('label');
      if (labelElement && label) labelElement.textContent = safeText(label, 100);
    });
    const countrySelect = document.querySelector('#detailed-contact-form [name="country"]');
    if (countrySelect && countrySelect.options[0] && contact.country_placeholder) countrySelect.options[0].textContent = safeText(contact.country_placeholder, 100);
    const industrySelect = document.querySelector('#detailed-contact-form [name="industry"]');
    if (industrySelect && industrySelect.options[0] && contact.industry_placeholder) industrySelect.options[0].textContent = safeText(contact.industry_placeholder, 100);
    const message = document.querySelector('#detailed-contact-form [name="message"]');
    if (message && contact.message_placeholder) message.placeholder = safeText(contact.message_placeholder, 250);
    setText('#detailed-contact-form .btn-submit', contact.submit_button);
    setText('#success-screen h2', contact.success_title);
    setText('#success-screen > p', contact.success_description);
    setText('#success-screen > button', contact.return_button);

    setText('#cookie-banner .cookie-content h3', cookie.title);
    setText('#cookie-banner .cookie-content p', cookie.description);
    setText('#cookie-reject', cookie.reject_button);
    setText('#cookie-customize', cookie.customize_button);
    setText('#cookie-accept', cookie.accept_button);
    setText('#cookie-save', cookie.save_button);
    setText('#cookie-reopen', cookie.reopen_button);
    const cookieRows = document.querySelectorAll('#cookie-panel .cookie-row');
    const rowCopy = [
      [cookie.necessary_title, cookie.necessary_description],
      [cookie.analytics_title, cookie.analytics_description],
      [cookie.marketing_title, cookie.marketing_description]
    ];
    rowCopy.forEach((copy, index) => {
      const row = cookieRows[index];
      if (!row) return;
      setTextFrom(row.querySelector('strong'), copy[0]);
      setTextFrom(row.querySelector('span'), copy[1]);
    });

    renderNotice(document.querySelector('.social-disclaimer'), newsroom.social_disclaimer_lead, newsroom.social_disclaimer_text, newsroom.image_source_label, newsroom.image_source_url);
    renderNotice(document.querySelector('.media-disclaimer'), newsroom.media_disclaimer_lead, newsroom.media_disclaimer_text, newsroom.image_source_label, newsroom.image_source_url);
  }

  function setTextFrom(element, value) {
    if (element && value !== undefined && value !== null) element.textContent = safeText(value);
  }

  function renderOverviewCards(cards) {
    const grid = document.querySelector('#view-ov .ov-grid');
    if (!grid || !cards || typeof cards !== 'object') return;
    const routes = ['social', 'stories', 'events', 'media'];
    const fragment = document.createDocumentFragment();
    routes.forEach((route) => {
      const item = cards[route];
      if (!item) return;
      const card = el('div', 'ov-card');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', safeText(item.title || route));
      const image = el('img');
      setImage(image, item.image, item.image_alt || item.title);
      const overlay = el('div', 'ov-overlay');
      overlay.appendChild(el('h3', '', item.title || route));
      card.append(image, overlay);
      card.addEventListener('click', () => { if (typeof window.switchView === 'function') window.switchView(route); });
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (typeof window.switchView === 'function') window.switchView(route);
        }
      });
      fragment.appendChild(card);
    });
    grid.replaceChildren(fragment);
  }

  function renderNotice(container, lead, body, sourceLabel, sourceUrl) {
    if (!container) return;
    const fragment = document.createDocumentFragment();
    if (lead) fragment.appendChild(el('strong', '', safeText(lead, 200)));
    if (body) fragment.appendChild(document.createTextNode(' ' + safeText(body, 2000)));
    const linkUrl = safeHttps(sourceUrl);
    if (linkUrl && sourceLabel) {
      const link = el('a', '', safeText(sourceLabel, 100));
      link.href = linkUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      fragment.appendChild(link);
      fragment.appendChild(document.createTextNode('.'));
    }
    container.replaceChildren(fragment);
  }

  const platformMark = (platform) => ({
    'LinkedIn': 'in', 'YouTube': '▶', 'Facebook': 'f', 'Instagram': '◎', 'X': 'X'
  }[safeText(platform, 50)] || safeText(platform, 2).slice(0, 2).toUpperCase() || '↗');

  function makeSocialCard(channel, featured) {
    const card = el('div', featured ? 'social-main' : 'social-card');
    const imageWrap = el('div', featured ? 'social-main-img' : 'social-card-img');
    const image = el('img');
    setImage(image, channel.image, channel.image_alt || channel.platform);
    image.onerror = () => { image.onerror = null; image.removeAttribute('src'); image.alt = safeText(channel.image_alt || channel.platform); };
    const logo = el('div', 'social-logo');
    logo.appendChild(el('span', 'social-logo-label', platformMark(channel.platform)));
    imageWrap.append(image, logo);

    const textWrap = el('div', featured ? 'social-main-text' : 'social-card-text');
    textWrap.appendChild(el(featured ? 'h3' : 'h4', '', channel.platform || 'Social channel'));
    textWrap.appendChild(el('p', '', channel.description || ''));
    const url = safeHttps(channel.url);
    if (url) {
      const link = el('a', 'btn-y', channel.button_text || 'Visit channel');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.style.alignSelf = 'flex-start';
      if (!featured) {
        link.style.padding = '8px 16px';
        link.style.fontSize = '14px';
      }
      textWrap.appendChild(link);
    }
    card.append(imageWrap, textWrap);
    return card;
  }

  function renderSocialMedia(data) {
    const wrapper = document.querySelector('#view-social .social-wrapper');
    if (!wrapper) return;
    const channels = Array.isArray(data?.channels) ? data.channels.filter(item => item && item.active !== false) : [];
    if (!channels.length) {
      wrapper.replaceChildren(el('p', 'content-status-message', 'Social media channels will be published here soon.'));
      return;
    }
    const fragment = document.createDocumentFragment();
    fragment.appendChild(makeSocialCard(channels[0], true));
    if (channels.length > 1) {
      const sub = el('div', 'social-sub');
      channels.slice(1).forEach((channel) => sub.appendChild(makeSocialCard(channel, false)));
      fragment.appendChild(sub);
    }
    wrapper.replaceChildren(fragment);
  }

  function renderMediaContacts(data) {
    const grid = document.querySelector('#view-media .media-grid');
    if (!grid) return;
    const contacts = Array.isArray(data?.contacts) ? data.contacts.filter(item => item && item.active !== false) : [];
    const fragment = document.createDocumentFragment();
    contacts.forEach((contact) => {
      const card = el('article', 'media-card');
      const imageWrap = el('div', 'media-card-img-container');
      const image = el('img');
      setImage(image, contact.portrait, contact.portrait_alt || contact.name);
      image.onerror = () => { image.onerror = null; image.removeAttribute('src'); };
      imageWrap.appendChild(image);
      card.appendChild(imageWrap);
      card.appendChild(el('h4', '', contact.name || 'Media contact'));
      const details = el('p');
      details.appendChild(document.createTextNode(safeText(contact.title, 200)));
      if (contact.email) {
        details.appendChild(document.createElement('br'));
        const email = safeText(contact.email, 250);
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          const link = el('a', '', email);
          link.href = 'mailto:' + email;
          details.appendChild(link);
        } else {
          details.appendChild(document.createTextNode(email));
        }
      }
      card.appendChild(details);
      fragment.appendChild(card);
    });
    if (!contacts.length) fragment.appendChild(el('p', 'content-status-message', 'Media contacts will be published here soon.'));
    grid.replaceChildren(fragment);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    watchEventSectionHeadings();
    // Load each file independently so a missing optional file does not block all CMS-managed content.
    const results = await Promise.allSettled([
      readJson('/data/site-content.json'),
      readJson('/data/social-media.json'),
      readJson('/data/media-contacts.json')
    ]);
    if (results[0].status === 'fulfilled') applySiteContent(results[0].value);
    else console.error('Site content could not be loaded:', results[0].reason);
    if (results[1].status === 'fulfilled') renderSocialMedia(results[1].value);
    else console.error('Social media content could not be loaded:', results[1].reason);
    if (results[2].status === 'fulfilled') renderMediaContacts(results[2].value);
    else console.error('Media contacts could not be loaded:', results[2].reason);
  });
})();
