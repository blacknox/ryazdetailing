// tests/integration.js — сквозная проверка API (валидация, деньги, фото, RBAC).
// Запуск: на ЧИСТОЙ временной копии бэкенда задайте JWT_SECRET (32+ симв.), ADMIN_LOGIN=admin,
// ADMIN_PASSWORD=Rz!Tester-Alpha-2026, MANAGER_LOGIN=mgr, MANAGER_PASSWORD=Rz!Tester-Beta-2026, PORT=3999,
// запустите `node server.js`, затем из той же папки `node tests/integration.js`. Скрипт пишет в БД — не гоняйте его на рабочей базе.
const base=`http://127.0.0.1:${process.env.PORT||3999}/api`;
let tok={};
async function call(m,p,b,t){const r=await fetch(base+p,{method:m,headers:{'Content-Type':'application/json','X-Requested-With':'rd-admin',...(t?{Cookie:t}:{})},body:b?JSON.stringify(b):undefined});let j;try{j=await r.json()}catch{j=null}if(p==='/auth/login'){const c=r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');return {s:r.status,j,cookie:c};}return {s:r.status,j};}
let pass=0,fail=0;
const ok=(n,c,x)=>{c?pass++:fail++;console.log((c?'PASS ':'FAIL ')+n+(c?'':'  -> '+JSON.stringify(x)));};
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
(async()=>{
 let r=await call('POST','/auth/login',{login:'admin',password:'Rz!Tester-Alpha-2026'});tok.a=r.cookie;ok('admin login',!!tok.a,r);
 r=await call('POST','/auth/login',{login:'mgr',password:'Rz!Tester-Beta-2026'});tok.m=r.cookie;ok('manager login',!!tok.m,r);
 // services
 r=await call('POST','/services',{name:'Тест',price:'abc'},tok.a);ok('service bad price 400',r.s===400,r);
 r=await call('POST','/services',{name:'Т'.repeat(200),price:100},tok.a);ok('service long name 400',r.s===400,r);
 r=await call('POST','/services',{name:'Тест',price:1500,photo:'javascript:alert(1)'},tok.a);ok('service js: photo 400',r.s===400,r);
 r=await call('POST','/services',{name:'Тест',price:1500,photo:'https://evil.com/a.jpg'},tok.a);ok('service external photo 400',r.s===400,r);
 r=await call('POST','/services',{name:'Тест',price:1500},tok.m);ok('manager cannot create service 403',r.s===403,r);
 r=await call('POST','/services',{name:'Тест',price:1500,photo:PNG},tok.a);ok('service data: photo -> file',r.s===201&&/^\/uploads\/services\/.+\.webp$/.test(r.j.service.photo),r);
 const svc=r.j&&r.j.service; 
 const fs=require('fs');const fp=svc&&((process.env.BACKEND_DIR||process.cwd())+svc.photo);ok('file exists on disk',fp&&fs.existsSync(fp),fp);
 r=await call('GET','/services');ok('public API has no base64',!JSON.stringify(r.j).includes('data:image'),'');
 r=await call('PATCH','/services/'+svc.id,{photo:''},tok.a);ok('photo cleared',r.s===200&&!r.j.service.photo,r);
 ok('old file deleted',!fs.existsSync(fp),fp);
 r=await call('PATCH','/services/'+svc.id,{desc:'описание'},tok.a);r=await call('PATCH','/services/'+svc.id,{desc:''},tok.a);ok('desc can be cleared',r.s===200&&!r.j.service.desc,r);
 // works
 r=await call('POST','/works',{name:'Работа',before:PNG,after:'/assets/x.webp'},tok.a);ok('work create',r.s===201&&r.j.work.before.startsWith('/uploads/works/'),r);
 const w=r.j.work;
 r=await call('POST','/works',{name:'W',before:'data:text/html;base64,PHNjcmlwdD4='},tok.a);ok('work non-image data: 400',r.s===400,r);
 r=await call('POST','/works',{name:'W',cat:'x'.repeat(81)},tok.a);ok('work long cat 400',r.s===400,r);
 r=await call('DELETE','/works/'+w.id,null,tok.a);ok('work delete + file cleanup',r.s===200&&!fs.existsSync((process.env.BACKEND_DIR||process.cwd())+w.before),r);
 // reviews
 for (const st of [0,6,4.5,'5abc',[],null]) { r=await call('POST','/reviews/manual',{name:'Иван',text:'отлично',stars:st},tok.a); if(st===null){ok('manual stars null -> default 5',r.s===201&&r.j.review.stars===5,r);} else ok('manual stars '+JSON.stringify(st)+' 400',r.s===400,r); }
 r=await call('POST','/reviews/manual',{name:'Иван',text:'x'.repeat(3001),stars:5},tok.a);ok('review long text 400',r.s===400,r);
 r=await call('PATCH','/reviews/1',{stars:'9'},tok.a);ok('review PATCH stars 9 400',r.s===400,r);
 r=await call('POST','/reviews',{name:'Иван П',text:'норм',stars:'3x'});ok('public review stars 3x 400',r.s===400,r);
 // bookings: manual
 const d=new Date(Date.now()+3*864e5);while([0,6].includes(d.getDay()))d.setDate(d.getDate()+1);const date=d.toISOString().slice(0,10);
 const sv=(await call('GET','/services')).j.services[0];
 const mk=async(time,extra)=>call('POST','/bookings/manual',{name:'Тест К',phone:'+7 (910) 555-12-34',service:sv.name,date,time,...extra},tok.a);
 r=await mk('10:00',{prepay_amount:sv.price+1});ok('manual prepay>price 400',r.s===400,r);
 r=await mk('10:00',{refund_amount:100});ok('manual refund>received 400',r.s===400,r);
 r=await mk('10:00',{pay:'paid'});ok('manual pay=paid fills paid_amount',r.s===201&&r.j.booking.paid_amount===sv.price&&r.j.booking.pay==='paid',r);
 const b=r.j&&r.j.booking;
 r=await call('PATCH','/bookings/'+b.id,{refund_amount:sv.price+50},tok.a);ok('PATCH refund>paid 400',r.s===400,r);
 r=await call('PATCH','/bookings/'+b.id,{paid_amount:-1},tok.a);ok('PATCH negative 400',r.s===400,r);
 r=await call('PATCH','/bookings/'+b.id,{refund_amount:100,pay:'refund'},tok.a);ok('PATCH valid refund',r.s===200&&r.j.booking.pay==='refund',r);
 r=await call('PATCH','/bookings/'+b.id,{price:1},tok.m);ok('manager cannot change price 403',r.s===403,r);
 r=await call('PATCH','/bookings/'+b.id,{status:'confirmed'},tok.m);ok('status-only PATCH untouched money',r.s===200&&r.j.booking.paid_amount===sv.price,r);

 // публичная запись с «дополнительными услугами»
 const svcAll=(await call('GET','/services')).j.services;
 const extraA=svcAll[1].name, extraB=svcAll[2].name;
 const pub=await call('POST','/bookings',{name:'Публичный Клиент',phone:'+7 (910) 555-77-88',service:svcAll[0].name,date,time:'16:00',comment:'Позвонить за час',extras:[extraA,extraB,extraA,svcAll[0].name,'Несуществующая услуга',123,null,{x:1}]});
 ok('публичная запись с extras создана',pub.s===201,pub);
 const cm=pub.j&&pub.j.booking&&pub.j.booking.comment||'';
 ok('в комментарии только реальные доп. услуги, без повторов и основной',cm.startsWith('Доп. услуги: '+extraA+', '+extraB+'\n')&&!cm.includes('Несуществующая')&&cm.split(extraA).length===2&&!cm.split('\n')[0].includes(svcAll[0].name),cm);
 ok('комментарий клиента сохранён',cm.endsWith('Позвонить за час'),cm);
 const pub2=await call('POST','/bookings',{name:'Без Доп',phone:'+7 (910) 555-77-89',service:svcAll[0].name,date,time:'17:00',extras:'не массив'});
 ok('мусор вместо extras не ломает запись и ничего не добавляет',pub2.s===201&&pub2.j.booking.comment===null,pub2);
 console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
})();
