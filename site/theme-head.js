// Runs in <head>, right after the inline live stylesheet. If ?theme=<slug>
// (or a saved choice) names an allowlisted theme, swap the live CSS for
// themes/<slug>.css before first paint. The default theme costs nothing.
// `cfg` is window.JH_THEMES, injected by scripts/build-site.mjs.
(function (cfg) {
  var ok = Object.create(null);
  cfg.themes.forEach(function (t) { ok[t.slug] = t; });
  var want = null;
  try { want = new URLSearchParams(location.search).get('theme'); } catch (e) {}
  if (want === null) { try { want = localStorage.getItem('theme'); } catch (e) {} }
  var t = want === null ? null : ok[want];
  if (!t) return;
  // Only allowlisted slugs ever reach the URL. document.write keeps the
  // stylesheet parser-inserted, so it blocks rendering: no flash of the dark page.
  document.getElementById('live-css').media = 'not all';
  document.write('<link rel="stylesheet" id="theme-css" data-theme-css href="themes/' + t.slug + '.css" onerror="this.remove();document.getElementById(\'live-css\').media=\'\';document.documentElement.removeAttribute(\'data-theme\')">');
  document.documentElement.setAttribute('data-theme', t.slug);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t.color;
})(window.JH_THEMES);
