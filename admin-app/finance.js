// admin-app/finance.js — Финансы.
// Классический скрипт: переменные и функции общие для всех файлов админки
// (порядок подключения см. в admin.html).

// ═══════════════════════════════════════════
// FINANCE
// ═══════════════════════════════════════════
function renderFinance(){
  const today=todayInRyazan();
  // Выручка считается ТОЛЬКО по заявкам со статусом «Выполнена». Все денежные
  // формулы — в admin-app/money.js (единый источник истины для finance и dashboard).
  const priceOf=b=>Money.priceOf(b,services);
  const done=bookings.filter(b=>b.status==='done');
  const dayRev=Money.revenueLastDays(bookings,today,1,services);
  const weekRev=Money.revenueLastDays(bookings,today,7,services);
  const monthRev=Money.revenueLastDays(bookings,today,30,services);
  const totalRev=done.reduce((acc,b)=>acc+priceOf(b),0);
  const hint=done.length===0
    ?'<div style="font-size:12px;color:var(--muted);margin-top:8px;grid-column:span 3">💡 Выручка появится когда заявки переведены в статус <b>«Выполнена»</b> в разделе «Записи на мойку»</div>'
    :'';

  // Предоплаты, ещё не закрытые полной оплатой (деньги уже на руках, но
  // заявка не выполнена/не оплачена до конца) — для понимания живого кассового потока.
  const openPrepay=bookings.filter(b=>b.status!=='cancelled'&&b.status!=='deleted'&&(b.prepay||0)>0&&b.pay!=='paid').reduce((a,b)=>a+(b.prepay||0),0);
  const totalRefund=bookings.reduce((a,b)=>a+(b.refund||0),0);
  // Задолженность: по словам владельца такого почти не бывает (оплата сразу
  // по факту услуги) — но если цифры разошлись, это должно быть видно, а не
  // спрятано.
  const netPaid=b=>Money.netPaid(b);
  const debtBookings=done.filter(b=>priceOf(b)>netPaid(b));
  const totalDebt=debtBookings.reduce((a,b)=>a+(priceOf(b)-netPaid(b)),0);
  const debtCard=totalDebt>0
    ?`<div class="fcard" style="background:rgba(229,85,85,.08);border-color:#e55"><div class="fcard-val" style="color:#e55">${totalDebt.toLocaleString()} ₽</div><div class="fcard-lbl">Задолженность (${debtBookings.length})</div></div>`
    :`<div class="fcard"><div class="fcard-val" style="color:var(--green)">0 ₽</div><div class="fcard-lbl">Задолженности нет</div></div>`;

  document.getElementById('fcards').innerHTML=`
    <div class="fcard"><div class="fcard-val">${dayRev.toLocaleString()} ₽</div><div class="fcard-lbl">Выручка сегодня</div></div>
    <div class="fcard"><div class="fcard-val">${weekRev.toLocaleString()} ₽</div><div class="fcard-lbl">За 7 дней</div></div>
    <div class="fcard"><div class="fcard-val">${monthRev.toLocaleString()} ₽</div><div class="fcard-lbl">За 30 дней</div></div>
    <div class="fcard" style="background:rgba(255,210,30,.07);border-color:var(--gold)"><div class="fcard-val" style="color:var(--gold)">${totalRev.toLocaleString()} ₽</div><div class="fcard-lbl">Всего выполнено</div></div>
    <div class="fcard"><div class="fcard-val" style="font-size:20px">${done.length}</div><div class="fcard-lbl">Выполненных заявок</div></div>
    <div class="fcard"><div class="fcard-val" style="font-size:20px">${done.length?Math.round(totalRev/done.length).toLocaleString():0} ₽</div><div class="fcard-lbl">Средний чек</div></div>
    <div class="fcard"><div class="fcard-val" style="font-size:20px">${openPrepay.toLocaleString()} ₽</div><div class="fcard-lbl">Собрано предоплат (не закрыто)</div></div>
    <div class="fcard"><div class="fcard-val" style="font-size:20px">${totalRefund.toLocaleString()} ₽</div><div class="fcard-lbl">Возвраты всего</div></div>
    ${debtCard}
    ${hint}
  `;
  // By service
  const bySvc={};done.forEach(b=>{const s=services.find(x=>x.name===b.svc);bySvc[b.svc]=(bySvc[b.svc]||0)+priceOf(b);});
  const maxRev=Math.max(...Object.values(bySvc),1);
  document.getElementById('fin-bars').innerHTML=Object.entries(bySvc).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="cbar-row"><div class="cbar-lbl">${escapeHtml(k)}</div><div class="cbar-track"><div class="cbar-fill" style="width:${v/maxRev*100}%"></div></div><div class="cbar-val">${(v/1000).toFixed(0)}k</div></div>`).join('');
  // By status
  const statCounts={new:0,confirmed:0,inwork:0,done:0,cancelled:0};
  bookings.forEach(b=>{if(statCounts[b.status]!==undefined)statCounts[b.status]++;});
  const maxS=Math.max(...Object.values(statCounts),1);
  const sNames={new:'Новые',confirmed:'Подтверждены',inwork:'В работе',done:'Выполнены',cancelled:'Отменены'};
  document.getElementById('fin-stats').innerHTML=Object.entries(statCounts).map(([k,v])=>`<div class="cbar-row"><div class="cbar-lbl">${sNames[k]}</div><div class="cbar-track"><div class="cbar-fill" style="width:${v/maxS*100}%"></div></div><div class="cbar-val">${v}</div></div>`).join('');
}
