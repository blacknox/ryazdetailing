(function(){
  var wrap = document.querySelector('.ba-wrap');
  if(!wrap) return;
  var bef = wrap.querySelector('.ba-before');
  var div = wrap.querySelector('.ba-div');
  var hdl = wrap.querySelector('.ba-hdl');
  bef.style.backgroundImage = "url('" + wrap.dataset.before + "')";
  wrap.querySelector('.ba-after').style.backgroundImage = "url('" + wrap.dataset.after + "')";
  var pct = 50; var drag = false;
  function set(x){
    var r = wrap.getBoundingClientRect();
    pct = Math.max(2, Math.min(98, (x - r.left)/r.width*100));
    bef.style.clipPath = 'inset(0 '+(100-pct)+'% 0 0)';
    div.style.left = pct+'%'; hdl.style.left = pct+'%';
  }
  set(wrap.getBoundingClientRect().left + wrap.getBoundingClientRect().width/2);
  wrap.addEventListener('mousedown', function(e){ drag=true; set(e.clientX); e.preventDefault(); });
  window.addEventListener('mousemove', function(e){ if(drag) set(e.clientX); });
  window.addEventListener('mouseup', function(){ drag=false; });
  wrap.addEventListener('touchstart', function(e){ drag=true; set(e.touches[0].clientX); }, {passive:true});
  window.addEventListener('touchmove', function(e){ if(drag) set(e.touches[0].clientX); }, {passive:true});
  window.addEventListener('touchend', function(){ drag=false; });

  // Pre-select service in booking
  var params = new URLSearchParams(window.location.search);
  var svc = params.get('service');
  if(svc) {
    sessionStorage.setItem('preselect_service', svc);
  }
})();
