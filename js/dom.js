/* Tiny DOM helpers. Text always goes in as text nodes, never as HTML. */
(function (PM) {
  'use strict';
  var SVG = 'http://www.w3.org/2000/svg';

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    append(el, kids);
    return el;
  }

  function append(el, kids) {
    if (kids == null) return;
    if (!Array.isArray(kids)) kids = [kids];
    kids.forEach(function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) append(el, c);
      else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    });
  }

  // Inline stroke icon; `paths` are constants from this codebase, not user data.
  function icon(size, paths, cls) {
    var s = document.createElementNS(SVG, 'svg');
    s.setAttribute('width', size); s.setAttribute('height', size);
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    if (cls) s.setAttribute('class', cls);
    paths.forEach(function (d) {
      var p = document.createElementNS(SVG, d.rect ? 'rect' : 'path');
      if (d.rect) { for (var k in d.rect) p.setAttribute(k, d.rect[k]); } else p.setAttribute('d', d);
      s.appendChild(p);
    });
    return s;
  }

  function mount(root, node) {
    while (root.firstChild) root.removeChild(root.firstChild);
    root.appendChild(node);
  }

  // Wrap Latin runs inside Chinese text in <span lang="en"> so each script gets the right font.
  function mixed(text) {
    var out = [], re = /[A-Za-z][A-Za-z0-9'’\-\. ]*[A-Za-z0-9]|[A-Za-z]/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(text.slice(last, m.index));
      out.push(h('span', {lang: 'en'}, m[0]));
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }

  PM.dom = {h: h, icon: icon, mount: mount, mixed: mixed};
})(window.PM = window.PM || {});
