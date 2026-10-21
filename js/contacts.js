      // ── Подтягиваем контакты из настроек админки ──
      // Раньше читали localStorage('a_contacts') — для настоящего посетителя
      // этот ключ никогда не был заполнен (его писала только сама админка,
      // в своём браузере), поэтому страница всегда показывала то, что
      // зашито в HTML при вёрстке, а не то, что реально задано в настройках.
      (async function syncContacts() {
        try {
          const res = await fetch('https://ryazdetailing-backend.onrender.com/api/settings/contacts');
          const data = res.ok ? await res.json() : null;
          const c = data ? data.value : null;
          if (!c) return;
          // Телефон в хедере и карточках
          if (c.phone) {
            document.querySelectorAll('a[href^="tel:"]').forEach(a => {
              a.href = 'tel:' + c.phone.replace(/[^\d+]/g, '');
              if (a.textContent.match(/^\+?[\d\s()\-]+$/)) a.textContent = c.phone;
            });
          }
          // Адрес
          if (c.addr) {
            document.querySelectorAll('[data-contact="addr"]').forEach(el => el.textContent = c.addr);
          }
          // График
          // График строится из структурированных полей (будни/выходные) — как и на остальных страницах
          document.querySelectorAll('[data-contact="hours"]').forEach(el => el.textContent = rdHoursText(c));
          // Email
          if (c.email) {
            document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
              a.href = 'mailto:' + c.email;
              if (a.textContent.includes('@')) a.textContent = c.email;
            });
          }
        } catch(e) {}
      })();

      const API_BASE = 'https://ryazdetailing-backend.onrender.com/api';

      // ── Мат-фильтр ──
const CONTACT_MAT = ['блядь','бляд','сука','пизд','ёбан','хуй','хуе','хуи','хуя','мудак','залупа','ебат','ебал','шлюх','блять','пидор','гандон','уёб','уеб','нахуй','похуй','заебал','охуел'];
function contactHasMat(s) {
  const t = (s||'').toLowerCase().replace(/ё/g,'е');
  return CONTACT_MAT.some(w => t.includes(w));
}
function isContactPhoneValid(phone) {
  return phone.replace(/\D/g,'').length === 11;
}

// ── Маска телефона ──
function initPhoneMask(input) {
  if (!input || input._maskInited) return;
  input._maskInited = true;
  input.addEventListener('focus',function(){if(!this.value)this.value='+7 ';});
  input.addEventListener('input',function(){
    const pos=this.selectionStart,old=this.value;
    this.value=rdFormatPhone(this.value);
    let np=pos+(this.value.length-old.length);
    np=Math.max(3,Math.min(np,this.value.length));
    this.setSelectionRange(np,np);
  });
  input.addEventListener('keydown',function(e){
    if((e.key==='Backspace'||e.key==='Delete')&&this.value.length<=3)e.preventDefault();
  });
  input.addEventListener('blur',function(){if(this.value==='+7 '||this.value==='+7')this.value='';});
}
initPhoneMask(document.getElementById('contact-phone'));

document.getElementById('contact-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const msgEl = document.getElementById('contact-msg');
  const nameEl = this.querySelector('[name="name"]');
  const phoneEl = document.getElementById('contact-phone');
  const textEl = this.querySelector('[name="message"]');

  const name = nameEl.value.trim();
  const phone = phoneEl ? phoneEl.value.trim() : '';
  const email = this.querySelector('[name="email"]') ? this.querySelector('[name="email"]').value.trim() : '';
  const message = textEl.value.trim();

  // Сброс ошибок
  [nameEl, phoneEl, textEl].forEach(el => { if(el){el.style.borderColor='';el.style.boxShadow='';} });
  msgEl.textContent = '';

  let hasError = false;
  const setErr = (el, txt) => {
    if(el){el.style.borderColor='#e55';el.style.boxShadow='0 0 0 2px rgba(229,85,85,0.25)';}
    if(txt){msgEl.textContent='⚠ '+txt;msgEl.style.color='#e55';}
    hasError = true;
  };

  if (!name) setErr(nameEl, 'Введите ваше имя.');
  else if (contactHasMat(name)) setErr(nameEl, 'Имя содержит недопустимые слова.');
  if (phone && !isContactPhoneValid(phone)) setErr(phoneEl, 'Проверьте номер телефона.');
  if (!message) setErr(textEl, 'Напишите сообщение.');
  else if (contactHasMat(message)) setErr(textEl, 'Сообщение содержит недопустимые слова.');
  if (hasError) return;

  // Раньше это заканчивалось на localStorage.setItem('a_msgs', ...) и показывало
  // "Сообщение отправлено" — но данные оставались только в браузере посетителя
  // и никогда не попадали на сервер. Реальные сообщения терялись молча.
  const submitBtn = this.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.classList.add('is-loading');

  fetch(`${API_BASE}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone, email, text: message }),
  })
    .then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось отправить сообщение. Попробуйте ещё раз.');
      msgEl.textContent = '✓ Сообщение отправлено! Мы ответим вам в ближайшее время.';
      msgEl.style.color = 'var(--green, #52c87a)';
      this.reset();
      [nameEl, phoneEl, textEl].forEach(el => { if(el){el.style.borderColor='';el.style.boxShadow='';} });
    })
    .catch(err => {
      msgEl.textContent = '⚠ ' + err.message;
      msgEl.style.color = '#e55';
    })
    .finally(() => { if (submitBtn) submitBtn.classList.remove('is-loading'); });
});

