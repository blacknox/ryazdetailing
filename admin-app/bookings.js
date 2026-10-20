// admin-app/bookings.js — Заявки и расписание.
// Классический скрипт: переменные и функции общие для всех файлов админки
// (порядок подключения см. в admin.html).

// ═══════════════════════════════════════════
// BOOKINGS
// ═══════════════════════════════════════════
// ── Список времени в форме заявки строится по графику из настроек (будни/выходные, шаг слота) ──
// Та же логика, что на сайте (rdHoursForDate) и на сервере (utils/hours.js).
function ebHoursFor(date){
  const c=siteContacts||{};
  const mn=(v,d)=>{const m=String(v||d).match(/^(\d{1,2}):(\d{2})$/);return m?+m[1]*60+ +m[2]:0};
  const slot=Number(c.slot)>0?Number(c.slot):60;
  const dow=new Date((date||todayInRyazan())+'T00:00:00Z').getUTCDay();
  if(dow===0||dow===6)return{closed:c.weOff===true,start:mn(c.weStart,'10:00'),end:mn(c.weEnd,'20:00'),slot};
  return{closed:false,start:mn(c.wstart,'09:00'),end:mn(c.wend,'21:00'),slot};
}
// Исходные дата/время редактируемой заявки: администратор мог поставить её вне графика,
// и это время должно оставаться в списке (но только на её собственную дату).
let ebOrig={date:'',time:''};
function fillEbTimeOptions(current){
  const sel=document.getElementById('eb-time'),dateEl=document.getElementById('eb-date');if(!sel)return;
  const date=dateEl.value;
  if(typeof current==='string')ebOrig={date:current?date:'',time:current};   // открыли форму: запоминаем исходное время
  const wanted=typeof current==='string'?current:sel.value;
  const h=ebHoursFor(date);
  const pad=t=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');
  const times=[];
  if(!h.closed)for(let t=h.start;t+h.slot<=h.end;t+=h.slot)times.push(pad(t));
  const keepOrig=ebOrig.time&&date===ebOrig.date&&!times.includes(ebOrig.time);
  if(keepOrig){times.push(ebOrig.time);times.sort();}
  sel.innerHTML=times.length
    ?times.map(t=>`<option value="${t}">${t}${keepOrig&&t===ebOrig.time?' (вне графика)':''}</option>`).join('')
    :'<option value="">Выходной — записи нет</option>';
  sel.value=times.includes(wanted)?wanted:(times[0]||'');
}
function renderBookings(){
  let list=bookings.filter(b=>b.status!=='deleted');
  if(bFilter)list=list.filter(b=>b.name.toLowerCase().includes(bFilter.toLowerCase())||b.phone.includes(bFilter)||(b.car||'').toLowerCase().includes(bFilter.toLowerCase()));
  if(bStatusF)list=list.filter(b=>b.status===bStatusF);
  if(bSvcF)list=list.filter(b=>b.svc===bSvcF);
  if(bDateF)list=list.filter(b=>b.date===bDateF);
  if(bSort==='old-first')list=[...list].reverse();
  else if(bSort==='date')list=[...list].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
  const tbody=document.getElementById('btbody');
  setRowsHTML(tbody, list.map((b,_bi)=>`<tr role="row"><td role="cell" data-label="#" style="color:var(--muted)">#${_bi+1}</td><td role="cell" data-label="Клиент"><strong>${escapeHtml(b.name)}</strong></td><td role="cell" data-label="Телефон"><a href="tel:${encodeURIComponent(b.phone)}" style="color:var(--blue)">${escapeHtml(b.phone)}</a></td><td role="cell" data-label="Услуга">${escapeHtml(b.svc)}</td><td role="cell" data-label="Дата">${escapeHtml(b.date)}</td><td role="cell" data-label="Время"><strong>${escapeHtml(b.time)}</strong></td><td role="cell" data-label="Авто" style="color:var(--muted)">${escapeHtml(b.car||'—')}</td><td role="cell" data-label="Оплата">${payBadge(b.pay||'none')}</td><td role="cell" data-label="Статус">${bBadge(b.status)}</td><td role="cell" data-label="Действия"><div style="display:flex;gap:6px"><button class="btn btn-out btn-sm" ${RDActions.attr('click',[["openEditB",b.id]])}>✎ Изменить</button><button class="btn btn-red btn-sm admin-only" aria-label="Удалить запись" ${RDActions.attr('click',[["confirmDel",b.id]])}>✕</button></div></td></tr>`).join('')||'<tr role="row"><td role="cell" colspan="10" style="text-align:center;color:var(--muted);padding:24px">Записей не найдено</td></tr>');
}
function filterB(v){bFilter=v;renderBookings();}
function filterBStatus(v){bStatusF=v;renderBookings();}
function filterBSvc(v){bSvcF=v;renderBookings();}
function filterBDate(v){bDateF=v;renderBookings();}
function sortB(v){bSort=v;renderBookings();}

async function saveBooking(){
  const id=document.getElementById('eb-id').value;
  const name=document.getElementById('eb-name').value.trim();
  const phone=document.getElementById('eb-phone').value.trim();
  const carRaw=document.getElementById('eb-car').value.trim();
  // Валидация телефона
  if (phone && !isPhoneFullValid(phone)) {
    const pEl = document.getElementById('eb-phone');
    if(pEl){pEl.style.borderColor='#e55';pEl.style.boxShadow='0 0 0 2px rgba(229,85,85,0.25)';}
    toast('⚠ Проверьте номер телефона — должно быть 11 цифр','#e55');
    return;
  }
  // Валидация номера авто
  if (carRaw && !isCarValid(carRaw)) {
    const cEl = document.getElementById('eb-car');
    if(cEl){cEl.style.borderColor='#e55';cEl.style.boxShadow='0 0 0 2px rgba(229,85,85,0.25)';}
    toast('⚠ Номер авто: формат А123ВС77 (буквы: А В Е К М Н О Р С Т У Х)','#e55');
    return;
  }
  // Проверка чёрного списка
  const cleanPhone = phone.replace(/\D/g,'');
  const inBL = blacklist.some(b => b.phone && b.phone.replace(/\D/g,'') === cleanPhone);
  if (inBL) {
    toast('⛔ Этот номер в чёрном списке! Запись невозможна.','#e55');
    return;
  }
  const date=document.getElementById('eb-date').value;
  const time=document.getElementById('eb-time').value;
  if(!name||!phone||!date){toast('Заполните обязательные поля','Имя, телефон и дата обязательны','gold');return;}
  // Быстрая клиентская проверка на дубль (по уже загруженным данным) —
  // окончательное решение всё равно принимает сервер (уникальный индекс в БД).
  if(!id){
    const conflict=bookings.find(b=>b.date===date&&b.time===time&&b.status!=='cancelled'&&b.status!=='deleted');
    if(conflict){toast('Время занято!',`${date} ${time} уже занято: ${conflict.name}`,'gold');return;}
  }

  const svc=document.getElementById('eb-svc').value;
  const status=document.getElementById('eb-status').value;
  const carVal=document.getElementById('eb-car').value;
  const comment=document.getElementById('eb-comment').value;
  const acomment=document.getElementById('eb-acomment').value;
  const pay=document.getElementById('eb-pay').value;
  const priceRaw=document.getElementById('eb-price').value;
  const price=priceRaw===''?undefined:Number(priceRaw);
  const prepay_amount=Number(document.getElementById('eb-prepay').value||0);
  const paid_amount=Number(document.getElementById('eb-paid').value||0);
  const refund_amount=Number(document.getElementById('eb-refund').value||0);
  for(const [label,val] of [['цена',price],['предоплата',prepay_amount],['оплачено',paid_amount],['возврат',refund_amount]]){
    if(val!==undefined && (!Number.isFinite(val)||val<0)){toast('⚠ Проверьте сумму',`Поле «${label}» — некорректное число`,'#e55');return;}
  }

  try {
    if(id){
      const data = await apiFetch('/bookings/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ name, phone, service: svc, status, date, time, car: carVal, comment, admin_comment: acomment, pay, price, prepay_amount, paid_amount, refund_amount }),
      });
      const idx=bookings.findIndex(b=>b.id==id);
      const old = idx>=0 ? {...bookings[idx]} : null;
      if(idx>=0) bookings[idx]=apiBookingToLocal(data.booking);
      addLog('Изменена запись',id,old?`${old.status}→${status}`:'');
    } else {
      const data = await apiFetch('/bookings/manual', {
        method: 'POST',
        body: JSON.stringify({ name, phone, service: svc, status, date, time, car: carVal, comment, pay, price, prepay_amount, paid_amount, refund_amount }),
      });
      const b = apiBookingToLocal(data.booking);
      bookings.unshift(b);
      addLog('Добавлена запись',b.id,`${b.name} — ${b.svc}`);
      toast('Запись добавлена',`${b.name} / ${b.svc} / ${b.time}`,'gold');
    }
  } catch (err) {
    toast('⚠ Не удалось сохранить запись', err.message, '#e55');
    return;
  }

  closeM('m-addbooking');
  renderAll();updateDash();renderSched();
}

function openEditB(id){
  const b=bookings.find(x=>x.id===id);if(!b)return;
  document.getElementById('m-addbooking-title').textContent='Редактировать запись';
  document.getElementById('eb-id').value=id;
  document.getElementById('eb-name').value=b.name;
  document.getElementById('eb-phone').value=b.phone;
  ensureSelectOption(document.getElementById('eb-svc'),b.svc);document.getElementById('eb-svc').value=b.svc;
  document.getElementById('eb-status').value=b.status;
  document.getElementById('eb-date').value=b.date;
  fillEbTimeOptions(b.time);
  document.getElementById('eb-car').value=b.car||'';
  document.getElementById('eb-comment').value=b.comment||'';
  document.getElementById('eb-acomment').value=b.acomment||'';
  document.getElementById('eb-pay').value=b.pay||'none';
  document.getElementById('eb-price').value=b.price===null||b.price===undefined?'':b.price;
  document.getElementById('eb-prepay').value=b.prepay||0;
  document.getElementById('eb-paid').value=b.paid||0;
  document.getElementById('eb-refund').value=b.refund||0;
  document.getElementById('eb-delbtn').style.display='inline-flex';
  openM('m-addbooking',true);   // true: форма уже заполнена, сбрасывать нельзя
}
// Клик по ячейке расписания: новая запись сразу на выбранные дату и время
function openAddAt(date,time){
  openM('m-addbooking');
  document.getElementById('eb-date').value=date;
  fillEbTimeOptions('');
  const sel=document.getElementById('eb-time');
  if([...sel.options].some(o=>o.value===time))sel.value=time;
}

function confirmDel(id){
  document.getElementById('m-confirm-btn').onclick=()=>{delBooking(id);closeM('m-confirm');};
  openM('m-confirm');
}
async function delBooking(id){
  const idx=bookings.findIndex(b=>b.id==id);
  const name = idx>=0 ? bookings[idx].name : '';
  try {
    await apiFetch('/bookings/' + id, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'deleted' }),
    });
    if(idx>=0){bookings[idx].status='deleted';addLog('Удалена запись',id,name);}
  } catch (err) {
    toast('⚠ Не удалось удалить запись', err.message, '#e55');
  }
  closeM('m-addbooking');closeM('m-confirm');
  renderAll();updateDash();renderSched();
}

// ═══════════════════════════════════════════
// SCHEDULE
// ═══════════════════════════════════════════
function getWeek(offset){
  const d=new Date();d.setDate(d.getDate()-d.getDay()+1+offset*7);
  return Array.from({length:7},(_,i)=>{const x=new Date(d);x.setDate(d.getDate()+i);return x;});
}
function renderSched(){
  const wrap=document.getElementById('sched-wrap');if(!wrap)return;
  const days=getWeek(schedOffset);
  const dn=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  const today=todayInRyazan();
  document.getElementById('schedlabel').textContent=`${days[0].toLocaleDateString('ru')} — ${days[6].toLocaleDateString('ru')}`;
  const pad=t=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');
  const toMin=ts=>{const m=String(ts).match(/^(\d{1,2}):(\d{2})$/);return m?+m[1]*60+ +m[2]:NaN;};
  const dayInfo=days.map(d=>{const ds=d.toISOString().split('T')[0];return{ds,h:ebHoursFor(ds)};});
  // Строки сетки — по графику из настроек: от самого раннего открытия до самого позднего закрытия за неделю
  const open=dayInfo.filter(x=>!x.h.closed);
  const slot=(open[0]||dayInfo[0]).h.slot;
  const gridStart=Math.min(...open.map(x=>x.h.start)),gridEnd=Math.max(...open.map(x=>x.h.end));
  const rows=[];
  if(open.length)for(let t=gridStart;t+slot<=gridEnd;t+=slot)rows.push({t,ts:pad(t),extra:false});
  // Записи, не попадающие в сетку (например, администратор поставил на 22:00 или на 10:30) — отдельные строки, чтобы не пропадали
  const live=b=>b.status!=='deleted'&&b.status!=='cancelled';
  const known=new Set(rows.map(r=>r.ts));
  const weekDates=new Set(dayInfo.map(x=>x.ds));
  const extraTimes=[...new Set(bookings.filter(b=>weekDates.has(b.date)&&live(b)&&!known.has(b.time)&&!isNaN(toMin(b.time))).map(b=>b.time))];
  extraTimes.forEach(ts=>rows.push({t:toMin(ts),ts,extra:true}));
  rows.sort((a,b)=>a.t-b.t);
  let h=`<div class="sched-grid"><div class="shdr"></div>`;
  dayInfo.forEach((x,i)=>{const d=days[i];h+=`<div class="shdr" style="${x.ds===today?'color:var(--gold)':''}">${dn[i]}<br>${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')}${x.h.closed?'<br><small style="opacity:.7">выходной</small>':''}</div>`;});
  rows.forEach(r=>{
    h+=`<div class="stime${r.extra?' off':''}" title="${r.extra?'вне графика':''}">${r.ts}</div>`;
    dayInfo.forEach(x=>{
      const evs=bookings.filter(b=>b.date===x.ds&&b.time===r.ts&&live(b));
      // ячейка доступна для новой записи, только если слот целиком внутри рабочего дня
      const free=!r.extra&&!x.h.closed&&r.t>=x.h.start&&r.t+x.h.slot<=x.h.end;
      h+=free
        ?`<div class="scell" tabindex="0" role="button" aria-label="Добавить запись на ${x.ds} ${r.ts}" ${RDActions.attr('click',[["openAddAt",x.ds,r.ts]])}>`
        :`<div class="scell off" aria-hidden="${evs.length?'false':'true'}">`;
      evs.forEach(e=>{h+=`<div class="sev ${e.status}" tabindex="0" role="button" ${RDActions.attr('click',[["$stop"],["openEditB",e.id]])} title="${escapeHtml(e.name)} — ${escapeHtml(e.svc)}">${escapeHtml(String(e.name||'').split(' ')[0])}</div>`;});
      h+=`</div>`;
    });
  });
  h+=`</div>`;wrap.innerHTML=h;
}
function schedPrev(){schedOffset--;renderSched();}
function schedNext(){schedOffset++;renderSched();}
