// admin-app/dashboard.js — Дашборд.
// Классический скрипт: переменные и функции общие для всех файлов админки
// (порядок подключения см. в admin.html).

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════
function updateDash(){
  const today=todayInRyazan();
  const nb=bookings.filter(b=>b.status==='new').length;
  const tb=bookings.filter(b=>b.date===today&&b.status!=='deleted'&&b.status!=='cancelled').length;
  const nm=msgs.filter(m=>m.status==='new').length;
  const rev=Money.revenue(bookings,b=>b.date===today,services);
  document.getElementById('d-new').textContent=nb;
  document.getElementById('d-today').textContent=tb;
  document.getElementById('d-msg').textContent=nm;
  document.getElementById('d-rev').textContent=rev.toLocaleString()+' ₽';
  document.getElementById('d-tcnt').textContent=tb;
  const list=bookings.filter(b=>b.date===today&&b.status!=='deleted'&&b.status!=='cancelled').sort((a,b)=>a.time.localeCompare(b.time));
  document.getElementById('d-tlist').innerHTML=list.length?list.map(b=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05)"><div><strong>${escapeHtml(b.time)}</strong> — ${escapeHtml(b.name)}<div style="font-size:12px;color:var(--muted)">${escapeHtml(b.svc)}</div></div>${bBadge(b.status)}</div>`).join(''):'<p style="color:var(--muted);font-size:13px">Нет записей на сегодня</p>';
  // Bar chart
  const counts={};
  bookings.filter(b=>b.status!=='deleted').forEach(b=>{counts[b.svc]=(counts[b.svc]||0)+1;});
  const max=Math.max(...Object.values(counts),1);
  document.getElementById('d-bars').innerHTML=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>`<div class="cbar-row"><div class="cbar-lbl">${escapeHtml(k)}</div><div class="cbar-track"><div class="cbar-fill" style="width:${v/max*100}%"></div></div><div class="cbar-val">${v}</div></div>`).join('');
}
