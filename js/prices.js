(function () {
  // Коэффициенты можно менять здесь — они влияют только на вилку в калькуляторе.
  var SPREAD = 1.3; // верхняя граница вилки = нижняя × SPREAD
  var FALLBACK = [
    { name: 'Комплексная мойка', price: 1200 },
    { name: 'Детейлинг кузова', price: 5000 },
    { name: 'Химчистка салона', price: 3000 },
    { name: 'Мойка дисков и шин', price: 600 },
    { name: 'Полировка фар', price: 800 },
    { name: 'Керамическое покрытие', price: 9000 },
    { name: 'Озонирование салона', price: 1000 },
    { name: 'Мойка подкапотного пространства', price: 1500 },
    { name: 'Обработка защитными составами', price: 1500 },
    { name: 'Оклейка PPF', price: 15000 }
  ];
  var sel = document.getElementById('calc-service');
  var cls = document.getElementById('calc-class');
  var cond = document.getElementById('calc-cond');
  var out = document.getElementById('calc-price');
  var book = document.getElementById('calc-book');
  if (!sel) return;
  var services = FALLBACK;

  function fmt(n) { return Math.round(n / 100) * 100; }
  function money(n) { return fmt(n).toLocaleString('ru-RU') + ' \u20BD'; }

  function fill() {
    sel.textContent = '';
    services.forEach(function (svc, i) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = svc.name;
      sel.appendChild(o);
    });
  }

  function calc() {
    var svc = services[Number(sel.value)] || services[0];
    if (!svc) return;
    var base = Number(svc.price) || 0;
    var disc = Number(svc.discount || 0);
    if (disc > 0) base = base * (1 - disc / 100);
    var low = base * Number(cls.value) * Number(cond.value);
    var high = low * SPREAD;
    out.textContent = 'от ' + money(low) + ' до ' + money(high);
    book.href = 'booking.html?service=' + encodeURIComponent(svc.name);
  }

  fill();
  calc();
  [sel, cls, cond].forEach(function (el) { el.addEventListener('change', calc); });

  fetch('/api/services').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    var list = d && d.services ? d.services.filter(function (x) { return x.active; }) : [];
    if (!list.length) return;
    var prev = services[Number(sel.value)];
    services = list;
    fill();
    var idx = prev ? services.findIndex(function (x) { return x.name === prev.name; }) : 0;
    sel.value = String(idx >= 0 ? idx : 0);
    calc();
  }).catch(function () {});
})();
