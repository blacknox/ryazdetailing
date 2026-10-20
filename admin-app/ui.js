// admin-app/ui.js — Интерфейс: звук и уведомления, модальные окна, экспорт, опрос сервера.
// Классический скрипт: переменные и функции общие для всех файлов админки
// (порядок подключения см. в admin.html).

// ═══════════════════════════════════════════
// SOUND + NOTIFICATIONS
// ═══════════════════════════════════════════
function toggleSound(){soundOn=!soundOn;const b=document.getElementById('sndbtn');b.classList.toggle('on',soundOn);b.textContent=soundOn?'🔔 Звук вкл.':'🔕 Звук выкл.';document.getElementById('tog-sound').classList.toggle('on',soundOn);}
function playSound(){try{const c=new(window.AudioContext||window.webkitAudioContext)();const o=c.createOscillator();const g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.setValueAtTime(880,c.currentTime);o.frequency.setValueAtTime(660,c.currentTime+.1);g.gain.setValueAtTime(.3,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.4);o.start(c.currentTime);o.stop(c.currentTime+.4);}catch(e){}}

function toast(title,body,type='gold'){
  if(soundOn)playSound();
  document.getElementById('ndot').classList.add('on');
  const w=document.getElementById('twrp');
  const t=document.createElement('div');
  t.className='toast';
  // escapeHtml здесь, а не на каждом месте вызова: body часто содержит имя/услугу
  // из заявки, которую только что отправил анонимный посетитель сайта.
  t.innerHTML=`<div class="ticon ${type}"><svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div><div class="tbody"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span></div><button class="tclose" aria-label="Закрыть уведомление" ${RDActions.attr('click',[["$removeParent"]])}>✕</button>`;
  w.appendChild(t);
  setTimeout(()=>t.remove&&t.remove(),6000);
}

// ═══════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════
// Модалки: раньше — ни фокус-ловушки, ни возврата фокуса, ни Escape. Tab мог
// увести фокус на страницу под затемнением, а после закрытия фокус терялся
// (съезжал в начало документа) вместо возврата туда, откуда модалку открыли.
let modalReturnFocus = null;
function modalFocusables(modal) {
  return Array.from(modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(el => !el.disabled && el.offsetParent !== null);
}
// keep=true — открыть окно как есть (форма редактирования уже заполнена); иначе для m-addbooking форма очищается под новую запись
function openM(id,keep){
  if(id==='m-addbooking'&&!keep){document.getElementById('m-addbooking-title').textContent='Добавить запись';document.getElementById('eb-id').value='';document.getElementById('eb-delbtn').style.display='none';document.getElementById('eb-name').value='';document.getElementById('eb-phone').value='';document.getElementById('eb-car').value='';document.getElementById('eb-comment').value='';document.getElementById('eb-acomment').value='';document.getElementById('eb-date').value=todayInRyazan();fillEbTimeOptions('');document.getElementById('eb-price').value='';document.getElementById('eb-prepay').value='0';document.getElementById('eb-paid').value='0';document.getElementById('eb-refund').value='0';document.getElementById('eb-pay').value='none';}
  modalReturnFocus = document.activeElement;
  const modal = document.getElementById(id);
  modal.classList.add('open');
  const focusables = modalFocusables(modal);
  if (focusables.length) focusables[0].focus();
  // Инициализируем маски телефона и авто в открытой модалке
  setTimeout(() => {
    modal.querySelectorAll('input[type="tel"]').forEach(initPhoneMask);
    const carEl = modal.querySelector('#eb-car');
    if (carEl) initCarMask(carEl);
    // Blacklist phone mask
    const blPhone = modal.querySelector('#bl-phone');
    if (blPhone) initPhoneMask(blPhone);
  }, 50);
}
function closeM(id){
  const modal = document.getElementById(id);
  modal.classList.remove('open');
  if (modalReturnFocus && document.body.contains(modalReturnFocus)) modalReturnFocus.focus();
  modalReturnFocus = null;
}
// Вся боковая навигация и иконка уведомлений сделаны на div с onclick —
// мышью/тачем работали, с клавиатуры были полностью недостижимы (нельзя
// было дойти до них Tab'ом вообще). Добавляем фокусируемость и Enter/Space,
// не трогая сами onclick-обработчики — клик эмулируется через el.click().
// Ячейки расписания пересоздаются при каждом renderSched(), поэтому слушатель
// на сами ячейки не навесить один раз — вешаем один делегирующий на контейнер.
// Полноценная ARIA-grid-навигация стрелками для календаря — отдельная, более
// крупная задача; здесь достаточно того, что каждую ячейку можно дотабать
// и открыть Enter/Space, а не только кликом.
document.getElementById('sched-wrap')?.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && (e.target.classList.contains('scell') || e.target.classList.contains('sev'))) {
    e.preventDefault();
    e.target.click();
  }
});

document.querySelectorAll('.sbitem, .tbicon').forEach(el => {
  el.setAttribute('tabindex', '0');
  el.setAttribute('role', 'button');
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
  });
});

document.querySelectorAll('.mov').forEach(m=>{
  m.setAttribute('role','dialog');
  m.setAttribute('aria-modal','true');
  m.addEventListener('click',e=>{if(e.target===m)closeM(m.id);});
  m.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeM(m.id); return; }
    if (e.key !== 'Tab') return;
    const focusables = modalFocusables(m);
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
});

// ═══════════════════════════════════════════
// EXPORT CSV
// ═══════════════════════════════════════════
function exportBookings(){
  const statusRu={new:'Новая',confirmed:'Подтверждена',inwork:'В работе',done:'Выполнена',cancelled:'Отменена',nodial:'Не дозвонились',deleted:'Удалена'};
  const payRu={none:'Не оплачено',prepay:'Предоплата',paid:'Оплачено'};
  const rows=[['\u2116','\u0418\u043c\u044f \u043a\u043b\u0438\u0435\u043d\u0442\u0430','\u0422\u0435\u043b\u0435\u0444\u043e\u043d','\u0423\u0441\u043b\u0443\u0433\u0430','\u0414\u0430\u0442\u0430','\u0412\u0440\u0435\u043c\u044f','\u041d\u043e\u043c\u0435\u0440 \u0430\u0432\u0442\u043e','\u041e\u043f\u043b\u0430\u0442\u0430','\u0421\u0442\u0430\u0442\u0443\u0441','\u041a\u043e\u043c\u043c\u0435\u043d\u0442\u0430\u0440\u0438\u0439','\u0421\u043e\u0437\u0434\u0430\u043d\u043e']];
  bookings.filter(b=>b.status!=='deleted').forEach((b,i)=>rows.push([i+1,b.name||'',b.phone||'',b.svc||'',b.date||'',b.time||'',b.car||'',payRu[b.pay]||b.pay||'\u041d\u0435 \u043e\u043f\u043b\u0430\u0447\u0435\u043d\u043e',statusRu[b.status]||b.status||'',b.comment||'',b.created||'']));
  const csv=rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(';')).join('\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;
  a.download='zaявки_'+new Date().toLocaleDateString('ru').replace(/\./g,'-')+'.csv';
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
  addLog('\u042d\u043a\u0441\u043f\u043e\u0440\u0442 \u0437\u0430\u044f\u0432\u043e\u043a','-','CSV');
  toast('\u0424\u0430\u0439\u043b \u0441\u043a\u0430\u0447\u0430\u043d');
}

// ═══════════════════════════════════════════
// POLL — периодически опрашиваем сервер на новые заявки/сообщения.
// Раньше это делалось через событие localStorage 'storage', которое
// срабатывало только в рамках одного браузера — теперь заявки реально
// приходят с сервера, поэтому опрашиваем API напрямую.
// ═══════════════════════════════════════════
async function poll(){
  if (!curAdmin) return;
  try {
    const prevMaxBookingId = bookings.reduce((max,b)=>Math.max(max,b.id||0),0);
    const prevMaxMsgId = msgs.reduce((max,m)=>Math.max(max,m.id||0),0);
    const prevMaxRevId = reviews.reduce((max,r)=>Math.max(max,r.id||0),0);

    await Promise.all([loadBookingsFromAPI(), loadMessagesFromAPI(), loadReviewsFromAPI()]);

    const newBookings = bookings.filter(b=>b.id>prevMaxBookingId);
    const newMsgs = msgs.filter(m=>m.id>prevMaxMsgId);
    const newRevs = reviews.filter(r=>r.id>prevMaxRevId);

    newRevs.forEach(r=>{
      toast('⭐ Новый отзыв на модерацию!',`${r.name} — ${r.stars}★`,'gold');
    });

    newBookings.forEach(b=>{
      toast('🔔 Новая запись!',`${b.name} — ${b.svc} — ${b.time}`,'gold');
      addLog('Получена заявка с сайта',b.id,b.name);
    });
    newMsgs.forEach(m=>{
      toast('💬 Новое сообщение!',m.name,'blue');
    });

    renderAll();updateDash();renderSched();
  } catch (err) {
    // Тихо игнорируем разовый сбой опроса (например, недоступность сети) —
    // следующий poll() через 15 сек. попробует снова.
  }
}

// Auto-backup every 24h simulation

// ═══════════════════════════════════════════
// МОБИЛЬНОЕ МЕНЮ (≤700px): выезжающая панель с кнопкой «Меню»
// ═══════════════════════════════════════════
function sidebarSet(open){
  const sb=document.getElementById('sidebar'),bd=document.getElementById('sb-backdrop'),bt=document.getElementById('burger');
  if(!sb)return;
  sb.classList.toggle('open',open);
  if(bd)bd.classList.toggle('open',open);
  if(bt)bt.setAttribute('aria-expanded',open?'true':'false');
}
function toggleSidebar(){
  const sb=document.getElementById('sidebar');
  const open=!(sb&&sb.classList.contains('open'));
  sidebarSet(open);
  if(open){const first=sb.querySelector('.sbitem');if(first)first.focus();}
}
function closeSidebar(){
  const sb=document.getElementById('sidebar');
  if(!sb||!sb.classList.contains('open'))return;
  sidebarSet(false);
}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    const sb=document.getElementById('sidebar');
    if(sb&&sb.classList.contains('open')){sidebarSet(false);const bt=document.getElementById('burger');if(bt)bt.focus();}
  }
});
window.addEventListener('resize',()=>{if(window.innerWidth>700)sidebarSet(false);});
