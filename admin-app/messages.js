// admin-app/messages.js — Сообщения.
// Классический скрипт: переменные и функции общие для всех файлов админки
// (порядок подключения см. в admin.html).

// ═══════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════
function renderMsgs(){
  let list=msgs;
  if(mFilter)list=list.filter(m=>m.name.toLowerCase().includes(mFilter.toLowerCase())||m.phone.includes(mFilter));
  if(mStatusF)list=list.filter(m=>m.status===mStatusF);
  const mmap={new:['b-new','Новое'],read:['b-read','Прочитано'],inwork:['b-work','В работе'],processed:['b-done','Обработано']};
  setRowsHTML(document.getElementById('mtbody'), list.map((m,_mi)=>{const[bc,bl]=(mmap[m.status]||mmap.new);return`<tr role="row"><td role="cell" data-label="#" style="color:var(--muted)">#${_mi+1}</td><td role="cell" data-label="Имя"><strong>${escapeHtml(m.name)}</strong></td><td role="cell" data-label="Телефон"><a href="tel:${encodeURIComponent(m.phone)}" style="color:var(--blue)">${escapeHtml(m.phone)}</a></td><td role="cell" data-label="Сообщение" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(m.msg)}</td><td role="cell" data-label="Дата" style="color:var(--muted);white-space:nowrap">${escapeHtml(m.created)}</td><td role="cell" data-label="Статус"><span class="b ${bc}">${bl}</span></td><td role="cell" data-label="Действия"><div style="display:flex;gap:6px"><button class="btn btn-out btn-sm" ${RDActions.attr('click',[["toggleMsg",m.id]])}>✓ Читать</button><button class="btn btn-red btn-sm admin-only" aria-label="Удалить сообщение" ${RDActions.attr('click',[["delMsg",m.id]])}>✕</button></div></td></tr>`}).join('')||'<tr role="row"><td role="cell" colspan="7" style="text-align:center;color:var(--muted);padding:24px">Сообщений нет</td></tr>');
}
function filterM(v){mFilter=v;renderMsgs();}
function filterMStatus(v){mStatusF=v;renderMsgs();}
async function toggleMsg(id){
  const m=msgs.find(x=>x.id===id);
  if(!m) return;
  const next = m.status==='new'?'read':m.status==='read'?'processed':'read';
  try {
    await apiFetch('/messages/' + id, { method: 'PATCH', body: JSON.stringify({ status: next }) });
    m.status = next;
    renderMsgs();updateBadges();updateDash();
  } catch (err) {
    toast('⚠ Не удалось обновить сообщение', err.message, '#e55');
  }
}
async function delMsg(id){
  try {
    await apiFetch('/messages/' + id, { method: 'DELETE' });
    msgs=msgs.filter(m=>m.id!==id);
    renderMsgs();updateBadges();updateDash();addLog('Удалено сообщение',id,'');
  } catch (err) {
    toast('⚠ Не удалось удалить сообщение', err.message, '#e55');
  }
}
