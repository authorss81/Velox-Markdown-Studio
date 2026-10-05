// Applies the persisted theme before first paint to avoid a flash of the wrong
// colour scheme. This lives in an external file rather than an inline <script>
// so the production Content-Security-Policy can keep script-src 'self' and stay
// free of 'unsafe-inline' — inline handlers are exactly what blocks the
// markdown XSS payloads from firing.
(function () {
  try {
    var raw = window.localStorage.getItem('velox_settings_v1');
    var theme = raw ? JSON.parse(raw).theme : 'dark';
    document.documentElement.classList.add(theme === 'light' ? 'light' : 'dark');
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
