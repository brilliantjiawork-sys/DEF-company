/*
 * Compatibility adapter for the Events CMS.
 * CMS editors maintain two easy lists: announcements and reports.
 * The existing website app.js still consumes { exhibitions: [...] }, so this adapter
 * converts the JSON response without changing the rest of the site's event logic.
 */
(() => {
  'use strict';
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async function(input, init) {
    const response = await nativeFetch(input, init);
    try {
      const requestUrl = typeof input === 'string' ? input : (input && input.url) ? input.url : String(input);
      const url = new URL(requestUrl, window.location.href);
      if (!url.pathname.endsWith('/data/events.json') || !response.ok) return response;

      const data = await response.clone().json();
      const hasSplitLists = Array.isArray(data.announcements) || Array.isArray(data.reports);
      if (!hasSplitLists) return response;

      const announcements = Array.isArray(data.announcements) ? data.announcements : [];
      const reports = Array.isArray(data.reports) ? data.reports : [];
      const exhibitions = [
        ...announcements.map((item) => ({ ...item, content_type: 'announcement' })),
        ...reports.map((item) => ({
          ...item,
          content_type: 'report',
          gallery: Array.isArray(item.gallery) ? item.gallery.map((entry) => typeof entry === 'string' ? entry : (entry && (entry.image || entry.url) ? (entry.image || entry.url) : '')).filter(Boolean) : []
        }))
      ];
      const headers = new Headers(response.headers);
      headers.set('Content-Type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify({ exhibitions }), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (error) {
      console.error('Events data adapter could not normalize the response:', error);
      return response;
    }
  };
})();
