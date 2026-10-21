// admin-app/core.js — Ядро: хранилище, API-клиент, вход, навигация, общие хелперы.
// Классический скрипт: переменные и функции общие для всех файлов админки
// (порядок подключения см. в admin.html).

// ═══════════════════════════════════════════
// DATA & STORAGE
// ═══════════════════════════════════════════
const save=(k,v)=>{try{localStorage.setItem('a_'+k,JSON.stringify(v))}catch(e){}};
const load=(k,d)=>{try{const v=localStorage.getItem('a_'+k);return v?JSON.parse(v):d}catch(e){return d}};

// ═══════════════════════════════════════════
// API бэкенда
// ═══════════════════════════════════════════
// Локально (при открытии файла напрямую) укажите полный адрес сервера,
// например 'http://localhost:3000/api'. На проде, если бэкенд проксируется
// через Nginx на том же домене (см. README бэкенда), '/api' работает как есть.
const API_BASE = 'https://ryazdetailing-backend.onrender.com/api';

// Токен больше не хранится в браузере: сессия лежит в HttpOnly-cookie, которую
// выставляет сервер, а скрипты страницы её не видят (защита от кражи при XSS).
// Старый токен от прошлых версий удаляем, если он остался в localStorage.
try { localStorage.removeItem('a_token'); } catch (e) {}

// Обёртка над fetch: подставляет токен авторизации и приводит ошибки к
// единому виду. Возвращает распарсенный JSON. При 401 — разлогинивает.
async function apiFetch(path, opts = {}) {
  // X-Requested-With — обязательный для изменяющих запросов служебный заголовок
  // (CSRF-защита на сервере); cookie сессии браузер подставляет сам.
  const headers = Object.assign({ 'Content-Type': 'application/json', 'X-Requested-With': 'rd-admin' }, opts.headers || {});

  let res;
  try {
    res = await fetch(API_BASE + path, Object.assign({}, opts, { headers }));
  } catch (err) {
    throw new Error('Нет связи с сервером');
  }

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    doLogout();
    throw new Error('Сессия истекла, войдите заново');
  }
  if (!res.ok) {
    throw new Error(data.error || 'Ошибка запроса к серверу');
  }
  return data;
}

// Приводим объект записи из API к виду, который ожидает остальной код
// админки (поля svc/car/comment/acomment/pay/status/created).
function apiBookingToLocal(b) {
  return {
    id: b.id,
    name: b.name,
    phone: b.phone,
    svc: b.service || '',
    date: b.date,
    time: b.time,
    car: b.car || '',
    comment: b.comment || '',
    acomment: b.admin_comment || '',
    pay: b.pay || 'none',
    price: b.price,
    prepay: b.prepay_amount || 0,
    paid: b.paid_amount || 0,
    refund: b.refund_amount || 0,
    status: b.status,
    created: b.created_at,
  };
}
function apiMessageToLocal(m) {
  return {
    id: m.id,
    name: m.name || '',
    phone: m.phone || '',
    email: m.email || '',
    msg: m.text || '',
    status: m.status || 'new',
    created: m.created_at,
  };
}

async function loadBookingsFromAPI() {
  const data = await apiFetch('/bookings');
  bookings = (data.bookings || []).map(apiBookingToLocal);
}
async function loadMessagesFromAPI() {
  const data = await apiFetch('/messages');
  msgs = (data.messages || []).map(apiMessageToLocal);
}
async function loadReviewsFromAPI() {
  // Бэкенд уже отдаёт отзыв с полями rating/stars и svc/tag одновременно —
  // конвертация не нужна, админка ожидает именно такую форму.
  const data = await apiFetch('/reviews/admin');
  reviews = data.reviews || [];
}
async function loadServicesFromAPI() {
  // Бэкенд уже отдаёт услугу в форме {id,name,price,dur,desc,discount,
  // fullDesc,photo,active} — ровно то, что ожидает админка, без конвертации.
  const data = await apiFetch('/services/admin');
  services = data.services || [];
}
async function loadWorksFromAPI() {
  // API отдаёт {id,name,cat,time,before,after,desc,active} — ровно то,
  // что использует renderWorks() в админке.
  const data = await apiFetch('/works/admin');
  works = data.works || [];
}
async function loadSettingsFromAPI() {
  const [contactsRes, contentRes, privacyRes] = await Promise.all([
    apiFetch('/settings/contacts'),
    apiFetch('/settings/site_content'),
    apiFetch('/settings/privacy'),
  ]);
  if (contactsRes.value && Object.keys(contactsRes.value).length) siteContacts = {...contactDefaults, ...contactsRes.value};
  if (contentRes.value) siteContent = contentRes.value;
  if (privacyRes.value && Object.keys(privacyRes.value).length) privacyData = privacyRes.value;
}

let bookings=[];
let msgs=[];
let reviews=[];
let services=[];
function getDefaultWorks(){
  return [
    {id:1,name:'Комплексная мойка',cat:'Комплексная мойка',time:'2 ч 30 мин',before:'assets/before after 1.webp',after:'assets/before after 1.2.webp',desc:'',active:true},
    {id:2,name:'Химчистка салона',cat:'Химчистка салона',time:'4 ч',before:'assets/before after 2.webp',after:'assets/before after 2.2.webp',desc:'',active:true},
    {id:3,name:'Мойка дисков и шин',cat:'Мойка дисков и шин',time:'1 ч',before:'assets/before after 3.webp',after:'assets/before after 3.2.webp',desc:'',active:true},
    {id:4,name:'Полировка кузова',cat:'Полировка и защита',time:'6 ч',before:'assets/before after 4.webp',after:'assets/before after 4.2.webp',desc:'',active:true},
    {id:5,name:'Чистка подкапотного пространства',cat:'Комплексная мойка',time:'1 ч 30 мин',before:'assets/before after 5.webp',after:'assets/before after 5.2.webp',desc:'',active:true},
    {id:6,name:'Удаление царапин',cat:'Полировка и защита',time:'3 ч',before:'assets/before after 6.webp',after:'assets/before after 6.2.webp',desc:'',active:true},
    {id:7,name:'Восстановление кожи',cat:'Химчистка салона',time:'3 ч',before:'assets/before after 7.webp',after:'assets/before after 7.2.webp',desc:'',active:true},
    {id:8,name:'Керамическое покрытие',cat:'Детейлинг кузова',time:'7 ч',before:'assets/before after 8.webp',after:'assets/before after 8.2.webp',desc:'',active:true},
    {id:9,name:'Детейлинг интерьера',cat:'Детейлинг кузова',time:'5 ч',before:'assets/before after 9.webp',after:'assets/before after 9.2.webp',desc:'',active:true},
  ];
}
let works=[];
let blacklist=[]; // теперь с сервера (/api/blacklist), см. renderBlacklist()
let logs=load('logs',[]);

let curAdmin=null;
let loginAttempts=0;
let loginLocked=false;
let soundOn=true;
let schedOffset=0;
let bFilter='',bStatusF='',bSvcF='',bDateF='',bSort='new-first';
let mFilter='',mStatusF='';


// ── МАСКА ТЕЛЕФОНА +7 (XXX) XXX-XX-XX ──
function initPhoneMask(input) {
  // data-nomask: поле без маски (телефон компании может быть городским с кодом из 4 цифр, 8-800 и т.п.)
  if (!input || input._maskInited || input.hasAttribute('data-nomask')) return;
  input._maskInited = true;
  input.addEventListener('focus', function() { if (!this.value) this.value = '+7 '; });
  input.addEventListener('input', function() {
    const pos = this.selectionStart, old = this.value;
    this.value = rdFormatPhone(this.value);
    let np = pos + (this.value.length - old.length);
    np = Math.max(3, Math.min(np, this.value.length));
    this.setSelectionRange(np, np);
  });
  input.addEventListener('keydown', function(e) {
    if ((e.key === 'Backspace' || e.key === 'Delete') && this.value.length <= 3) e.preventDefault();
  });
  input.addEventListener('blur', function() { if (this.value === '+7 ' || this.value === '+7') this.value = ''; });
}
function initAllPhoneMasks() {
  document.querySelectorAll('input[type="tel"]').forEach(initPhoneMask);
}
const CAR_ALLOWED_ADM = 'АВЕКМНОРСТУХ';
const LATIN_TO_CYR_ADM = {A:'А',B:'В',E:'Е',K:'К',M:'М',H:'Н',O:'О',P:'Р',C:'С',T:'Т',Y:'У',X:'Х'};
function initCarMask(input) {
  if (!input || input._carMaskInited) return;
  input._carMaskInited = true;
  input.addEventListener('input', function() {
    let v = this.value.toUpperCase().split('').map(c => LATIN_TO_CYR_ADM[c] || c).join('');
    // Оставляем только разрешённые символы по позиции
    let result = '';
    let digits = 0, letters = 0, pos = 0;
    for (let i = 0; i < v.length && result.length < 9; i++) {
      const c = v[i];
      if (pos === 0 || pos === 4 || pos === 5) {
        if (CAR_ALLOWED_ADM.includes(c)) { result += c; pos++; }
      } else {
        if (/\d/.test(c)) { result += c; pos++; }
      }
    }
    this.value = result;
  });
}
function isCarValid(car) {
  if (!car) return true;
  const re = new RegExp('^[' + CAR_ALLOWED_ADM + ']\\d{3}[' + CAR_ALLOWED_ADM + ']{2}\\d{2,3}$');
  return re.test(car.toUpperCase());
}
function isPhoneFullValid(phone) {
  return phone.replace(/\D/g,'').length === 11;
}

function getSampleBookings(){
  const t=todayInRyazan();
  return [
    {id:1,name:'Алексей С.',phone:'+7 (910) 555-12-34',svc:'Комплексная мойка',date:t,time:'10:00',car:'А123ВС62',comment:'',acomment:'',status:'new',pay:'none',created:new Date().toLocaleString()},
    {id:2,name:'Дмитрий К.',phone:'+7 (920) 444-56-78',svc:'Химчистка салона',date:t,time:'14:00',car:'В456РС77',comment:'Сильные пятна на сиденьях',acomment:'',status:'confirmed',pay:'prepay',created:new Date().toLocaleString()},
    {id:3,name:'Мария П.',phone:'+7 (930) 333-90-12',svc:'Керамическое покрытие',date:t,time:'09:00',car:'',comment:'',acomment:'',status:'done',pay:'paid',created:new Date().toLocaleString()},
  ];
}
function getSampleMsgs(){
  return [
    {id:1,name:'Иван Т.',phone:'+7 (940) 111-22-33',email:'ivan@mail.ru',msg:'Хотел узнать подробнее о керамике и PPF.',status:'new',created:new Date().toLocaleString()},
    {id:2,name:'Ольга В.',phone:'+7 (950) 222-44-55',email:'',msg:'Можно ли записаться на выходные? Нужна химчистка.',status:'read',created:new Date().toLocaleString()},
  ];
}
function getSampleReviews(){
  return [
    {id:1,name:'Алексей С.',stars:5,rating:5,svc:'Комплексная мойка',tag:'Комплексная мойка',
     text:'Отличный сервис! Делал комплексную мойку и детейлинг кузова. Машина как новая — блеск и чистота в каждой детали. Рекомендую!',
     date:'15 мая 2026',avatar:'assets/Alexey S.webp',
     photos:['assets/feedback 1.webp','assets/feedback 1.2.webp','assets/feedback 1.3.webp'],status:'published'},
    {id:2,name:'Дмитрий К.',stars:5,rating:5,svc:'Химчистка салона',tag:'Химчистка салона',
     text:'Делал химчистку салона. Убрали все пятна и запахи, салон стал как новый. Профессиональный подход и приятный персонал.',
     date:'10 мая 2026',avatar:'assets/Dmitry K.webp',
     photos:['assets/feedback 2.webp','assets/feedback 2.2.webp','assets/feedback 2.3.webp'],status:'published'},
    {id:3,name:'Мария П.',stars:5,rating:5,svc:'Керамическое покрытие',tag:'Керамическое покрытие',
     text:'Покрытие керамикой — это лучшее решение! Кузов теперь защищён, вода просто скатывается, машина всегда чистая.',
     date:'5 мая 2026',avatar:'assets/Maria P.webp',
     photos:['assets/feedback 3.webp','assets/feedback 3.2.webp'],status:'published'},
    {id:4,name:'Иван Т.',stars:5,rating:5,svc:'Мойка дисков и шин',tag:'Мойка дисков и шин',
     text:'Отличное место! Моют качественно, быстро и без царапин. Персонал вежливый, всё объяснили и подсказали.',
     date:'2 мая 2026',avatar:'assets/Ivan T.webp',
     photos:['assets/feedback 4.webp','assets/feedback 4.2.webp','assets/feedback 4.3.webp'],status:'published'},
    {id:5,name:'Ольга В.',stars:5,rating:5,svc:'Детейлинг кузова',tag:'Детейлинг кузова',
     text:'Пользуюсь услугами не первый раз. Всегда остаюсь довольна результатом и уровнем сервиса!',
     date:'28 апреля 2026',avatar:'assets/Olga V.webp',
     photos:['assets/feedback 5.webp','assets/feedback 5.2.webp'],status:'published'},
    {id:6,name:'Сергей М.',stars:5,rating:5,svc:'Полировка кузова',tag:'Полировка кузова',
     text:'Делал полировку кузова и бронирование фар. Работа выполнена на высшем уровне. Спасибо команде РязДетейлинг!',
     date:'25 апреля 2026',avatar:'assets/Sergey M.webp',
     photos:['assets/feedback 6.webp','assets/feedback 6.2.webp'],status:'published'},
  ];
}
function getDefaultServices(){
  return [
    {id:1,name:'Комплексная мойка',price:1200,dur:'60–90 мин',desc:'Кузов, диски, арки, коврики',active:true},
    {id:2,name:'Детейлинг кузова',price:5000,dur:'3–8 ч',desc:'Полировка и восстановление блеска',active:true},
    {id:3,name:'Химчистка салона',price:3000,dur:'4–6 ч',desc:'Ткань, кожа, пластик',active:true},
    {id:4,name:'Мойка дисков и шин',price:600,dur:'30–60 мин',desc:'Удаление тормозной пыли',active:true},
    {id:5,name:'Полировка фар',price:800,dur:'30–60 мин',desc:'Восстановление прозрачности',active:true},
    {id:6,name:'Керамическое покрытие',price:9000,dur:'6–12 ч',desc:'Долговременная защита кузова',active:true},
    {id:7,name:'Озонирование салона',price:1000,dur:'30–60 мин',desc:'Удаление запахов',active:true},
    {id:8,name:'Мойка подкапотного пространства',price:1500,dur:'40–80 мин',desc:'Очистка двигателя',active:true},
    {id:9,name:'Обработка защитными составами',price:1500,dur:'40–120 мин',desc:'Гидрофобные составы',active:true},
    {id:10,name:'Оклейка PPF',price:15000,dur:'1–3 дня',desc:'Защита от сколов',active:true},
  ];
}

// ═══════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════
async function doLogin(){
  if(loginLocked){showErr('Заблокировано. Подождите 30 сек.');return;}
  const l=document.getElementById('li').value.trim();
  const p=document.getElementById('lp').value;
  if(!l||!p){showErr('Введите логин и пароль');return;}

  showErr('');
  document.getElementById('lerr').style.display='none';

  try {
    const res = await fetch(API_BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: l, password: p }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      loginAttempts++;
      showErr(data.error || 'Неверный логин или пароль');
      if(loginAttempts>=3){
        loginLocked=true;
        document.getElementById('lattempts').textContent='Вход заблокирован на 30 сек.';
        setTimeout(()=>{loginLocked=false;loginAttempts=0;document.getElementById('lattempts').textContent='';},30000);
      } else {
        document.getElementById('lattempts').textContent=`Попытка ${loginAttempts} из 3`;
      }
      return;
    }

    curAdmin = { id: data.admin.id, login: data.admin.login, role: data.admin.role, name: data.admin.login };
    document.getElementById('aname').textContent = curAdmin.name;
    document.getElementById('arole').textContent = curAdmin.role === 'admin' ? 'Главный администратор' : 'Менеджер';
    document.body.dataset.role = curAdmin.role;
    document.getElementById('ls').style.display='none';
    document.getElementById('app').style.display='block';
    addLog('Вход в систему','-',`Логин: ${curAdmin.login}`);
    await initApp();
  } catch (err) {
    showErr('Нет связи с сервером. Проверьте подключение.');
  }
}
function showErr(m){const e=document.getElementById('lerr');e.textContent=m;e.style.display=m?'block':'none';}
function doLogout(){
  if (curAdmin) addLog('Выход из системы','-','');
  // Сервер стирает cookie сессии (из JS это невозможно — она HttpOnly).
  fetch(API_BASE + '/auth/logout', { method: 'POST', headers: { 'X-Requested-With': 'rd-admin' } }).catch(() => {});
  document.getElementById('app').style.display='none';
  document.getElementById('ls').style.display='flex';
  document.getElementById('li').value='';
  document.getElementById('lp').value='';
  document.getElementById('lerr').style.display='none';
  curAdmin=null;
  delete document.body.dataset.role;
}

// Если в браузере уже есть токен (не вышли из системы в прошлый раз) —
// пробуем сразу войти в приложение, не спрашивая логин/пароль заново.
async function tryAutoLogin() {
  try {
    // Прямой fetch, а не apiFetch: 401 здесь — нормальная ситуация (сессии нет),
    // и показывать «Сессия истекла» или писать «Выход» в журнал не нужно.
    const meRes = await fetch(API_BASE + '/auth/me', { headers: { 'X-Requested-With': 'rd-admin' } });
    if (!meRes.ok) return;
    const me = await meRes.json();
    curAdmin = { id: me.admin.id, login: me.admin.login, role: me.admin.role, name: me.admin.login };
    await loadBookingsFromAPI();
    document.getElementById('aname').textContent = curAdmin.name;
    document.getElementById('arole').textContent = curAdmin.role === 'admin' ? 'Главный администратор' : 'Менеджер';
    document.body.dataset.role = curAdmin.role;
    document.getElementById('ls').style.display='none';
    document.getElementById('app').style.display='block';
    await initApp();
  } catch (err) {
    // Сессии нет или сервер недоступен — остаёмся на экране входа.
  }
}

// ═══════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════
const titles={dashboard:'Главная',bookings:'Записи на мойку',schedule:'Расписание',messages:'Сообщения',reviews:'Отзывы',blacklist:'Чёрный список',services:'Услуги и цены',works:'Наши работы',finance:'Финансовая статистика',admins:'Администраторы',settings:'Настройки',logs:'Логи действий','contacts-editor':'Контакты сайта','content-editor':'Контент сайта','privacy-editor':'Политика конфиденциальности'};

// ── Экранирование пользовательского текста перед вставкой в innerHTML ──
// Админка отображает имя/телефон/авто/текст сообщений и отзывов, которые ввёл
// посетитель сайта — без экранирования это было хранимое XSS прямо в сессии
// администратора (более опасно, чем на публичной странице).
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// Рязань = московский часовой пояс (UTC+3, без перехода на летнее время).
// new Date().toISOString() всегда в UTC — для "сегодня" это даёт неверную
// дату ночью (00:00–03:00 по Рязани UTC-дата ещё "вчерашняя").
function todayInRyazan(){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=t=>parts.find(p=>p.type===t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
// ── Skeleton-заглушки на время первой загрузки данных (initApp) ──
// Показываются один раз, до первого ответа API; настоящий renderX() потом
// перезаписывает их реальными строками через тот же setRowsHTML.
function skeletonTableRows(id, cols, rows) {
  const tbody = document.getElementById(id);
  if (!tbody) return;
  const cells = Array.from({ length: cols }, () => '<td><div class="skel skel-text"></div></td>').join('');
  tbody.innerHTML = Array.from({ length: rows || 4 }, () => `<tr class="skel-row">${cells}</tr>`).join('');
}
function skeletonCards(id, count) {
  const grid = document.getElementById(id);
  if (!grid) return;
  grid.innerHTML = Array.from({ length: count || 3 }, () =>
    `<div class="adcard skel-card"><div class="skel"></div><div class="skel"></div><div class="skel" style="width:40%"></div></div>`
  ).join('');
}
function setRowsHTML(container, html) {
  if (!container) return;
  if (container.innerHTML === html) return;
  container.innerHTML = html;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  Array.from(container.children).forEach((child, i) => {
    child.style.animationDelay = (Math.min(i, 10) * 0.03) + 's';
    child.classList.add('row-in');
  });
}
function go(id,el){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('act'));
  document.querySelectorAll('.sbitem').forEach(i=>i.classList.remove('act'));
  const pg=document.getElementById('pg-'+id);
  if(pg)pg.classList.add('act');
  if(el)el.classList.add('act');
  else{document.querySelectorAll('.sbitem').forEach(i=>{const fn=i.getAttribute('data-click')||'';if(fn.includes('["go","'+id+'"'))i.classList.add('act');});}
  document.getElementById('pgtitle').textContent=titles[id]||id;
  if(typeof closeSidebar==='function')closeSidebar();
  if(id==='settings')renderSystemStatus();   // состояние сервера читаем при каждом открытии раздела
  if(id==='schedule')renderSched();
  if(id==='logs')renderLogs();
  if(id==='finance')renderFinance();
  if(id==='works')renderWorks();
  if(id==='admins')renderAdmins();
  if(id==='blacklist')renderBlacklist();
  if(id==='contacts-editor')loadContactsEditor();
  if(id==='content-editor')loadContentPage(document.getElementById('ce-page')?.value||'index');
  if(id==='privacy-editor')loadPrivacyEditor();
}

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
async function initApp(){
  document.getElementById('eb-date').value=todayInRyazan();
  document.getElementById('rv-date').value=todayInRyazan();
  // Заглушки на время первого запроса к API — вместо пустых таблиц/сетки.
  skeletonTableRows('btbody', 10, 5);
  skeletonTableRows('mtbody', 7, 4);
  skeletonTableRows('revtbody', 8, 4);
  skeletonCards('svgrid', 4);
  skeletonCards('wgrid', 3);
  try {
    await Promise.all([loadBookingsFromAPI(), loadMessagesFromAPI(), loadReviewsFromAPI(), loadServicesFromAPI(), loadWorksFromAPI(), loadSettingsFromAPI()]);
  } catch (err) {
    toast('⚠ Не удалось загрузить данные с сервера', err.message, '#e55');
  }
  // Populate service filter (после загрузки — иначе список будет пустым)
  syncBookingServiceOptions();
  renderAll();
  updateDash();
  renderSched();
  setInterval(poll,15000);
}
// Списки услуг в «Записях» (фильтр и форма записи) строятся из реального списка услуг,
// а не из зашитого в вёрстку: услуги, добавленные в админке, иначе нельзя было выбрать в записи.
function ensureSelectOption(sel,val){
  if(!sel||!val)return;
  if(![...sel.options].some(o=>o.value===val||o.textContent===val)){const o=document.createElement('option');o.textContent=val;o.value=val;sel.appendChild(o);}
}
function syncBookingServiceOptions(){
  const names=[...new Set((services||[]).filter(s=>s.active!==false).map(s=>s.name))];
  if(!names.length)return;
  const bsf=document.getElementById('bSvcFilter');
  if(bsf){const cur=bsf.value;bsf.innerHTML='<option value="">Все услуги</option>';names.forEach(n=>{const o=document.createElement('option');o.textContent=n;bsf.appendChild(o);});bsf.value=cur;}
  const eb=document.getElementById('eb-svc');
  if(eb){const cur=eb.value;eb.innerHTML='';names.forEach(n=>{const o=document.createElement('option');o.textContent=n;eb.appendChild(o);});if(cur)ensureSelectOption(eb,cur);if(cur)eb.value=cur;}
}
function renderAll(){renderBookings();renderMsgs();renderRevs();renderSvcs();updateBadges();initAllPhoneMasks();}

// ═══════════════════════════════════════════
// BADGE / STATUS helpers
// ═══════════════════════════════════════════
function bBadge(s){const m={new:['b-new','Новая'],confirmed:['b-conf','Подтверждена'],inwork:['b-work','В работе'],done:['b-done','Выполнена'],cancelled:['b-cancel','Отменена'],nodial:['b-nodial','Не дозвонились'],deleted:['b-cancel','Удалена']};const v=m[s]||m.new;return`<span class="b ${v[0]}">${v[1]}</span>`;}
function payBadge(p){const m={none:'—',prepay:'<span class="b b-work">Предоплата</span>',paid:'<span class="b b-done">Оплачено</span>',refund:'<span class="b b-cancel">Возврат</span>'};return m[p]||'—';}
function updateBadges(){
  const nb=bookings.filter(b=>b.status==='new').length;
  const nm=msgs.filter(m=>m.status==='new').length;
  document.getElementById('sb-bc').textContent=nb;
  document.getElementById('sb-mc').textContent=nm;
  document.getElementById('ndot').classList.toggle('on',nb+nm>0);
}
