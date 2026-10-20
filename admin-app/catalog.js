// admin-app/catalog.js — Каталог: услуги и работы.
// Классический скрипт: переменные и функции общие для всех файлов админки
// (порядок подключения см. в admin.html).

// ═══════════════════════════════════════════
// SERVICES
// ═══════════════════════════════════════════
function renderSvcs(){
  syncBookingServiceOptions();
  const grid=document.getElementById('svgrid');if(!grid)return;
  const svHtml=services.map(s=>{
  const disc=s.discount?`<span style="background:#e55;color:#fff;font-size:10px;padding:1px 5px;border-radius:3px;margin-left:6px">-${s.discount}%</span>`:'';
  const photoThumb=s.photo?`<img src="${escapeHtml(s.photo)}" alt="Фото услуги" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-bottom:8px" loading="lazy" decoding="async">`:'' ;
  const pageLink=slugSvc(s.name,s.id);
  return `<div class="svcard" style="${s.active?'':'opacity:0.45;filter:grayscale(0.5)'}">
    ${photoThumb}
    <h4 style="display:flex;align-items:center;gap:8px">${escapeHtml(s.name)}${s.active?'':'<span style="font-size:10px;color:#e55;font-weight:600">СКРЫТА</span>'}</h4>
    <div class="svprice">от ${s.price.toLocaleString()} ₽${disc}</div>
    <div style="font-size:12px;color:var(--muted)">⏱ ${escapeHtml(s.dur)}</div>
    <div style="font-size:12px;color:var(--muted);margin-top:4px">${escapeHtml(s.desc)}</div>
    <div class="svrow">
      <span class="b ${s.active?'b-done':'b-cancel'}">${s.active?'Активна':'Скрыта'}</span>
      <div style="display:flex;gap:6px">
        <button class="btn btn-out btn-sm" title="Редактировать" ${RDActions.attr('click',[["openEditSvc",s.id]])}>✎</button>
        <button class="btn btn-out btn-sm" title="Открыть страницу" ${RDActions.attr('click',[["$open",String(pageLink),"_blank"]])}>🔗</button>
        <button class="btn btn-red btn-sm" title="Удалить услугу" ${RDActions.attr('click',[["deleteSvc",s.id]])}>✕</button>
      </div>
    </div>
  </div>`;
}).join('');
  setRowsHTML(grid, svHtml);
}
function slugSvc(name,id){
  const m={
    'Комплексная мойка':'service-wash.html',
    'Детейлинг кузова':'service-detail.html',
    'Химчистка салона':'service-interior.html',
    'Мойка дисков и шин':'service-wheels.html',
    'Полировка фар':'service-headlights.html',
    'Керамическое покрытие':'service-ceramic.html',
    'Озонирование салона':'service-ozone.html',
    'Мойка подкапотного пространства':'service-engine.html',
    'Обработка защитными составами':'service-coating.html',
    'Оклейка PPF':'service-ppf.html'
  };
  return m[name]||('service-page.html?id='+(id||''));
}
function loadSvcPhoto(input,targetId,previewId){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=function(e){
    const data=e.target.result;
    const inp=document.getElementById(targetId);if(inp)inp.value=data;
    const prev=document.getElementById(previewId);
    if(prev)prev.innerHTML='<img src="'+data+'" alt="Предпросмотр фото" style="max-height:80px;border-radius:6px;margin-top:4px" loading="lazy" decoding="async">';
  };
  reader.readAsDataURL(file);
}
async function deleteSvc(id){
  const s=services.find(x=>x.id===id);
  if(!s)return;
  if(!confirm('Удалить услугу «'+s.name+'»? Это действие нельзя отменить.'))return;
  try {
    await apiFetch('/services/' + id, { method: 'DELETE' });
    services=services.filter(x=>x.id!==id);
    renderSvcs();
    addLog('Удалена услуга',id,s.name);
    toast('Услуга «'+s.name+'» удалена','','red');
  } catch (err) {
    toast('⚠ Не удалось удалить услугу', err.message, '#e55');
  }
}
async function addNewService(){
  const name=document.getElementById('ns-name').value.trim();
  const price=+document.getElementById('ns-price').value;
  if(!name||!price){toast('⚠ Заполните название и цену','#e55');return;}
  const payload={
    name,price,
    dur:document.getElementById('ns-dur').value||'',
    desc:document.getElementById('ns-desc').value||'',
    discount:+document.getElementById('ns-discount').value||0,
    fullDesc:document.getElementById('ns-fulldesc').value||'',
    photo:document.getElementById('ns-photo').value||'',
    active:document.getElementById('ns-active').classList.contains('on')
  };
  try {
    const data = await apiFetch('/services', { method: 'POST', body: JSON.stringify(payload) });
    services.push(data.service);
    closeM('m-addsvc');renderSvcs();
    addLog('Добавлена услуга',data.service.id,data.service.name);toast('Услуга «'+data.service.name+'» добавлена');
    ['ns-name','ns-price','ns-dur','ns-discount','ns-desc','ns-fulldesc','ns-photo'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    const prev=document.getElementById('ns-photo-preview');if(prev)prev.innerHTML='';
  } catch (err) {
    toast('⚠ Не удалось добавить услугу', err.message, '#e55');
  }
}
function openEditSvc(id){
  const s=services.find(x=>x.id===id);if(!s)return;
  document.getElementById('es-id').value=id;
  document.getElementById('es-name').value=s.name;
  document.getElementById('es-price').value=s.price;
  document.getElementById('es-dur').value=s.dur;
  document.getElementById('es-desc').value=s.desc;
  document.getElementById('es-discount').value=s.discount||0;
  document.getElementById('es-fulldesc').value=s.fullDesc||'';
  document.getElementById('es-photo').value=s.photo||'';
  const prev=document.getElementById('es-photo-preview');
  prev.innerHTML=s.photo?`<img src="${escapeHtml(s.photo)}" alt="Текущее фото услуги" style="max-height:80px;border-radius:6px;margin-top:4px" loading="lazy" decoding="async">`:'';
  document.getElementById('es-active').classList.toggle('on',s.active);
  openM('m-editsvc');
}
async function updateSvc(){
  const id=parseInt(document.getElementById('es-id').value);
  const idx=services.findIndex(s=>s.id===id);if(idx<0)return;
  const old=services[idx].price;
  const payload={
    name:document.getElementById('es-name').value,
    price:parseInt(document.getElementById('es-price').value)||0,
    dur:document.getElementById('es-dur').value,
    desc:document.getElementById('es-desc').value,
    discount:+document.getElementById('es-discount').value||0,
    fullDesc:document.getElementById('es-fulldesc').value,
    photo:document.getElementById('es-photo').value,
    active:document.getElementById('es-active').classList.contains('on')
  };
  try {
    const data = await apiFetch('/services/' + id, { method: 'PATCH', body: JSON.stringify(payload) });
    services[idx]=data.service;
    closeM('m-editsvc');renderSvcs();
    addLog(old!==data.service.price?'Изменена цена услуги':'Изменена услуга',id,old!==data.service.price?`${data.service.name}: ${old}₽ → ${data.service.price}₽`:data.service.name);
    toast('Услуга обновлена',data.service.name,'green');
  } catch (err) {
    toast('⚠ Не удалось обновить услугу', err.message, '#e55');
  }
}

// ═══════════════════════════════════════════
// WORKS
// ═══════════════════════════════════════════
function renderWorks(cat=''){
  const list=cat?works.filter(w=>w.cat===cat):works;
  setRowsHTML(document.getElementById('wgrid'), list.length?list.map(w=>`<div class="wcard"><div class="wcard-imgs"><div class="wph">${w.before?`<img src="${escapeHtml(w.before)}" alt="Фото до" style="width:100%;height:100px;object-fit:cover" loading="lazy" decoding="async">`:'📷 До'}</div><div class="wph">${w.after?`<img src="${escapeHtml(w.after)}" alt="Фото после" style="width:100%;height:100px;object-fit:cover" loading="lazy" decoding="async">`:'📷 После'}</div></div><div class="wcard-info"><strong style="font-size:14px">${escapeHtml(w.name)}</strong><div style="font-size:12px;color:var(--muted);margin-top:4px">${escapeHtml(w.cat)} · ${escapeHtml(w.time)}</div><div style="margin-top:8px;display:flex;gap:6px"><button class="btn btn-out btn-sm admin-only" ${RDActions.attr('click',[["delWork",w.id]])}>Удалить</button></div></div></div>`).join(''):'<p style="color:var(--muted)">Работ нет. Нажмите «Добавить работу».</p>');
}
function filterWorks(v){renderWorks(v);}
async function saveWork(){
  const payload={
    name:document.getElementById('aw-name').value,
    cat:document.getElementById('aw-cat').value,
    time:document.getElementById('aw-time').value,
    before:document.getElementById('aw-before').value,
    after:document.getElementById('aw-after').value,
    desc:document.getElementById('aw-desc').value,
    active:true
  };
  if(!payload.name){toast('⚠ Укажите название работы','#e55');return;}
  try {
    const data = await apiFetch('/works', { method: 'POST', body: JSON.stringify(payload) });
    works.unshift(data.work);
    closeM('m-addwork');renderWorks();addLog('Добавлена работа',data.work.id,data.work.name);toast('Работа добавлена',data.work.name,'green');
  } catch (err) {
    toast('⚠ Не удалось добавить работу', err.message, '#e55');
  }
}
async function delWork(id){
  try {
    await apiFetch('/works/' + id, { method: 'DELETE' });
    works=works.filter(w=>w.id!==id);
    renderWorks();
  } catch (err) {
    toast('⚠ Не удалось удалить работу', err.message, '#e55');
  }
}
