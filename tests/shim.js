// Browser fixture only. Production extension never loads this file.
(() => {
  const listeners=[];
  function changed(oldValue,newValue){listeners.forEach(fn=>fn({jhPrefs:{oldValue,newValue}},'local'));}
  window.chrome={runtime:{getURL:file=>'/extension/'+file},storage:{local:{async get(){return {jhPrefs:JSON.parse(localStorage.getItem('jh-test-prefs')||'null')};},async set(value){const oldValue=JSON.parse(localStorage.getItem('jh-test-prefs')||'null');localStorage.setItem('jh-test-prefs',JSON.stringify(value.jhPrefs));changed(oldValue,value.jhPrefs);}},onChanged:{addListener(fn){listeners.push(fn);}}}};
  window.addEventListener('storage',e=>{if(e.key==='jh-test-prefs')changed(JSON.parse(e.oldValue||'null'),JSON.parse(e.newValue||'null'));});
})();
