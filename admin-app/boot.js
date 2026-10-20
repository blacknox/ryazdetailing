// admin-app/boot.js — запуск админки. Подключается ПОСЛЕДНИМ: к этому моменту
// все функции из остальных файлов уже определены.

// Enter на логине → фокус на пароль; Enter на пароле → войти
document.getElementById('li').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('lp').focus(); }
});
document.getElementById('lp').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') { e.preventDefault(); doLogin(); }
});

// Функции, вызываемые из data-click / data-change / data-input (см. js/actions.js)
RDActions.register({
  openAddAt: window.openAddAt,
  fillEbTimeOptions: window.fillEbTimeOptions,
  toggleSidebar: window.toggleSidebar,
  closeSidebar: window.closeSidebar,
  addAdmin: window.addAdmin,
  addBlacklist: window.addBlacklist,
  addNewService: window.addNewService,
  clearOldLogs: window.clearOldLogs,
  closeM: window.closeM,
  confirmDel: window.confirmDel,
  delAdmin: window.delAdmin,
  delBooking: window.delBooking,
  delMsg: window.delMsg,
  delRev: window.delRev,
  delWork: window.delWork,
  deleteSvc: window.deleteSvc,
  doLogin: window.doLogin,
  doLogout: window.doLogout,
  exportBookings: window.exportBookings,
  filterB: window.filterB,
  filterBDate: window.filterBDate,
  filterBStatus: window.filterBStatus,
  filterBSvc: window.filterBSvc,
  filterM: window.filterM,
  filterMStatus: window.filterMStatus,
  filterRevCat: window.filterRevCat,
  filterRevRating: window.filterRevRating,
  filterRevStatus: window.filterRevStatus,
  filterWorks: window.filterWorks,
  go: window.go,
  loadContentPage: window.loadContentPage,
  loadDefaultPrivacy: window.loadDefaultPrivacy,
  loadSvcPhoto: window.loadSvcPhoto,
  openEditB: window.openEditB,
  openEditSvc: window.openEditSvc,
  openM: window.openM,
  removeBlacklist: window.removeBlacklist,
  saveBooking: window.saveBooking,
  saveContacts: window.saveContacts,
  saveContent: window.saveContent,
  savePrivacy: window.savePrivacy,
  saveReview: window.saveReview,
  saveWork: window.saveWork,
  schedNext: window.schedNext,
  schedPrev: window.schedPrev,
  sortB: window.sortB,
  sortRevs: window.sortRevs,
  syncSound: window.syncSound,
  toggleAdmin: window.toggleAdmin,
  toggleMsg: window.toggleMsg,
  toggleRev: window.toggleRev,
  toggleSound: window.toggleSound,
  updateHoursPreview: window.updateHoursPreview,
  updateSvc: window.updateSvc,
});

tryAutoLogin();
