/* Language toggle for the static legal pages. Shares the portal's key (xc_lang_v1): zh-Hans => Chinese, anything else => English. */
(function(){
  var KEY='xc_lang_v1', root=document.documentElement, btn=document.getElementById('langbtn');
  function pick(){var v=null;try{v=localStorage.getItem(KEY)}catch(e){}
    if(!v)v=(navigator.language||'en');return String(v).toLowerCase().indexOf('zh')===0?'zh':'en'}
  function apply(l){root.setAttribute('data-lang',l);root.lang=l==='zh'?'zh-Hans':'en';if(btn)btn.textContent=l==='zh'?'English':'中文'}
  apply(pick());
  if(btn)btn.addEventListener('click',function(){var n=root.getAttribute('data-lang')==='zh'?'en':'zh';
    try{localStorage.setItem(KEY,n==='zh'?'zh-Hans':'en')}catch(e){}apply(n)});
})();
