// admin-app/reviews.js — Отзывы.
// Классический скрипт: переменные и функции общие для всех файлов админки
// (порядок подключения см. в admin.html).

// ═══════════════════════════════════════════
// REVIEWS
// ═══════════════════════════════════════════
function renderRevs(f=''){if(f)revFilterStatus=f;applyRevFilters();}
// ── Review filter state ──
let revFilterStatus='', revFilterRating='', revFilterCat='', revSort='';
function applyRevFilters(){
  let list=[...reviews];
  if(revFilterStatus) list=list.filter(r=>r.status===revFilterStatus);
  if(revFilterRating) list=list.filter(r=>(r.rating||r.stars||0)===parseInt(revFilterRating));
  if(revFilterCat) list=list.filter(r=>{const s=r.svc||r.tag||'';return s.includes(revFilterCat);});
  if(revSort==='rating-desc') list.sort((a,b)=>(b.rating||b.stars||0)-(a.rating||a.stars||0));
  else if(revSort==='rating-asc') list.sort((a,b)=>(a.rating||a.stars||0)-(b.rating||b.stars||0));
  else if(revSort==='date-desc') list.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  else if(revSort==='date-asc') list.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  setRowsHTML(document.getElementById('revtbody'), list.map((r,i)=>`<tr role="row"><td role="cell" data-label="#">#${i+1}</td><td role="cell" data-label="Клиент">${escapeHtml(r.name)}</td><td role="cell" data-label="Оценка" style="color:var(--gold)">${'★'.repeat(r.rating||r.stars||0)}</td><td role="cell" data-label="Услуга">${escapeHtml(r.svc||r.tag||'—')}</td><td role="cell" data-label="Текст" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.text)}</td><td role="cell" data-label="Дата">${escapeHtml(r.date)}</td><td role="cell" data-label="Статус"><span class="b ${r.status==='published'?'b-done':r.status==='new'?'b-gold':'b-cancel'}">${r.status==='published'?'Опубликован':r.status==='new'?'На модерации':'Скрыт'}</span></td><td role="cell" data-label="Действия"><div style="display:flex;gap:6px"><button class="btn btn-out btn-sm" ${RDActions.attr('click',[["toggleRev",r.id]])}>${r.status==='published'?'Скрыть':'Показать'}</button><button class="btn btn-red btn-sm admin-only" aria-label="Удалить отзыв" ${RDActions.attr('click',[["delRev",r.id]])}>✕</button></div></td></tr>`).join(''));
}
function filterRev(v){revFilterStatus=v;applyRevFilters();}
function filterRevStatus(v){revFilterStatus=v;applyRevFilters();}
function filterRevRating(v){revFilterRating=v;applyRevFilters();}
function filterRevCat(v){revFilterCat=v;applyRevFilters();}
function sortRevs(v){revSort=v;applyRevFilters();}
async function toggleRev(id){
  const r=reviews.find(x=>x.id===id);
  if(!r) return;
  const next = r.status==='published'?'hidden':'published';
  try {
    await apiFetch('/reviews/' + id, { method: 'PATCH', body: JSON.stringify({ status: next }) });
    r.status = next;
    renderRevs();
  } catch (err) {
    toast('⚠ Не удалось обновить отзыв', err.message, '#e55');
  }
}
async function delRev(id){
  try {
    await apiFetch('/reviews/' + id, { method: 'DELETE' });
    reviews=reviews.filter(r=>r.id!==id);
    renderRevs();
  } catch (err) {
    toast('⚠ Не удалось удалить отзыв', err.message, '#e55');
  }
}
async function saveReview(){
  const name=document.getElementById('rv-name').value;
  const rating=parseInt(document.getElementById('rv-rate').value);
  const svc=document.getElementById('rv-svc').value;
  const text=document.getElementById('rv-text').value;
  const date=document.getElementById('rv-date').value;
  if(!name||!text){toast('Заполните обязательные поля','Имя и текст отзыва','gold');return;}
  try {
    const data = await apiFetch('/reviews/manual', {
      method: 'POST',
      body: JSON.stringify({ name, stars: rating, svc, text, date, status: 'published' }),
    });
    reviews.unshift(data.review);
    closeM('m-addreview');renderRevs();addLog('Добавлен отзыв',data.review.id,data.review.name);toast('Отзыв добавлен',data.review.name,'green');
  } catch (err) {
    toast('⚠ Не удалось сохранить отзыв', err.message, '#e55');
  }
}
