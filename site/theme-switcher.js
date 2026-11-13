// The "Theme" dropdown. A <theme-switcher> custom element with its own Shadow
// DOM, so no theme stylesheet can restyle or hide it. It is created by script,
// so it only exists when JS runs and the page markup stays identical for
// every theme. `cfg` is window.JH_THEMES, injected by scripts/build-site.mjs.
(function (cfg) {
  if (!window.customElements || !document.head.attachShadow) return;
  var ok = Object.create(null);
  cfg.themes.forEach(function (t) { ok[t.slug] = t; });
  var html = document.documentElement;
  var live = document.getElementById('live-css');
  var meta = document.querySelector('meta[name="theme-color"]');
  var pending = 0;

  function current() {
    var s = html.getAttribute('data-theme');
    return s && ok[s] ? s : '';
  }

  function remember(slug) {
    try { slug ? localStorage.setItem('theme', slug) : localStorage.removeItem('theme'); } catch (e) {}
    try {
      var u = new URL(location.href);
      slug ? u.searchParams.set('theme', slug) : u.searchParams.delete('theme');
      history.replaceState(history.state, '', u.href);
    } catch (e) {}
  }

  function settle(slug) {
    var t = ok[slug];
    if (meta) meta.content = t ? t.color : cfg.defaultColor;
    if (t) html.setAttribute('data-theme', slug); else html.removeAttribute('data-theme');
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: slug || null } }));
  }

  function apply(slug) {
    var t = ok[slug];
    var my = ++pending;
    var links = document.querySelectorAll('link[data-theme-css]');
    if (!t) {
      links.forEach(function (l) { l.remove(); });
      live.media = '';
      settle('');
      return;
    }
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.setAttribute('data-theme-css', '');
    link.href = 'themes/' + t.slug + '.css';
    // Keep the old styles until the new sheet has loaded, then swap.
    link.onload = function () {
      if (my !== pending) { link.remove(); return; }
      document.querySelectorAll('link[data-theme-css]').forEach(function (l) { if (l !== link) l.remove(); });
      link.id = 'theme-css';
      live.media = 'not all';
      settle(slug);
    };
    link.onerror = function () { link.remove(); };
    document.head.appendChild(link);
  }

  var CSS =
    'label{display:flex;align-items:center;gap:6px;margin:0;padding:4px 4px 4px 12px;background:#fff;color:#111;' +
    'border:1px solid rgba(0,0,0,.18);border-radius:999px;box-shadow:0 4px 16px rgba(0,0,0,.18);' +
    "font:600 12px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;letter-spacing:0;text-transform:none}" +
    'select{font:inherit;font-weight:500;color:#111;background:#f1f1f3 url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' fill=\'none\' stroke=\'%23111\' stroke-width=\'1.5\'/%3E%3C/svg%3E") no-repeat right 10px center;' +
    'border:0;border-radius:999px;padding:6px 28px 6px 10px;margin:0;-webkit-appearance:none;appearance:none;cursor:pointer;max-width:46vw}' +
    'select:hover{background-color:#e6e6ea}select:focus-visible{outline:2px solid #2563eb;outline-offset:2px}';

  // Host styles go inline with !important so theme rules (e.g. `body *`) can't win.
  var HOST = 'all:initial!important;display:block!important;position:fixed!important;right:12px!important;z-index:2147483000!important;';

  class ThemeSwitcher extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      var root = this.attachShadow({ mode: 'open' });
      var style = document.createElement('style');
      style.textContent = CSS;
      var label = document.createElement('label');
      var span = document.createElement('span');
      span.textContent = cfg.label;
      var select = document.createElement('select');
      select.setAttribute('aria-label', cfg.label);
      [{ slug: '', name: cfg.defaultName }].concat(cfg.themes).forEach(function (t) {
        var o = document.createElement('option');
        o.value = t.slug;
        o.textContent = t.name;
        select.appendChild(o);
      });
      select.value = current();
      select.addEventListener('change', function () {
        remember(select.value);
        apply(select.value);
      });
      label.append(span, select);
      root.append(style, label);
      this.select = select;
      this.place();
    }
    // Sit at the top right, just under the nav bar (or near the top when the
    // nav is a side rail or has scrolled away). Some themes ask for bottom.
    place() {
      var t = ok[current()];
      var css = HOST;
      if (t && t.pos === 'bottom') {
        css += 'bottom:16px!important;';
      } else {
        var top = 12;
        var nav = document.querySelector('nav');
        if (nav) {
          var r = nav.getBoundingClientRect();
          if (r.height < innerHeight / 2 && r.bottom > 0) top = Math.round(r.bottom + 8);
        }
        css += 'top:' + top + 'px!important;';
      }
      if (this.style.cssText !== css) this.style.cssText = css;
      if (this.select && this.select.value !== current()) this.select.value = current();
    }
  }
  customElements.define('theme-switcher', ThemeSwitcher);

  var el = document.createElement('theme-switcher');
  document.body.appendChild(el);
  var queued = false;
  function replace() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; el.place(); });
  }
  addEventListener('resize', replace);
  addEventListener('scroll', replace, { passive: true });
  addEventListener('load', replace);
  document.addEventListener('themechange', replace);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(replace);
})(window.JH_THEMES);
