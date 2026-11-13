// The "Theme" dropdown in the nav bar (between Interests and Contact). A
// <theme-switcher> custom element with its own Shadow DOM, so no theme
// stylesheet can restyle its insides. It is created by script, so it only
// exists when JS runs and the page markup stays identical for every theme. `cfg` is window.JH_THEMES, injected by scripts/build-site.mjs.
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

  // A compact "Theme ▾" chip. The real <select> is laid invisibly over it, so
  // clicking opens the native picker and keyboard/screen readers get a normal
  // select. Opaque light chip, so it reads the same on every theme's nav.
  var CSS =
    ':host{all:initial;display:inline-block;vertical-align:middle;max-width:100%}' +
    '.chip{position:relative;display:inline-flex;align-items:center;gap:3px;height:28px;padding:0 7px 0 9px;box-sizing:border-box;' +
    'background:#fff;color:#111;border:1px solid rgba(0,0,0,.2);border-radius:999px;box-shadow:0 1px 2px rgba(0,0,0,.12);' +
    "font:600 11.5px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;letter-spacing:0;text-transform:none;white-space:nowrap;cursor:pointer}" +
    '.chip:hover{background:#f1f1f3}.chip:focus-within{outline:2px solid #2563eb;outline-offset:2px}' +
    'svg{flex:none}' +
    'select{position:absolute;inset:0;width:100%;height:100%;margin:0;padding:0;border:0;opacity:0;cursor:pointer;font:inherit;-webkit-appearance:none;appearance:none}';

  class ThemeSwitcher extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      var root = this.attachShadow({ mode: 'open' });
      var style = document.createElement('style');
      style.textContent = CSS;
      var chip = document.createElement('span');
      chip.className = 'chip';
      var text = document.createElement('span');
      text.textContent = cfg.label;
      text.setAttribute('aria-hidden', 'true');
      chip.appendChild(text);
      chip.insertAdjacentHTML('beforeend', '<svg aria-hidden="true" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>');
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
      chip.appendChild(select);
      root.append(style, chip);
      this.select = select;
    }
  }
  customElements.define('theme-switcher', ThemeSwitcher);

  // Goes in the nav, between the last section link and Contact. The <li> is
  // added by script, so the page markup stays identical for every theme. Its
  // inline !important display beats the ≤700px rule that hides the section
  // links, so the dropdown stays reachable on phones.
  var list = document.querySelector('nav .nav-links');
  if (!list) return;
  var item = document.createElement('li');
  item.style.cssText = 'display:flex!important;align-items:center!important;list-style:none!important;margin:0 0.25rem!important';
  item.appendChild(document.createElement('theme-switcher'));
  var cta = list.querySelector('.nav-cta');
  var ctaItem = cta && cta.closest('li');
  list.insertBefore(item, ctaItem && ctaItem.parentNode === list ? ctaItem : null);
  document.addEventListener('themechange', function () {
    var el = item.firstChild;
    if (el.select && el.select.value !== current()) el.select.value = current();
  });
})(window.JH_THEMES);
