// js/actions.js — делегированные обработчики событий вместо inline onclick/onchange/oninput.
//
// Зачем: политика CSP без 'unsafe-inline' запрещает атрибуты onclick="..." — такой код
// браузер не выполняет. Вместо кода в атрибутах мы храним ДАННЫЕ:
//
//   <button data-click='[["go","bookings",{"$":"this"}]]'>   ≡  onclick="go('bookings', this)"
//   <select data-change='[["sortB",{"$":"value"}]]'>         ≡  onchange="sortB(this.value)"
//
// Атрибут — JSON-список действий [имя, аргумент, ...]. Выполняются только функции,
// явно зарегистрированные через RDActions.register({...}), и несколько встроенных
// ($toggle, $removeParent, $stop, $open, $scrollTo). Ничего не вычисляется через eval,
// поэтому даже если в атрибут попадёт чужая строка, она останется просто аргументом.
//
// Аргументы: строка/число/null как есть; {"$":"this"} — элемент с атрибутом;
// {"$":"value"} — его .value; {"$":"valueOf","id":"x"} — .value элемента #x.
(function () {
  'use strict';
  var registry = Object.create(null);

  var BUILTIN = {
    $toggle: function (el, ev, cls) { el.classList.toggle(cls); },
    $removeParent: function (el) { if (el.parentElement) el.parentElement.remove(); },
    $stop: function (el, ev) { ev.stopPropagation(); ev.__rdStopped = true; },
    $open: function (el, ev, url, target) {
      // Только http(s) и относительные адреса; noopener — чтобы открытая вкладка не получала window.opener.
      if (typeof url !== 'string' || /^\s*(javascript|data|vbscript):/i.test(url)) return;
      window.open(url, target || '_blank', 'noopener,noreferrer');
    },
    $scrollTo: function (el, ev, id) {
      var t = document.getElementById(id);
      if (t) t.scrollIntoView({ behavior: 'smooth' });
    }
  };

  function resolve(tok, el) {
    if (tok && typeof tok === 'object') {
      if (tok.$ === 'this') return el;
      if (tok.$ === 'value') return el.value;
      if (tok.$ === 'valueOf') { var t = document.getElementById(tok.id); return t ? t.value : ''; }
    }
    return tok;
  }

  function run(el, attr, ev) {
    var list;
    try { list = JSON.parse(el.getAttribute(attr)); } catch (e) { return; }
    if (!Array.isArray(list)) return;
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!Array.isArray(item) || typeof item[0] !== 'string') continue;
      var name = item[0];
      var args = item.slice(1).map(function (a) { return resolve(a, el); });
      var fn = BUILTIN[name] || registry[name];
      if (typeof fn !== 'function') { if (window.console) console.warn('[actions] неизвестное действие:', name); continue; }
      if (BUILTIN[name]) fn.apply(null, [el, ev].concat(args));
      else fn.apply(null, args);
    }
  }

  // Эмулируем всплытие inline-обработчиков: срабатывают все предки с атрибутом, пока кто-то не вызвал $stop.
  function dispatch(type) {
    var attr = 'data-' + type;
    document.addEventListener(type, function (ev) {
      for (var n = ev.target; n && n.nodeType === 1; n = n.parentElement) {
        if (n.hasAttribute(attr)) {
          run(n, attr, ev);
          if (ev.__rdStopped) break;
        }
      }
    });
  }
  ['click', 'change', 'input'].forEach(dispatch);

  // Помощник для разметки, которую строит JS: атрибут с JSON-данными, безопасно экранированный.
  function attr(type, actions) {
    var json = JSON.stringify(actions)
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return 'data-' + type + '="' + json + '"';
  }

  window.RDActions = {
    register: function (map) { Object.keys(map).forEach(function (k) { if (typeof map[k] === 'function') registry[k] = map[k]; }); },
    attr: attr
  };
})();
