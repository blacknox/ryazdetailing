      // ── API бэкенда ──
      // Локально (при открытии файла напрямую) укажите полный адрес сервера,
      // например 'http://localhost:3000/api'. На проде, если бэкенд проксируется
      // через Nginx на том же домене (см. README бэкенда), '/api' работает как есть.
      const API_BASE = '/api';

      // Extra services toggle
      function toggleExtra() {
        const panel = document.getElementById('extra-panel');
        const arrow = document.getElementById('extra-arrow');
        const btn = document.getElementById('extra-toggle');
        const isOpen = panel.classList.toggle('open');
        arrow.textContent = isOpen ? '−' : '+';
        btn.style.borderColor = isOpen ? 'var(--gold)' : '';
        btn.style.color = isOpen ? 'var(--gold)' : '';
      }

      // Service selection
      function selectService(el) {
        document.querySelectorAll('.svc-option').forEach(o => o.classList.remove('active'));
        el.classList.add('active');
        el.querySelector('input').checked = true;
      }

      // Time selection
      function selectTime(el) {
        document.querySelectorAll('.time-slot:not(.busy)').forEach(s => { s.classList.remove('active'); s.setAttribute('aria-pressed', 'false'); });
        el.classList.add('active');
        el.setAttribute('aria-pressed', 'true');
      }

      // Calendar
      const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
      // «Сегодня» считаем по Рязани (Europe/Moscow), а не по часовому поясу
      // браузера посетителя — иначе вечером/ночью дата может «уезжать».
      function ryazanNow() {
        const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
        const g = t => Number(p.find(x => x.type === t).value);
        return { y: g('year'), m: g('month'), d: g('day'), minutes: (g('hour') % 24) * 60 + g('minute') };
      }
      const nowR = ryazanNow();
      let curYear = nowR.y, curMonth = nowR.m - 1;
      let selectedDay = nowR.d;
      const isPastDate = (y, m, d) => new Date(y, m, d) < new Date(nowR.y, nowR.m - 1, nowR.d);

      function renderCalendar() {
        const title = document.getElementById('cal-title');
        const grid = document.getElementById('cal-grid');
        title.textContent = monthNames[curMonth] + ' ' + curYear;
        grid.innerHTML = '';

        const firstDay = new Date(curYear, curMonth, 1).getDay();
        const offset = firstDay === 0 ? 6 : firstDay - 1;
        const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate();
        const daysInPrev = new Date(curYear, curMonth, 0).getDate();
        // Если выбранного дня нет в этом месяце или он уже в прошлом — берём
        // ближайший доступный день месяца.
        if (selectedDay > daysInMonth) selectedDay = daysInMonth;
        if (isPastDate(curYear, curMonth, selectedDay)) {
          selectedDay = (curYear === nowR.y && curMonth === nowR.m - 1) ? nowR.d : 1;
        }

        // Prev month padding
        for (let i = offset - 1; i >= 0; i--) {
          const d = document.createElement('div');
          d.className = 'cal-day other-month';
          d.setAttribute('aria-hidden', 'true');
          d.textContent = daysInPrev - i;
          grid.appendChild(d);
        }

        // Current month days
        for (let d = 1; d <= daysInMonth; d++) {
          const el = document.createElement('div');
          el.className = 'cal-day';
          el.textContent = d;
          const past = isPastDate(curYear, curMonth, d);
          // Доступность с клавиатуры и скринридера: день — кнопка с полной датой в названии.
          el.setAttribute('role', 'button');
          el.setAttribute('aria-label', new Date(curYear, curMonth, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }));
          if (past) {
            el.classList.add('disabled');
            el.setAttribute('aria-disabled', 'true');
          } else {
            el.tabIndex = 0;
            el.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
            });
          }
          el.setAttribute('aria-pressed', d === selectedDay ? 'true' : 'false');
          if (d === selectedDay) {
            el.classList.add('active');
          }
          el.onclick = () => {
            if (el.classList.contains('disabled')) return;
            document.querySelectorAll('.cal-day').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
            el.classList.add('active');
            el.setAttribute('aria-pressed', 'true');
            selectedDay = d;
          };
          grid.appendChild(el);
        }

        // Next month padding
        const total = offset + daysInMonth;
        const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
        for (let i = 1; i <= remaining; i++) {
          const d = document.createElement('div');
          d.className = 'cal-day other-month';
          d.setAttribute('aria-hidden', 'true');
          d.textContent = i;
          grid.appendChild(d);
        }
      }

      document.getElementById('cal-prev').onclick = () => {
        if (curYear === nowR.y && curMonth === nowR.m - 1) return; // в прошлое не листаем
        curMonth--;
        if (curMonth < 0) { curMonth = 11; curYear--; }
        renderCalendar();
      };
      document.getElementById('cal-next').onclick = () => {
        curMonth++;
        if (curMonth > 11) { curMonth = 0; curYear++; }
        renderCalendar();
      };

      renderCalendar();

      // Pre-select service from URL param ?service=...
      (function() {
        const params = new URLSearchParams(window.location.search);
        const svc = params.get('service') || sessionStorage.getItem('preselect_service');
        if (svc) {
          sessionStorage.removeItem('preselect_service');
          document.querySelectorAll('.svc-option').forEach(opt => {
            const val = opt.querySelector('input') ? opt.querySelector('input').value : '';
            if (val === svc) {
              document.querySelectorAll('.svc-option').forEach(o => o.classList.remove('active'));
              opt.classList.add('active');
              opt.querySelector('input').checked = true;
              opt.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          });
        }
      })();

      // ── Предвыбор услуги из ?service=… ────────────────────────────────────
      // В вёрстке 4 основные услуги, остальные (и добавленные в админке) показываются как «дополнительные»
      // (см. script.js). Ссылка «Записаться» со страницы такой услуги раньше ничего не предвыбирала.
      // Если нужной услуги нет среди основных — добавляем её туда из API и выбираем.
      (async function preselectFromApi() {
        try {
          const wanted = new URLSearchParams(window.location.search).get('service');
          if (!wanted) return;
          const have = () => [...document.querySelectorAll('.svc-option')].find(o => o.querySelector('input') && o.querySelector('input').value === wanted);
          let target = have();
          if (!target) {
            const res = await fetch(`${API_BASE}/services`);
            if (!res.ok) return;
            const s = ((await res.json()).services || []).find(x => x.active && x.name === wanted);
            const options = document.querySelectorAll('.svc-option');
            if (!s || !options.length) return;
            const price = s.discount > 0 ? Math.round(s.price * (1 - s.discount / 100)) : s.price;
            const label = document.createElement('label');
            label.className = 'svc-option';
            label.dataset.svcId = s.id;
            label.setAttribute('data-click', '[["selectService",{"$":"this"}]]');
            const input = document.createElement('input');
            input.type = 'radio'; input.name = 'service'; input.value = s.name;
            const check = document.createElement('div'); check.className = 'svc-check';
            const body = document.createElement('div'); body.className = 'svc-body';
            const row = document.createElement('div'); row.className = 'svc-row';
            const nm = document.createElement('span'); nm.className = 'svc-name'; nm.textContent = s.name;
            const pr = document.createElement('span'); pr.className = 'svc-price'; pr.dataset.svcId = s.id;
            pr.textContent = 'от ' + Number(price).toLocaleString('ru-RU') + ' ₽';
            row.append(nm, pr);
            body.appendChild(row);
            if (s.desc) { const d = document.createElement('div'); d.className = 'svc-desc'; d.textContent = s.desc; body.appendChild(d); }
            label.append(input, check, body);
            options[options.length - 1].after(label);   // textContent/value, не innerHTML — название из админки не станет разметкой
            target = label;
          }
          if (!target.classList.contains('active')) {
            document.querySelectorAll('.svc-option').forEach(o => o.classList.remove('active'));
            target.classList.add('active');
            target.querySelector('input').checked = true;
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } catch (e) { /* без сети остаётся вёрстка по умолчанию */ }
      })();

      // ── Блокировка занятых слотов (через API, чтобы данные были общими
      // для всех посетителей сайта, а не только браузера, где открыта запись) ──
      function getSelectedDate() {
        const d = String(selectedDay).padStart(2,'0');
        const m = String(curMonth + 1).padStart(2,'0');
        return `${curYear}-${m}-${d}`;
      }

      let busySlotsRequestId = 0;

      async function fetchBookedTimes(date) {
        try {
          const res = await fetch(`${API_BASE}/bookings/availability?date=${encodeURIComponent(date)}`);
          if (!res.ok) return [];
          const data = await res.json();
          return data.bookedTimes || [];
        } catch (e) {
          console.warn('Не удалось загрузить занятые слоты:', e);
          return [];
        }
      }

      async function updateBusySlots() {
        const date = getSelectedDate();
        const requestId = ++busySlotsRequestId;
        const booked = await fetchBookedTimes(date);
        // Игнорируем устаревший ответ, если пользователь уже переключил дату
        if (requestId !== busySlotsRequestId) return;
        const nowNow = ryazanNow();
        const isToday = curYear === nowNow.y && curMonth === nowNow.m - 1 && selectedDay === nowNow.d;
        document.querySelectorAll('.time-slot').forEach(el => {
          const t = el.textContent.trim();
          const [hh, mm] = t.split(':').map(Number);
          if (isToday && hh * 60 + mm <= nowNow.minutes) {
            el.classList.add('busy');
            el.classList.remove('active');
            el.style.pointerEvents = 'none';
            el.style.opacity = '0.35';
            el.title = 'Это время уже прошло';
            el.setAttribute('aria-disabled', 'true'); el.tabIndex = -1; el.setAttribute('aria-pressed', 'false');
          } else if (booked.includes(t)) {
            el.classList.add('busy');
            el.classList.remove('active');
            el.style.pointerEvents = 'none';
            el.style.opacity = '0.35';
            el.title = 'Это время занято';
            el.setAttribute('aria-disabled', 'true'); el.tabIndex = -1; el.setAttribute('aria-pressed', 'false');
          } else {
            el.classList.remove('busy');
            el.style.pointerEvents = '';
            el.style.opacity = '';
            el.title = '';
            el.removeAttribute('aria-disabled'); el.tabIndex = 0;
          }
        });
      }

      // Обновляем занятые слоты при смене даты
      const origSelectDay = el => {
        document.querySelectorAll('.cal-day').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
      };
      document.getElementById('cal-grid').addEventListener('click', () => {
        setTimeout(renderTimeSlots, 0);
      });
      document.getElementById('cal-prev').addEventListener('click', () => setTimeout(renderTimeSlots, 50));
      document.getElementById('cal-next').addEventListener('click', () => setTimeout(renderTimeSlots, 50));

// ── МАСКА ТЕЛЕФОНА +7 (XXX) XXX-XX-XX ──
function initPhoneMask(input) {
  if (!input || input._maskInited) return;
  input._maskInited = true;


  input.addEventListener('focus', function() {
    if (!this.value) this.value = '+7 ';
  });

  input.addEventListener('input', function(e) {
    const pos = this.selectionStart;
    const old = this.value;
    this.value = rdFormatPhone(this.value);
    // Корректируем позицию курсора
    let newPos = pos + (this.value.length - old.length);
    newPos = Math.max(3, Math.min(newPos, this.value.length));
    this.setSelectionRange(newPos, newPos);
  });

  input.addEventListener('keydown', function(e) {
    // Не даём удалить +7
    if ((e.key === 'Backspace' || e.key === 'Delete') && this.value.length <= 3) {
      e.preventDefault();
    }
  });

  input.addEventListener('blur', function() {
    if (this.value === '+7 ' || this.value === '+7') this.value = '';
  });
}

      setTimeout(updateBusySlots, 100);

      // ── Генерация слотов времени из настроек админки ──
      // ── Валидационные функции ──
const MAT_WORDS = ['блядь','бляд','сука','пизд','ёбан','хуй','хуе','хуи','хуя','мудак','залупа','ебат','ебал','шлюх','блять','пидор','гандон','уёб','уеб','нахуй','похуй','заебал','охуел'];
function hasProfanity(s) {
  const t = s.toLowerCase().replace(/ё/g,'е');
  return MAT_WORDS.some(w => t.includes(w));
}
function isPhoneValid(phone) {
  return phone.replace(/\D/g,'').length === 11;
}
const CAR_ALLOWED = 'АВЕКМНОРСТУХ';
function isCarNumberValid(car) {
  if (!car) return true;
  const re = new RegExp('^[' + CAR_ALLOWED + ']\\d{3}[' + CAR_ALLOWED + ']{2}\\d{2,3}$');
  return re.test(car);
}
function formatCarInput(input) {
  const latinToCyr = {A:'А',B:'В',E:'Е',K:'К',M:'М',H:'Н',O:'О',P:'Р',C:'С',T:'Т',Y:'У',X:'Х'};
  let v = input.value.toUpperCase().split('').map(c => latinToCyr[c] || c).join('');
  // Разрешаем только допустимые символы (буквы из списка + цифры)
  v = v.split('').filter((c, i) => {
    if (i === 0 || i === 4 || i === 5) return CAR_ALLOWED.includes(c);
    if (i >= 1 && i <= 3) return /\d/.test(c);
    if (i >= 6) return /\d/.test(c);
    return true;
  }).join('');
  input.value = v;
}

async function renderTimeSlots() {
        // Часы работы берём из настроек сайта (один раз, дальше из кэша) и считаем
        // под выбранную дату: у будней и выходных график может отличаться,
        // а выходной (Сб–Вс) может быть нерабочим. Сервер проверяет то же самое.
        const wrap = document.getElementById('time-slots-wrap');
        if (!wrap) return;
        if (window._rdContacts === undefined) {
          try {
            const res = await fetch(`${API_BASE}/settings/contacts`);
            const data = res.ok ? await res.json() : null;
            window._rdContacts = data ? data.value : null;
          } catch (e) { window._rdContacts = null; }
        }
        const h = rdHoursForDate(window._rdContacts, getSelectedDate());
        const prevTime = (document.querySelector('.time-slot.active') || {}).textContent;
        wrap.innerHTML = '';
        if (h.closed) {
          const note = document.createElement('div');
          note.style.cssText = 'grid-column:1/-1;color:var(--text-muted,#9a9a9a);padding:8px 0';
          note.textContent = 'В этот день мы не работаем — выберите другую дату.';
          wrap.appendChild(note);
          return;
        }
        // Слот должен целиком помещаться в рабочий день: при 09:00–21:00 и
        // слоте 60 мин последний — 20:00, а не 21:00.
        for (let t = h.start; t + h.slot <= h.end; t += h.slot) {
          const label = String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
          const d = document.createElement('div');
          d.className = 'time-slot'; d.textContent = label;
          // Доступность: слот — кнопка, доступная с клавиатуры (Tab, Enter, Space).
          d.setAttribute('role', 'button'); d.tabIndex = 0;
          d.setAttribute('aria-pressed', label === prevTime ? 'true' : 'false');
          if (label === prevTime) d.classList.add('active');
          d.onclick = function(){ selectTime(this); };
          d.addEventListener('keydown', function(e){ if ((e.key === 'Enter' || e.key === ' ') && !this.classList.contains('busy')) { e.preventDefault(); selectTime(this); } });
          wrap.appendChild(d);
        }
        setTimeout(updateBusySlots, 50);
      }

      renderTimeSlots();
      initPhoneMask(document.getElementById('booking-phone'));
      const carInput = document.getElementById('booking-car');
      if (carInput) {
        carInput.addEventListener('input', function() { formatCarInput(this); });
        carInput.addEventListener('blur', function() {
          const v = this.value.trim();
          if (v && !isCarNumberValid(v)) {
            this.style.borderColor = '#e55';
            document.getElementById('form-msg').textContent = '⚠ Неверный формат номера авто. Пример: А123ВС77';
            document.getElementById('form-msg').style.color = '#e55';
          } else {
            this.style.borderColor = '';
          }
        });
      }

      // ── Проверка: онлайн-запись включена? ──
      // Раньше это читало localStorage('a_contacts') — ключ, который для
      // настоящего посетителя никогда не был заполнен (его писала только
      // сама админка, в своём браузере), поэтому выключатель «Онлайн-запись
      // отключена» не работал вообще: форма оставалась активной всегда.
      // Сервер теперь тоже проверяет это самостоятельно (см. bookings.js) —
      // здесь просто более дружелюбное сообщение, а не голая ошибка API.
      (async function checkBookingEnabled() {
        try {
          const res = await fetch(`${API_BASE}/settings/contacts`);
          const data = res.ok ? await res.json() : null;
          const c = data ? data.value : null;
          if (c && c.bookingOn === false) {
            const form = document.getElementById('booking-form');
            if (form) {
              form.innerHTML = '<p style="color:var(--gold);font-size:16px;padding:20px 0">⚠ Онлайн-запись временно отключена. Позвоните нам: <a href="tel:+74912990099" style="color:var(--gold)">' + escapeHtml(c.phone || '+7 (4912) 99-00-99') + '</a></p>';
            }
          }
        } catch(e) {}
      })();

      // Form submit
      document.getElementById('booking-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        const msg = document.getElementById('form-msg');
        const submitBtn = this.querySelector('[type="submit"]');

        const svcEl = document.querySelector('.svc-option.active input[name="service"]');
        const timeEl = document.querySelector('.time-slot.active');
        const name = this.querySelector('[name="name"]').value.trim();
        const phone = this.querySelector('[name="phone"]').value.trim();
        const car = this.querySelector('[name="car"]').value.trim();
        const comment = this.querySelector('[name="comment"]').value.trim();

        // ── Валидация полей ──
        let hasError = false;
        const shake = el => {
          if (!el) return;
          el.classList.remove('field-shake'); void el.offsetWidth;
          el.classList.add('field-shake');
          el.addEventListener('animationend', () => el.classList.remove('field-shake'), { once: true });
        };
        const setErr = (el, txt) => {
          if (el) { el.style.borderColor = '#e55'; el.style.boxShadow = '0 0 0 2px rgba(229,85,85,0.25)'; shake(el); }
          if (txt) { msg.textContent = '⚠ ' + txt; msg.style.color = '#e55'; }
          hasError = true;
        };
        const clearErr = el => {
          if (el) { el.style.borderColor = ''; el.style.boxShadow = ''; }
        };

        const nameEl  = document.querySelector('[name="name"]');
        const phoneEl = document.getElementById('booking-phone');
        const carEl   = document.getElementById('booking-car');
        clearErr(nameEl); clearErr(phoneEl); clearErr(carEl);
        msg.textContent = '';

        if (!svcEl) { msg.textContent = '⚠ Пожалуйста, выберите услугу.'; msg.style.color = '#e55'; hasError = true; }
        if (!timeEl) { msg.textContent = '⚠ Пожалуйста, выберите время.'; msg.style.color = '#e55'; hasError = true; }
        if (!name) setErr(nameEl, 'Введите ваше имя.');
        if (!phone || !isPhoneValid(phone)) setErr(phoneEl, 'Проверьте номер телефона — должно быть 11 цифр (+7XXXXXXXXXX).');
        const carVal = carEl ? carEl.value.trim() : '';
        if (carVal && !isCarNumberValid(carVal)) setErr(carEl, 'Номер авто: формат А123ВС77 (кирилл. буквы А В Е К М Н О Р С Т У Х).');
        if (hasError) return;

        const date = getSelectedDate();
        const time = timeEl.textContent.trim();

        const payload = {
          name, phone, car, comment,
          service: svcEl.value,
          serviceId: Number(svcEl.closest('.svc-option')?.dataset.svcId || 0) || undefined,
          date, time,
          // «Дополнительные услуги»: раньше отмечались на странице, но никуда не отправлялись.
          extras: [...document.querySelectorAll('input[name="extra"]:checked')].map(i => i.value),
        };

        if (submitBtn) { submitBtn.disabled = true; submitBtn.classList.add('is-loading'); }
        msg.textContent = 'Отправляем заявку…';
        msg.style.color = '';

        try {
          const res = await fetch(`${API_BASE}/bookings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => ({}));

          if (res.status === 201) {
            msg.textContent = '✓ Заявка отправлена! Мы свяжемся с вами для подтверждения.';
            msg.style.color = 'var(--green, #52c87a)';
            this.reset();
            document.querySelectorAll('.svc-option').forEach(o => o.classList.remove('active'));
            document.querySelector('.svc-option').classList.add('active');
            document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('active'));
            updateBusySlots();
          } else if (res.status === 409) {
            msg.textContent = '⚠ Это время уже заняли, пока вы заполняли форму. Пожалуйста, выберите другое.';
            msg.style.color = 'var(--gold)';
            updateBusySlots();
          } else {
            msg.textContent = '⚠ ' + (data.error || 'Не удалось отправить заявку. Попробуйте ещё раз или позвоните нам.');
            msg.style.color = '#e55';
          }
        } catch (err) {
          msg.textContent = '⚠ Нет связи с сервером. Попробуйте ещё раз или позвоните нам: +7 (4912) 99-00-99';
          msg.style.color = '#e55';
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.classList.remove('is-loading'); }
        }
      });

// Функции, вызываемые из data-click/data-change (см. js/actions.js)
RDActions.register({ selectService: window.selectService, toggleExtra: window.toggleExtra });
