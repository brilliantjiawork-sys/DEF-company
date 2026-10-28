/* DEF Company CMS-driven page content. Text and editable media live in small, clearly separated JSON files. */
(() => {
  'use strict';

  const safeText = (value, max = 5000) => String(value ?? '').trim().slice(0, max);
  const setText = (selector, value) => {
    const element = document.querySelector(selector);
    if (element && value !== undefined && value !== null) element.textContent = safeText(value);
  };
  const setTextFrom = (element, value) => {
    if (element && value !== undefined && value !== null) element.textContent = safeText(value);
  };
  function imageUrl(value) {
    const raw = safeText(value, 1200);
    if (!raw || raw.startsWith('//') || /^javascript:/i.test(raw)) return '';
    let url = raw.startsWith('https://') || raw.startsWith('/') ? raw : '/' + raw.replace(/^\.\//, '');
    if (url.includes('/social-youtube-wide.jpg') && !url.includes('v=20261029-final-v6')) url += (url.includes('?') ? '&' : '?') + 'v=20261029-final-v6';
    return url;
  }
  const setImage = (element, value, alt = '') => {
    if (!element) return;
    const url = imageUrl(value);
    if (url) element.setAttribute('src', url);
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
    const brand = data.brand || {};
    const nav = data.navigation || {};
    const home = data.home || {};
    const newsroom = data.newsroom || {};
    const contact = data.contact || {};
    const cookie = data.cookie || {};

    if (brand.page_title) document.title = safeText(brand.page_title);
    setImage(document.querySelector('.logo img'), brand.logo, brand.logo_alt || brand.name);
    setText('.logo h1', brand.name || 'DEF Company');
    setText('.logo span', brand.tagline);

    // Stable IDs prevent the old menu-position bug that changed Newsroom/Contact Sales back to old labels.
    setText('#nav-home', nav.home || 'Home');
    setText('#nav-newsroom', nav.newsroom || 'Newsroom');
    setText('#nav-contact-sales', nav.contact_sales || 'Contact Sales');
    setText('#nav-stories', newsroom.sidebar_stories || 'Stories');
    setText('#nav-events', newsroom.sidebar_events || 'Trade Shows');
    setText('#nav-social', newsroom.sidebar_social || 'Social Media');
    setText('#nav-media', newsroom.sidebar_media || 'Media');

    // Home: only two editable sections, Brand Introduction and Newsletter.
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

    // Newsroom page copy.
    setText('#view-stories > .nr-title', newsroom.stories_title || 'Stories');
    setText('#view-stories .stories-intro', newsroom.stories_intro);
    setText('#view-story-detail .back-btn', newsroom.stories_back_button || '← Back to Stories');
    setText('#view-events > .nr-title', newsroom.events_title || 'Trade Shows');
    setText('#view-events .events-intro', newsroom.events_intro);
    setText('#events-upcoming-title', newsroom.events_upcoming_heading || 'Upcoming Shows');
    setText('#event-articles-title', newsroom.events_articles_heading || 'Trade Show Articles');
    const eventVisit = document.getElementById('ed-url');
    if (eventVisit && newsroom.events_visit_link) eventVisit.textContent = safeText(newsroom.events_visit_link, 100);
    setText('#view-social > .nr-title', newsroom.social_title || 'Social Media');
    setText('#view-media > .nr-title', newsroom.media_title || 'Media');
    setText('#view-media .media-intro', newsroom.media_intro);

    // Contact form labels. The form handlers and field names are deliberately unchanged.
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

    // Cookie copy only; consent mechanics remain in config.js/app.js.
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
    let imagePath = channel.image;
    // The old YouTube image was portrait with white/blank side areas. Replace only that legacy default.
    if (/youtube/i.test(safeText(channel.platform, 50)) && /social-youtube(?:-wide)?\.(jpg|jpeg|png|webp)$/i.test(safeText(channel.image, 500))) {
      imagePath = '/images/social-youtube-wide.jpg?v=20261029-final-v6';
    }
    setImage(image, imagePath, channel.image_alt || channel.platform);
    image.onerror = () => {
      image.onerror = null;
      image.removeAttribute('src');
      image.alt = safeText(channel.image_alt || channel.platform);
      imageWrap.classList.add('social-image-unavailable');
    };
    const logo = el('div', 'social-logo');
    const platformClass = 'platform-' + safeText(channel.platform, 50).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    logo.appendChild(el('span', 'social-logo-label ' + platformClass, platformMark(channel.platform)));
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
      if (!featured) { link.style.padding = '8px 16px'; link.style.fontSize = '14px'; }
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
      channels.slice(1).forEach(channel => sub.appendChild(makeSocialCard(channel, false)));
      fragment.appendChild(sub);
    }
    wrapper.replaceChildren(fragment);
  }

  function renderMediaContacts(data) {
    const grid = document.querySelector('#view-media .media-grid');
    if (!grid) return;
    const contacts = Array.isArray(data?.contacts) ? data.contacts.filter(item => item && item.active !== false) : [];
    const fragment = document.createDocumentFragment();
    contacts.forEach(contact => {
      const card = el('article', 'media-card');
      const imageWrap = el('div', 'media-card-img-container');
      const image = el('img');
      setImage(image, contact.portrait, contact.portrait_alt || contact.name || 'Media contact portrait');
      image.loading = 'lazy';
      image.decoding = 'async';
      image.onerror = () => { image.onerror = null; image.removeAttribute('src'); imageWrap.classList.add('media-card-no-image'); };
      imageWrap.appendChild(image);
      card.appendChild(imageWrap);
      card.appendChild(el('h3', '', contact.name || 'Media contact'));
      const details = el('p', 'media-card-details');
      if (contact.title) details.appendChild(el('span', 'media-contact-title', contact.title));
      if (contact.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeText(contact.email, 250))) {
        const email = el('a', 'media-contact-email', safeText(contact.email, 250));
        email.href = 'mailto:' + safeText(contact.email, 250);
        details.appendChild(email);
      }
      card.appendChild(details);
      fragment.appendChild(card);
    });
    if (!contacts.length) fragment.appendChild(el('p', 'content-status-message', 'Media contacts will be published here soon.'));
    grid.replaceChildren(fragment);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const paths = [
      '/data/home-intro.json',
      '/data/home-newsletter.json',
      '/data/database.json',
      '/data/events.json',
      '/data/newsroom-social-media.json',
      '/data/newsroom-media.json',
      '/data/contact-content.json',
      '/data/cookie-content.json',
      '/data/social-media.json',
      '/data/media-contacts.json'
    ];
    const results = await Promise.allSettled(paths.map(readJson));
    const get = (index) => results[index].status === 'fulfilled' && results[index].value && typeof results[index].value === 'object' ? results[index].value : {};
    const intro = get(0);
    const newsletter = get(1);
    const stories = get(2);
    const events = get(3);
    const socialPage = get(4);
    const mediaPage = get(5);
    const contact = get(6);
    const cookie = get(7);
    const merged = {
      brand: intro,
      navigation: { home: intro.nav_home || 'Home', newsroom: intro.nav_newsroom || 'Newsroom', contact_sales: intro.nav_contact_sales || 'Contact Sales' },
      home: Object.assign({}, intro, newsletter),
      newsroom: {
        sidebar_stories: 'Stories', sidebar_events: 'Trade Shows', sidebar_social: 'Social Media', sidebar_media: 'Media',
        stories_title: stories.page_title || 'Stories', stories_intro: stories.page_intro || 'Explore industrial vision technology, industry applications and insights.', stories_back_button: stories.back_button || '← Back to Stories',
        events_title: events.page_title || 'Trade Shows', events_intro: events.page_intro || 'Discover upcoming shows and relevant technical content.', events_back_button: events.back_button || '← Back to Trade Shows',
        events_upcoming_heading: events.upcoming_heading || 'Upcoming Shows', events_articles_heading: events.articles_heading || 'Trade Show Articles', events_visit_link: events.visit_link || 'Visit trade show website',
        social_title: socialPage.social_title || 'Social Media', social_disclaimer_lead: socialPage.social_disclaimer_lead, social_disclaimer_text: socialPage.social_disclaimer_text,
        media_title: mediaPage.media_title || 'Media', media_intro: mediaPage.media_intro, media_disclaimer_lead: mediaPage.media_disclaimer_lead, media_disclaimer_text: mediaPage.media_disclaimer_text,
        image_source_label: socialPage.image_source_label || mediaPage.image_source_label, image_source_url: socialPage.image_source_url || mediaPage.image_source_url
      },
      contact,
      cookie
    };
    applySiteContent(merged);
    if (results[8].status === 'fulfilled') renderSocialMedia(results[8].value);
    else console.error('Social media content could not be loaded:', results[8].reason);
    if (results[9].status === 'fulfilled') renderMediaContacts(results[9].value);
    else console.error('Media contacts could not be loaded:', results[9].reason);
  });
})();
