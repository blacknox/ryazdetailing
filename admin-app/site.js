// admin-app/site.js — Редакторы сайта: контакты, контент, политика конфиденциальности.
// Классический скрипт: переменные и функции общие для всех файлов админки
// (порядок подключения см. в admin.html).

// ═══════════════════════════════════════════
// CONTACTS EDITOR
// ═══════════════════════════════════════════
const contactDefaults={phone:'+7 (4912) 99-00-99',email:'zhora.fokin.06@mail.ru',addr:'г. Рязань, Заводской проезд, 1',hours:'Пн–Пт: 09:00–21:00, Сб–Вс: 10:00–20:00',weStart:'10:00',weEnd:'20:00',weOff:false,vk:'https://vk.com/tvoi_dilller',max:'https://web.max.ru/',tg:'',wa:'',lat:'54.6296',lng:'39.7442',maplabel:'РязДетейлинг — Заводской проезд, 1',bookingOn:true,wstart:'09:00',wend:'21:00',slot:60};
let siteContacts={...contactDefaults};

function loadContactsEditor(){
  const c=siteContacts;
  ['phone','email','addr','hours','vk','max','tg','wa','lat','lng','maplabel','wstart','wend','weStart','weEnd','slot'].forEach(k=>{
    const el=document.getElementById('ct-'+k);if(el)el.value=c[k]||contactDefaults[k]||'';
  });
  const woff=document.getElementById('ct-weOff');
  if(woff)woff.classList.toggle('on',c.weOff===true);
  updateHoursPreview();
  const bon=document.getElementById('ct-booking-on');
  if(bon)bon.classList.toggle('on',c.bookingOn!==false);
}

function hoursText(c){
  const pad=t=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');
  const mn=(v,d)=>{const m=String(v||d).match(/^(\d{1,2}):(\d{2})$/);return m?+m[1]*60+ +m[2]:0};
  const wk=pad(mn(c.wstart,'09:00'))+'–'+pad(mn(c.wend,'21:00'));
  if(c.weOff)return 'Пн–Пт: '+wk+', Сб–Вс: выходной';
  const we=pad(mn(c.weStart,'10:00'))+'–'+pad(mn(c.weEnd,'20:00'));
  return we===wk?'Ежедневно: '+wk:'Пн–Пт: '+wk+', Сб–Вс: '+we;
}
function updateHoursPreview(){
  const g=id=>document.getElementById('ct-'+id);
  const c={wstart:g('wstart')?.value,wend:g('wend')?.value,weStart:g('weStart')?.value,weEnd:g('weEnd')?.value,weOff:g('weOff')?.classList.contains('on')===true};
  const h=g('hours');if(h)h.value=hoursText(c);
  ['weStart','weEnd'].forEach(k=>{const el=g(k);if(el)el.disabled=c.weOff;});
}

async function saveContacts(){
  const c={};
  ['phone','email','addr','vk','max','tg','wa','lat','lng','maplabel','wstart','wend','weStart','weEnd'].forEach(k=>{
    const el=document.getElementById('ct-'+k);if(el)c[k]=el.value;
  });
  c.weOff=document.getElementById('ct-weOff')?.classList.contains('on')===true;
  c.hours=hoursText(c);
  const slot=parseInt(document.getElementById('ct-slot')?.value)||60;
  c.slot=slot;
  c.bookingOn=document.getElementById('ct-booking-on')?.classList.contains('on')!==false;
  const merged={...contactDefaults,...c};
  try {
    const saved=await apiFetch('/settings/contacts', { method: 'PUT', body: JSON.stringify({ value: merged }) });
    // Сервер проверяет расписание и сам формирует текст графика — берём его ответ
    siteContacts=(saved&&saved.value)?saved.value:merged;
    loadContactsEditor();
    // Синхронизируем настройки в settings тоже
    addLog('Контакты сайта обновлены','-',`Тел: ${c.phone}`);
    toast('Контакты сохранены','Данные обновлены на сайте','green');
  } catch (err) {
    toast('⚠ Не удалось сохранить контакты', err.message, '#e55');
  }
}

// ═══════════════════════════════════════════
// CONTENT EDITOR
// ═══════════════════════════════════════════
const contentPages={
  index:{label:'Главная',fields:[
    {id:'index-h1',label:'Главный заголовок (H1)',type:'input',def:'РязДетейлинг'},
    {id:'index-lead',label:'Подзаголовок героя',type:'input',def:'Чистота в деталях, аккуратный уход за кузовом, салоном, дисками и защитными покрытиями.'},
    {id:'index-why-h2',label:'Заголовок "Почему мы"',type:'input',def:'Нам доверяют свой автомобиль'},
    {id:'index-about-h2',label:'Заголовок блока "О компании"',type:'input',def:'РязДетейлинг — чистота в деталях'},
    {id:'index-about-p',label:'Текст блока "О компании"',type:'textarea',def:'Мы ценим каждый автомобиль и относимся к нему как к своему. Наша цель — не просто чистота, а безупречный результат и довольные клиенты.'},
    {id:'index-stat1',label:'Статистика: клиентов',type:'input',def:'1000+'},
    {id:'index-stat2',label:'Статистика: лет опыта',type:'input',def:'5+ лет'},
    {id:'index-cta-h2',label:'Заголовок CTA (запись)',type:'input',def:'Подберем услугу и удобное время'},
    {id:'index-cta-p',label:'Текст CTA',type:'textarea',def:'Оставьте заявку, администратор подтвердит запись и уточнит детали по автомобилю.'},
  ]},
  about:{label:'О компании',fields:[
    {id:'about-h1',label:'Заголовок страницы',type:'input',def:'О компании РязДетейлинг'},
    {id:'about-lead',label:'Лид-текст',type:'textarea',def:'Мы — профессиональная команда детейлеров в Рязани с опытом более 5 лет.'},
    {id:'about-mission',label:'Миссия компании',type:'textarea',def:'Наша миссия — дарить автомобилю безупречный вид и защиту, которая служит годами.'},
  ]},
  services:{label:'Услуги',fields:[
    {id:'svc-h1',label:'Заголовок страницы',type:'input',def:'Наши услуги'},
    {id:'svc-lead',label:'Описание раздела',type:'textarea',def:'Полный комплекс услуг по уходу за автомобилем от профессионалов.'},
  ]},
  reviews:{label:'Отзывы',fields:[
    {id:'rev-h1',label:'Заголовок страницы',type:'input',def:'Отзывы клиентов'},
    {id:'rev-lead',label:'Подзаголовок',type:'input',def:'Что говорят наши клиенты'},
  ]},
  contacts:{label:'Контакты',fields:[
    {id:'contacts-h1',label:'Заголовок страницы',type:'input',def:'Контакты'},
    {id:'contacts-text',label:'Текст приглашения',type:'textarea',def:'Мы находимся в Рязани и рады принять вас в любой день. Звоните или записывайтесь онлайн.'},
    {id:'contacts-pre-record',label:'Инфо о предварительной записи',type:'input',def:'Рекомендуем записываться заранее.'},
  ]},
};
let siteContent={};

function loadContentPage(pageKey){
  const pg=contentPages[pageKey];if(!pg)return;
  const container=document.getElementById('ce-fields');
  container.innerHTML=pg.fields.map(f=>{
    const val=siteContent[f.id]!==undefined?siteContent[f.id]:f.def;
    if(f.type==='textarea'){
      return`<div class="scard" style="grid-column:span 2"><div class="ff"><label>${escapeHtml(f.label)}</label><textarea id="cef-${f.id}" style="height:80px">${escapeHtml(val)}</textarea></div></div>`;
    }
    return`<div class="scard"><div class="ff"><label>${escapeHtml(f.label)}</label><input type="text" id="cef-${f.id}" value="${escapeHtml(val)}"></div></div>`;
  }).join('');
}

async function saveContent(){
  const pageKey=document.getElementById('ce-page').value;
  const pg=contentPages[pageKey];if(!pg)return;
  const updated={...siteContent};
  pg.fields.forEach(f=>{
    const el=document.getElementById('cef-'+f.id);
    if(el)updated[f.id]=el.value;
  });
  try {
    await apiFetch('/settings/site_content', { method: 'PUT', body: JSON.stringify({ value: updated }) });
    siteContent=updated;
    addLog('Контент обновлён',pageKey,`Страница: ${pg.label}`);
    toast('Контент сохранён',`Страница «${pg.label}» обновлена`,'green');
  } catch (err) {
    toast('⚠ Не удалось сохранить контент', err.message, '#e55');
  }
}

// ═══════════════════════════════════════════
// PRIVACY EDITOR
// ═══════════════════════════════════════════
let privacyData={date:'2026 г.',org:'РязДетейлинг',email:'zhora.fokin.06@mail.ru',text:'',dataList:'Имя и фамилия\nНомер телефона\nАдрес электронной почты\nНомер автомобиля (опционально)\nIP-адрес\nДанные браузера / устройства',purposes:'Запись на услуги, обратная связь, улучшение сервиса',retention:'3 года с момента последнего обращения',thirdParty:'Данные не передаются третьим лицам без согласия субъекта'};

function loadPrivacyEditor(){
  ['date','org','email','text','dataList','purposes','retention','thirdParty'].forEach(k=>{
    const el=document.getElementById('pp-'+k);if(el)el.value=privacyData[k]||'';
  });
  if(!privacyData.text)loadDefaultPrivacy();
}

function loadDefaultPrivacy(){
  const d=privacyData;
  const def=`Политика конфиденциальности и обработки персональных данных

Редакция от ${d.date||'2026 г.'}

Оператор: ${d.org||'РязДетейлинг'}
Контакт: ${d.email||''}

1. Общие положения
Оператор осуществляет обработку персональных данных в соответствии с Конституцией Российской Федерации, Федеральным законом № 152-ФЗ «О персональных данных».

2. Собираемые данные
${(d.dataList||'').split('\n').filter(Boolean).map(s=>'• '+s).join('\n')}

3. Цели обработки
${d.purposes||''}

4. Срок хранения
${d.retention||''}

5. Передача третьим лицам
${d.thirdParty||''}

6. Права субъекта персональных данных
Вы вправе запросить доступ, исправление или удаление ваших данных, направив запрос на ${d.email||''}.

7. Согласие
Используя сайт и заполняя формы, вы даёте согласие на обработку персональных данных согласно настоящей Политике.`;
  document.getElementById('pp-text').value=def;
}

async function savePrivacy(){
  const updated={...privacyData};
  ['date','org','email','text','dataList','purposes','retention','thirdParty'].forEach(k=>{
    const el=document.getElementById('pp-'+k);if(el)updated[k]=el.value;
  });
  try {
    await apiFetch('/settings/privacy', { method: 'PUT', body: JSON.stringify({ value: updated }) });
    privacyData=updated;
    addLog('Политика конфиденциальности обновлена','-',`Редакция от ${privacyData.date}`);
    toast('Политика сохранена','Текст обновлён','green');
  } catch (err) {
    toast('⚠ Не удалось сохранить политику', err.message, '#e55');
  }
}
