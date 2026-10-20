// admin-app/system.js — Система: журнал действий, настройки и резервные копии.
// Классический скрипт: переменные и функции общие для всех файлов админки
// (порядок подключения см. в admin.html).

// ═══════════════════════════════════════════
// LOGS
// ═══════════════════════════════════════════
// Лог действий теперь пишет сам backend — прямо внутри каждого route-обработчика
// (см. utils/logs.js на сервере), используя настоящего req.admin, а не то, что
// скажет браузер. Раньше запись шла только в localStorage этого конкретного
// браузера — другие админы её не видели, и она пропадала при очистке данных сайта.
// Эта функция больше ничего не пишет: сервер — единственный источник правды.
function addLog(){}
// Журнал: подписи полей и вывод «было → стало». Всё, что пришло с сервера, экранируется.
const LOG_FIELD_LABELS={name:'название/имя',price:'цена',dur:'длительность',discount:'скидка %',active:'активна',desc:'описание',full_desc:'полное описание',photo:'фото',
  cat:'категория',time:'время',before_photo:'фото «до»',after_photo:'фото «после»',status:'статус',stars:'оценка',svc:'услуга',text:'текст',date:'дата',service:'услуга',
  phone:'телефон',car:'авто',pay:'оплата',prepay_amount:'предоплата',paid_amount:'оплачено',refund_amount:'возврат'};
function renderLogChanges(l){
  let html='';
  if(l.changes){
    const rows=Object.entries(l.changes).map(([k,v])=>{
      const a=v&&v[0]!==null&&v[0]!==undefined?String(v[0]):'—';
      const b=v&&v[1]!==null&&v[1]!==undefined?String(v[1]):'—';
      return `<div style="font-size:11px;margin-top:2px"><b>${escapeHtml(LOG_FIELD_LABELS[k]||k)}:</b> <span style="text-decoration:line-through;opacity:.7">${escapeHtml(a)}</span> → ${escapeHtml(b)}</div>`;
    });
    html+=rows.join('');
  }
  if(l.ip)html+=`<div style="font-size:11px;margin-top:2px">IP: ${escapeHtml(l.ip)}</div>`;
  return html;
}

async function renderLogs(){
  const tbody = document.getElementById('logtbody');
  try {
    const data = await apiFetch('/logs');
    setRowsHTML(tbody, data.logs.map(l => `<tr role="row"><td role="cell" data-label="Время" style="color:var(--muted);white-space:nowrap;font-size:12px">${escapeHtml(new Date(l.created_at).toLocaleString('ru'))}</td><td role="cell" data-label="Администратор">${escapeHtml(l.admin_login)}</td><td role="cell" data-label="Действие"><span class="log-action">${escapeHtml(l.action)}</span></td><td role="cell" data-label="Объект" style="color:var(--muted)">${escapeHtml(l.entity_id||'—')}</td><td role="cell" data-label="Детали" style="color:var(--muted);max-width:280px">${escapeHtml(l.details||'')}${renderLogChanges(l)}</td></tr>`).join(''));
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#e55;padding:24px">⚠ ${escapeHtml(err.message)}</td></tr>`;
  }
}
function clearOldLogs(){
  apiFetch('/logs/old', { method: 'DELETE' })
    .then(() => { renderLogs(); toast('Логи очищены','Оставлено 50 последних записей','green'); })
    .catch(err => toast('⚠ Не удалось очистить логи', err.message, '#e55'));
}

// ═══════════════════════════════════════════
// SETTINGS / BACKUP
// ═══════════════════════════════════════════
// Реальное состояние сервера: резервные копии и Telegram (GET /api/system/status, только admin)
async function renderSystemStatus(){
  const tg=document.getElementById('sys-telegram'),bk=document.getElementById('sys-backups');
  if(!tg||!bk)return;
  if(curAdmin&&curAdmin.role&&curAdmin.role!=='admin'){tg.textContent='—';bk.textContent='Состояние сервера доступно только администратору.';return;}
  let d;
  try{d=await apiFetch('/system/status');}
  catch(err){tg.textContent='нет данных';bk.innerHTML='<span style="color:#e55">Не удалось получить состояние: '+escapeHtml(err.message)+'</span>';return;}
  tg.innerHTML=d.telegram&&d.telegram.configured
    ?'<span style="color:#4caf50">настроены на сервере ✓</span>'
    :'<span style="color:var(--muted)">не настроены</span>';
  const fmt=iso=>iso?new Date(iso).toLocaleString('ru-RU'):'—';
  const hoursAgo=iso=>iso?(Date.now()-new Date(iso).getTime())/36e5:Infinity;
  const L=d.backups&&d.backups.local,O=d.backups&&d.backups.offsite;
  const row=(label,html)=>`<div style="margin-bottom:8px"><span style="color:var(--muted)">${label}:</span> ${html}</div>`;
  let h='';
  if(!L||!L.last){
    h+=row('Копия на сервере','<span style="color:#e55">копий нет — проверьте cron и <code>deploy/backup.sh</code></span>');
  }else{
    const old=hoursAgo(L.last.time)>36;
    h+=row('Последняя копия на сервере',`<span style="color:${old?'#e55':'#4caf50'}">${escapeHtml(fmt(L.last.time))}</span> · ${L.last.sizeKB} КБ · всего копий: ${L.count}${old?' <strong style="color:#e55">— старше 36 часов, бэкап не выполняется?</strong>':''}`);
  }
  if(!O){
    h+=row('Копия вне сервера','<span style="color:#e5a000">не настроена</span> — при потере сервера копии пропадут вместе с ним (см. <code>deploy/DEPLOY.md</code>)');
  }else if(O.status==='ok'){
    const old=hoursAgo(O.time)>36;
    h+=row('Копия вне сервера',`<span style="color:${old?'#e55':'#4caf50'}">выгружена ${escapeHtml(fmt(O.time))} ✓</span>${old?' <strong style="color:#e55">— давно не обновлялась</strong>':''}`);
  }else{
    h+=row('Копия вне сервера',`<span style="color:#e55">ошибка выгрузки ${escapeHtml(fmt(O.time))}</span> — см. вывод <code>backup.sh</code>`);
  }
  bk.innerHTML=h;
}
function syncSound(){soundOn=document.getElementById('tog-sound').classList.contains('on');document.getElementById('sndbtn').classList.toggle('on',soundOn);document.getElementById('sndbtn').textContent=soundOn?'🔔 Звук вкл.':'🔕 Звук выкл.';}
