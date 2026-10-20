// admin-app/access.js — Доступ: администраторы и чёрный список.
// Классический скрипт: переменные и функции общие для всех файлов админки
// (порядок подключения см. в admin.html).

// ═══════════════════════════════════════════
// ADMINS
// ═══════════════════════════════════════════
// Управление учётными записями — полностью на сервере: backend /api/admins
// (см. routes/admins.js), доступно только роли 'admin'. Пароли хранятся как
// bcrypt-хэш. Раньше эта страница добавляла админов прямо в localStorage —
// вместе с паролем открытым текстом, это и была основная уязвимость.
let adminsCache = [];
async function renderAdmins(){
  const grid = document.getElementById('adgrid');
  if (curAdmin && curAdmin.role !== 'admin') {
    grid.innerHTML = `<div class="adcard" style="grid-column:1/-1"><p style="font-size:13px;color:var(--muted)">Управление администраторами доступно только главному администратору.</p></div>`;
    return;
  }
  try {
    const data = await apiFetch('/admins');
    adminsCache = data.admins || [];
  } catch (err) {
    grid.innerHTML = `<div class="adcard" style="grid-column:1/-1"><p style="font-size:13px;color:#e55">⚠ ${escapeHtml(err.message)}</p></div>`;
    return;
  }
  setRowsHTML(grid, adminsCache.map(a => {
    const isSelf = curAdmin && a.id === curAdmin.id;
    const roleLabel = a.role === 'admin' ? 'Главный администратор' : 'Менеджер';
    return `<div class="adcard">
      <div class="adcard-head">
        <div class="adava">${escapeHtml((a.login||'A')[0].toUpperCase())}</div>
        <div><strong style="font-size:14px">${escapeHtml(a.login)}</strong>${isSelf ? ' <span style="color:var(--muted);font-size:12px">(вы)</span>' : ''}
          <div style="font-size:12px;color:var(--muted)">${roleLabel}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px">
        <span class="b ${a.active ? 'b-done' : 'b-nodial'}">${a.active ? 'Активен' : 'Отключён'}</span>
        <div style="display:flex;gap:6px">
          <button class="btn btn-out btn-sm" title="${a.active ? 'Отключить' : 'Включить'}" ${RDActions.attr('click',[["toggleAdmin",a.id,a.active ? 0 : 1]])}>${a.active ? '⏸' : '▶'}</button>
          <button class="btn btn-red btn-sm" title="Удалить" ${isSelf ? 'disabled' : ''} ${RDActions.attr('click',[["delAdmin",a.id,String(encodeURIComponent(a.login))]])}>✕</button>
        </div>
      </div>
    </div>`;
  }).join(''));
}

function addAdmin(){
  const login = document.getElementById('aa-login').value.trim();
  const pass = document.getElementById('aa-pass').value;
  const role = document.getElementById('aa-role').value;
  const errEl = document.getElementById('aa-err');
  const btn = document.getElementById('aa-submit');
  errEl.style.display = 'none';

  if (login.length < 3) { errEl.textContent = 'Логин должен быть не короче 3 символов.'; errEl.style.display = 'block'; return; }
  if (pass.length < 12) { errEl.textContent = 'Пароль должен быть не короче 12 символов и не шаблонным (без «admin», «password», «123456» и т.п.).'; errEl.style.display = 'block'; return; }

  btn.classList.add('is-loading');
  apiFetch('/admins', { method: 'POST', body: JSON.stringify({ login, password: pass, role }) })
    .then(() => {
      document.getElementById('aa-login').value = '';
      document.getElementById('aa-pass').value = '';
      closeM('m-addadmin');
      addLog('Создан администратор','-',`${login} (${role})`);
      toast('✓ Администратор создан', login, 'gold');
      renderAdmins();
    })
    .catch(err => { errEl.textContent = err.message; errEl.style.display = 'block'; })
    .finally(() => btn.classList.remove('is-loading'));
}

function toggleAdmin(id, nextActive){
  apiFetch(`/admins/${id}`, { method: 'PATCH', body: JSON.stringify({ active: !!nextActive }) })
    .then(() => { addLog(nextActive ? 'Включён администратор' : 'Отключён администратор', id, ''); renderAdmins(); })
    .catch(err => toast('⚠ Не удалось изменить статус', err.message, '#e55'));
}

function delAdmin(id, loginEncoded){
  const login = decodeURIComponent(loginEncoded || '');
  if (!confirm(`Удалить администратора «${login}»? Это необратимо.`)) return;
  apiFetch(`/admins/${id}`, { method: 'DELETE' })
    .then(() => { addLog('Удалён администратор',id,login); toast('Администратор удалён', login, 'gold'); renderAdmins(); })
    .catch(err => toast('⚠ Не удалось удалить', err.message, '#e55'));
}

// ═══════════════════════════════════════════
// BLACKLIST
// ═══════════════════════════════════════════
// Чёрный список теперь на сервере (/api/blacklist) — раньше жил только в
// localStorage и совсем не проверялся при создании брони, см. bookings.js.
async function renderBlacklist(){
  const list=document.getElementById('bl-list');
  try {
    const data = await apiFetch('/blacklist');
    blacklist = data.blacklist || [];
  } catch (err) {
    list.innerHTML = `<p style="color:#e55;font-size:13px">⚠ ${escapeHtml(err.message)}</p>`;
    return;
  }
  setRowsHTML(list, blacklist.length?blacklist.map(b=>`<div class="blrow"><div><strong>${escapeHtml(b.phone)}</strong><div style="font-size:12px;color:var(--muted);margin-top:3px">${escapeHtml(b.reason||'—')}</div><div style="font-size:11px;color:#3d4a56;margin-top:2px">${escapeHtml(new Date(b.created_at).toLocaleDateString('ru'))}</div></div><button class="btn btn-red btn-sm admin-only" ${RDActions.attr('click',[["removeBlacklist",b.id]])}>Убрать</button></div>`).join(''):'<p style="color:var(--muted);font-size:13px">Чёрный список пуст</p>');
}
function addBlacklist(){
  const phoneEl = document.getElementById('bl-phone');
  const errEl = document.getElementById('bl-phone-err');
  const phone = phoneEl ? phoneEl.value.trim() : '';
  // Валидация телефона
  if (!phone || phone.replace(/\D/g,'').length < 11) {
    if (phoneEl) { phoneEl.style.borderColor='#e55'; phoneEl.style.boxShadow='0 0 0 2px rgba(229,85,85,0.25)'; }
    if (errEl) errEl.style.display='block';
    return;
  }
  if (phoneEl) { phoneEl.style.borderColor=''; phoneEl.style.boxShadow=''; }
  if (errEl) errEl.style.display='none';
  const reason = document.getElementById('bl-reason').value;
  apiFetch('/blacklist', { method: 'POST', body: JSON.stringify({ phone, reason }) })
    .then(() => {
      closeM('m-addbl');
      renderBlacklist();
      addLog('Добавлен в ЧС','-',phone);
      toast('Номер добавлен в чёрный список', phone, 'gold');
      if (phoneEl) { phoneEl.value=''; phoneEl.style.borderColor=''; }
      document.getElementById('bl-reason').value='';
    })
    .catch(err => {
      if (errEl) { errEl.textContent = '⚠ ' + err.message; errEl.style.display='block'; }
    });
}
function removeBlacklist(id){
  apiFetch(`/blacklist/${id}`, { method: 'DELETE' })
    .then(() => { addLog('Убран из ЧС',id,''); renderBlacklist(); })
    .catch(err => toast('⚠ Не удалось убрать номер', err.message, '#e55'));
}
