(() => {
  const isViewer = location.pathname === '/mod/vod/viewer.php';
  const managed = isViewer && location.hash.startsWith('#jh-player=') && window.parent !== window;
  const storage = {
    async get() { return (await chrome.storage.local.get('jhPrefs')).jhPrefs || {volume:0,sort:'deadline'}; },
    async set(p) { await chrome.storage.local.set({jhPrefs:p}); }
  };
  const ready = fn => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, {once:true}) : fn();
  if (isViewer) { setupViewer(); return; }
  if (window.top !== window) return;
  ready(async () => {
    const launch = document.createElement('button');
    launch.textContent = '강의 모아보기';
    launch.style.cssText = 'position:fixed;bottom:24px;left:24px;z-index:2147483000;background:#b40025;color:white;border:0;border-radius:2px;padding:12px 18px;font:bold 14px Pretendard,system-ui;cursor:pointer;box-shadow:0 2px 10px #0002';
    document.body.append(launch);
    launch.onclick = () => { launch.hidden=true; dashboard(()=>launch.hidden=false); };
    if (location.hash === '#jh-open') launch.click();
  });

  function setupViewer() {
    let prefs = {volume:0};
    const videos = new Set();
    const token = location.hash.slice('#jh-player='.length);
    const send = (type,data={}) => { if (managed) parent.postMessage({jh:true,token,type,...data},location.origin); };
    let locked=false,audioReady=false,tabMuted=false,audioRevision=0,audioClosing=false,audioPromise;
    const announced=new WeakSet();
    const savedVolume=()=>Math.max(0,Math.min(1,Number(prefs.volume)||0));
    function announce(v) {if(audioReady&&!announced.has(v)){announced.add(v);send('ready',{aspect:v.videoWidth&&v.videoHeight?v.videoWidth/v.videoHeight:null});}}
    function audio(v) {
      if (locked) return;
      locked=true;
      const wanted=savedVolume();
      // Never raise a zero-volume video until Chrome confirms its tab is muted.
      const volume=!audioClosing&&audioReady&&(wanted>0||tabMuted)?wanted||.01:0;
      v.defaultMuted=volume===0;
      if (v.muted !== (volume===0)) v.muted=volume===0;
      if (Math.abs(v.volume-volume)>0.001) v.volume=volume;
      locked=false;
    }
    async function syncAudio() {
      const revision=++audioRevision;audioReady=false;videos.forEach(audio);
      let result;try{result=await chrome.runtime.sendMessage({type:'jh-audio-set',volume:savedVolume(),preventMutedPause:prefs.preventMutedPause!==false});}catch{}
      if(revision!==audioRevision||audioClosing)return;
      tabMuted=result?.ok===true&&result.tabMuted===true;audioReady=true;
      videos.forEach(v=>{audio(v);announce(v);});
    }
    function attach() {
      for (const v of document.querySelectorAll('video')) {
        if (videos.has(v)) continue;
        videos.add(v); audio(v);
        if(managed) {
          v.playbackRate=1;
          v.addEventListener('ratechange',()=>{if(v.playbackRate!==1)v.playbackRate=1;});
        }
        v.addEventListener('volumechange',()=>audio(v));
        for (const event of ['loadedmetadata','play','playing','pause','waiting','error','timeupdate']) v.addEventListener(event,()=>{
          audio(v);
          send('state',{paused:v.paused,current:v.currentTime,duration:Number.isFinite(v.duration)?v.duration:0,aspect:v.videoWidth&&v.videoHeight?v.videoWidth/v.videoHeight:null,waiting:event==='waiting',error:event==='error'});
        });
        v.addEventListener('ended',()=>send('ended',{current:v.currentTime,duration:v.duration}));
        announce(v);
      }
    }
    storage.get().then(p=>{prefs=p;audioPromise=syncAudio();}).catch(()=>{audioPromise=syncAudio();});
    chrome.storage.onChanged.addListener((changes,area)=>{
      if(area==='local'&&changes.jhPrefs){const before=savedVolume(),prevent=prefs.preventMutedPause!==false;prefs=changes.jhPrefs.newValue||{volume:0};if(before!==savedVolume()||prevent!==(prefs.preventMutedPause!==false))audioPromise=syncAudio();else videos.forEach(audio);}
    });
    window.addEventListener('pagehide',()=>{audioClosing=true;audioRevision++;videos.forEach(audio);chrome.runtime.sendMessage({type:'jh-audio-release'}).catch(()=>{});});
    new MutationObserver(attach).observe(document,{childList:true,subtree:true});
    attach();
    if (!managed) return;
    let popupVisible=false;
    function checkPopup() {
      const visible=[...document.querySelectorAll('dialog[open],[role="dialog"],[aria-modal="true"],.modal,.ui-dialog,.sweet-alert,.swal2-container')].some(el=>{
        if(el.hidden||el.getAttribute('aria-hidden')==='true')return false;
        const style=getComputedStyle(el);
        return style.display!=='none'&&style.visibility!=='hidden'&&style.opacity!=='0'&&el.getClientRects().length>0;
      });
      if(visible!==popupVisible){popupVisible=visible;send('popup',{visible});}
    }
    const popupObserver=new MutationObserver(checkPopup);popupObserver.observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden','open']});
    ready(checkPopup);
    // Also catch dialogs whose visibility changes through a stylesheet or animation.
    setInterval(checkPopup,1000);
    // Let the original player fill the helper frame without squeezing the video
    // between the site's fixed header and footer.
    ready(()=>{
      const style=document.createElement('style');
      style.textContent=`html,body{margin:0!important;min-height:0!important;height:100%!important;overflow:hidden!important}#viewer{display:grid!important;grid-template-rows:50px minmax(0,1fr) 44px;height:100dvh!important;width:100%!important}#vod_header,#vod_viewer,#vod_footer{position:relative!important;inset:auto!important;width:100%!important;margin:0!important}#vod_header{height:50px!important}#vod_viewer{height:100%!important;min-height:0!important;padding:0!important}#vod_footer{height:44px!important;overflow:auto}#my-video,#vod_viewer .video-js{width:100%!important;height:100%!important;padding-top:0!important;max-height:none!important}#my-video video{width:100%!important;height:100%!important;object-fit:contain}`;
      document.head.append(style);
    });
    window.addEventListener('message',async e=>{
      if(e.origin!==location.origin || e.source!==parent || !e.data?.jh || e.data.token!==token) return;
      const v=[...videos].find(v=>v.isConnected);
      if(e.data.type==='play' && v) {if(audioPromise)await audioPromise;audio(v);try{ await v.play(); }catch{send('blocked',{message:'미니플레이어의 재생 버튼을 눌러주세요.'});}}
      if(e.data.type==='pause' && v) v.pause();
      if(e.data.type==='finalize') {
        const close=document.querySelector('.vod_close_button');
        if(!close) {send('blocked',{message:'학교의 종료 버튼을 찾지 못했습니다.'});return;}
        try {close.click();send('finalized');}catch{send('blocked',{message:'종료 처리에 실패했습니다.'});}
      }
    });
    ready(()=>{
      if(document.querySelector('input[type=password]') || /로그인이 필요/.test(document.body.innerText)) send('blocked',{message:'로그인이 필요합니다.'});
    });
  }

  async function dashboard(onClose) {
    if(document.getElementById('jh-host')) return;
    const M=globalThis.JHModel;
    let prefs=await storage.get();
    delete prefs.muted;
    let items=[],courses=[],selected=new Set(),queue=[],current=null,playing=false,scanBusy=false,finishing=false,run=0;
    let activities=[],section='videos',scanVersion=0;
    const feeds={notices:{entries:[],sources:[],loaded:false,busy:false,older:false,limit:20,error:''},resources:{entries:[],sources:[],loaded:false,busy:false,limit:20,error:''}};
    const host=document.createElement('div');host.id='jh-host';document.body.append(host);
    const originalTitle=document.title;document.title='집현캠퍼스 헬퍼';
    const shadow=host.attachShadow({mode:'open'});
    shadow.innerHTML=`<style>
      :host{position:fixed;inset:0;z-index:2147483001;font:14px/1.5 system-ui,'Malgun Gothic',sans-serif;color:#202632;background:#f5f5f8}*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer;border:1px solid #dce0e7;border-radius:10px;padding:9px 13px;background:white;color:#293040}button:disabled{opacity:.45;cursor:default}.primary{background:#87223e;color:white;border-color:#87223e}header{padding:22px 32px;border-bottom:1px solid #e3e5ec;background:white;display:flex;align-items:center;justify-content:space-between;gap:16px}h1{font-size:22px;margin:0;letter-spacing:-1px}.eyebrow{font-size:11px;letter-spacing:2px;color:#87223e;margin-bottom:4px}.sub{font-size:12px;color:#798191}.layout{display:grid;grid-template-columns:minmax(0,1fr) 360px;height:calc(100dvh - 100px)}main{padding:26px 32px;overflow:auto}aside{padding:24px;background:white;border-left:1px solid #e3e5ec;overflow:auto}.stats{display:flex;gap:12px;margin-bottom:24px}.stat{border:1px solid #e3e5ec;background:white;border-radius:14px;padding:14px 20px;flex:1}.stat strong{font-size:28px;display:block;font-weight:650}.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}input[type=search],select{border:1px solid #dce0e7;border-radius:10px;background:white;padding:10px;min-width:110px}input[type=search]{flex:1;min-width:180px}.list{display:grid;gap:9px}.row{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:12px;align-items:center;padding:16px;background:white;border:1px solid #e3e5ec;border-radius:13px}.row.active{border-color:#87223e;box-shadow:0 0 0 1px #87223e}.course{font-size:11px;color:#87223e}.title{font-weight:650;margin:2px 0 5px}.meta{font-size:12px;color:#798191}.badge{font-size:11px;border-radius:6px;padding:4px 7px;background:#f1eef2;color:#87223e}.row-actions{display:flex;gap:4px;align-items:center}.row-actions button{padding:5px 8px}.empty{padding:40px 20px;text-align:center;color:#798191;background:white;border:1px dashed #dce0e7;border-radius:14px}.player{background:#131722;border-radius:14px;overflow:hidden;aspect-ratio:4/3;display:grid;place-items:center;color:#a8b0c2;margin-top:16px;position:relative}.player iframe{border:0;width:100%;height:100%;background:#000}.player.large{position:fixed;inset:8vh 10vw;z-index:10;aspect-ratio:auto;box-shadow:0 0 0 100vmax #0009}.now{font-size:18px;font-weight:650;margin:8px 0}.status{border-radius:10px;padding:12px;background:#f4f2f5;margin-top:12px;color:#6b3146;font-size:13px}.controls{display:flex;gap:8px;margin:14px 0}.progress{width:100%;accent-color:#87223e}.audio{padding:16px 0;border-top:1px solid #eee}.audio label{display:flex;align-items:center;gap:10px}.audio input[type=range]{width:100%;accent-color:#87223e;margin-top:14px}.foot{font-size:12px;color:#858d9c;line-height:1.7}.queue{padding:14px 0;border-top:1px solid #eee}.queue div{padding:7px 0;font-size:12px;color:#798191}.message{font-size:12px;color:#798191;margin-bottom:14px}.head-actions{display:flex;gap:8px}@media(max-width:1000px){.layout{grid-template-columns:1fr 310px}main,header{padding:18px}.row-actions{flex-wrap:wrap;max-width:85px}}@media(max-width:700px){.layout{display:flex;flex-direction:column;overflow:auto}main,aside{overflow:visible}.stats{gap:6px}.stat{padding:10px}.player{max-height:280px}aside{border-left:0}.head-actions button{padding:8px}header{padding:14px}h1{font-size:18px}}
      </style><header><div><div class="eyebrow">JIPHYEON / STUDY QUEUE</div><h1>강의 모아보기</h1><div class="sub">여러 과목의 온라인 강의를 한곳에서</div></div><div class="head-actions"><button id="refresh">전체 새로고침</button><button id="close">닫기</button></div></header>
      <div class="layout"><main><div class="stats"><div class="stat"><span class="sub">현재 강좌</span><strong id="courseCount">—</strong></div><div class="stat"><span class="sub">미완료 영상</span><strong id="pendingCount">—</strong></div><div class="stat"><span class="sub">선택한 영상</span><strong id="selectedCount">0</strong></div></div><div class="toolbar"><input id="search" type="search" placeholder="과목 또는 강의 검색" aria-label="강의 검색"><select id="course" aria-label="과목 필터"><option value="">전체 과목</option></select><select id="filter" aria-label="완료 상태"><option value="pending">수강 가능한 미완료</option><option value="all">전체 영상</option><option value="done">완료 영상</option><option value="expired">기간 지난 미완료</option></select><select id="sort" aria-label="정렬"><option value="deadline">마감일순</option><option value="course">과목순</option><option value="week">주차순</option><option value="manual">직접 정렬</option></select></div><div class="toolbar"><button id="selectAll">보이는 강의 선택</button><button id="clear">선택 해제</button><button id="start" class="primary">선택 강의 연속 재생</button></div><div id="message" class="message" role="status">강좌를 불러올 준비가 됐습니다.</div><div id="list" class="list"></div></main>
      <aside><span class="eyebrow">MINI PLAYER</span><div id="now" class="now">재생할 강의를 선택하세요</div><div id="nowCourse" class="sub">기본 설정 · 음소거</div><div id="player" class="player"><span id="placeholder">학교 플레이어가 여기에 열립니다</span></div><div class="controls"><button id="pause" disabled>일시정지</button><button id="stop" disabled>중지</button><button id="expand">크게 보기</button></div><progress id="progress" class="progress" value="0" max="1"></progress><div id="time" class="sub">00:00 / 00:00</div><div id="status" class="status" role="status">대기 중</div><div class="audio"><label for="volume" class="sub">저장할 볼륨</label><input id="volume" aria-label="볼륨" type="range" min="0" max="100" value="0"><div id="volumeLabel" class="sub">0%</div></div><div class="queue"><b>다음 강의</b><div id="queue">선택한 순서대로 재생합니다.</div></div><div class="foot">학교의 원래 플레이어에서 한 강의씩 재생합니다. 학습 확인 질문은 직접 응답하세요. 창을 닫거나 컴퓨터가 절전 상태가 되면 재생이 중단될 수 있습니다.</div></aside></div>`;
    // Carry the campus identity into the added tools, using the site's own logo.
    const schoolLogo=document.querySelector('.logo-link');
    const logoUrl=schoolLogo?getComputedStyle(schoolLogo).backgroundImage.match(/url\(["']?([^"')]+)["']?\)/)?.[1]:null;
    const brand=document.createElement('div');brand.innerHTML='<div class="site-brand"><img class="school-logo" alt="세종대학교 SEJONG UNIVERSITY"><span class="brand-label">집현캠퍼스 헬퍼</span><a class="brand-link" href="https://ecampus.sejong.ac.kr/login.php" target="_blank" rel="noopener">로그인</a></div>';
    brand.querySelector('img').src=logoUrl||'https://ecampus.sejong.ac.kr/theme/image.php/coursemosv2/theme/1791360952/layout/logo-en';
    shadow.prepend(brand);
    const theme=document.createElement('link');theme.rel='stylesheet';theme.href=chrome.runtime.getURL('dashboard.css');shadow.append(theme);
    shadow.querySelector('style').remove();
    shadow.querySelector('header .eyebrow').remove();
    shadow.querySelector('header .sub').remove();
    shadow.querySelector('aside>.eyebrow').remove();
    shadow.querySelector('.foot').remove();
    shadow.querySelector('.queue>b').textContent='재생목록';
    const $=id=>shadow.getElementById(id);
    const icons={play:'<path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none"/>',pause:'<path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor" stroke="none"/>',stop:'<rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none"/>',expand:'<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',shrink:'<path d="M4 9h5V4m6 0v5h5M9 20v-5H4m16 0h-5v5"/>',grip:'<circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>'};
    function iconButton(button,icon,label) {if(button.dataset.icon===icon&&button.getAttribute('aria-label')===label)return;button.dataset.icon=icon;button.classList.add('icon-button');button.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[icon]}</svg>`;button.setAttribute('aria-label',label);button.title=label;}
    const pauseIcon=paused=>iconButton($('pause'),paused?'play':'pause',paused?'재생':'일시정지');
    pauseIcon(false);iconButton($('stop'),'stop','중지');iconButton($('expand'),'expand','크게 보기');
    shadow.querySelector('.controls').append(shadow.querySelector('.audio'));
    const muteGuard=document.createElement('label');muteGuard.className='mute-guard';
    const muteGuardCheck=document.createElement('input');muteGuardCheck.type='checkbox';muteGuardCheck.checked=prefs.preventMutedPause!==false;
    muteGuard.append(muteGuardCheck,document.createTextNode('음소거 멈춤 방지'));
    const playbackOptions=document.createElement('div');playbackOptions.className='playback-options';
    const minimumLabel=document.createElement('label');minimumLabel.className='mute-guard';minimumLabel.title='학교 출석부의 요구시간과 출석·완료 반영을 확인하면 다음 강의로 넘어갑니다.';
    const minimumCheck=document.createElement('input');minimumCheck.type='checkbox';minimumCheck.checked=prefs.minimumOnly!==false;
    minimumLabel.append(minimumCheck,document.createTextNode('최소 진도율까지만 듣기'));playbackOptions.append(muteGuard,minimumLabel);shadow.querySelector('.controls').after(playbackOptions);
    muteGuardCheck.onchange=()=>{prefs.preventMutedPause=muteGuardCheck.checked;storage.set(prefs);};
    minimumCheck.onchange=()=>{prefs.minimumOnly=minimumCheck.checked;if(minimumProbe)minimumProbe.nextAt=0;storage.set(prefs);};
    const sectionTabs=document.createElement('div');sectionTabs.className='section-tabs';sectionTabs.setAttribute('role','tablist');sectionTabs.setAttribute('aria-label','통합 목록');
    for(const [id,label] of [['videos','온라인강의'],['activities','미완료 활동'],['notices','공지'],['resources','자료실']]) {
      const button=document.createElement('button');button.textContent=label;button.dataset.section=id;button.setAttribute('role','tab');button.onclick=()=>{section=id;render();if(feeds[id]&&!feeds[id].loaded&&!feeds[id].busy)loadFeed(id);};sectionTabs.append(button);
    }
    shadow.querySelector('.stats').after(sectionTabs);
    const videoTools=shadow.querySelectorAll('main>.toolbar')[1];
    const activitySort=document.createElement('select');activitySort.id='activitySort';activitySort.setAttribute('aria-label','활동 정렬');
    for(const [value,label] of [['week','주차순'],['weekDesc','최근 주차순'],['deadline','마감일순'],['start','시작일순'],['course','과목순'],['type','종류순'],['title','제목순']])activitySort.append(new Option(label,value));
    activitySort.value=prefs.activitySort||'week';if(!activitySort.value)activitySort.value='week';activitySort.onchange=()=>{prefs.activitySort=activitySort.value;storage.set(prefs);render();};
    $('sort').after(activitySort);
    const more=document.createElement('button');more.id='more';more.className='load-more';more.textContent='더 불러오기';$('list').after(more);
    more.onclick=()=>loadMore(section);
    const matches=i=>{const query=$('search').value.trim().toLowerCase();return (!$('course').value||i.courseId===$('course').value)&&(!query||`${i.course} ${i.title}`.toLowerCase().includes(query));};
    const aside=shadow.querySelector('aside');
    const panelGrip=document.createElement('div');panelGrip.className='panel-grip';panelGrip.setAttribute('role','separator');panelGrip.setAttribute('aria-label','패널 너비 조절');panelGrip.setAttribute('aria-orientation','vertical');panelGrip.tabIndex=0;aside.prepend(panelGrip);
    const videoGrip=document.createElement('div');videoGrip.className='video-grip';videoGrip.setAttribute('role','separator');videoGrip.setAttribute('aria-label','영상 높이 조절');videoGrip.setAttribute('aria-orientation','horizontal');videoGrip.tabIndex=0;$('player').after(videoGrip);
    const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
    const panelWidth=()=>clamp(Number(prefs.panelWidth)||480,280,900);
    const playerHeight=()=>clamp(Number(prefs.playerHeight)||$('player').getBoundingClientRect().height,150,Math.max(150,window.innerHeight-210));
    const size=()=>{
      host.style.setProperty('--panel-width',panelWidth()+'px');
      host.style.setProperty('--mobile-panel-width',(Number(prefs.panelWidth)>0?panelWidth():360)+'px');
      host.style.setProperty('--player-height',Number(prefs.playerHeight)>0?playerHeight()+'px':'auto');
      $('player').classList.toggle('custom-height',Number(prefs.playerHeight)>0);
      panelGrip.setAttribute('aria-valuemin','280');panelGrip.setAttribute('aria-valuemax','900');panelGrip.setAttribute('aria-valuenow',String(panelWidth()));
      videoGrip.setAttribute('aria-valuemin','150');videoGrip.setAttribute('aria-valuemax',String(Math.max(150,window.innerHeight-210)));videoGrip.setAttribute('aria-valuenow',String(Math.round(playerHeight())));
    };
    function resizeGrip(grip,key,value,move) {
      grip.onpointerdown=e=>{
        if(e.button!==0||$('player').classList.contains('large'))return;
        e.preventDefault();const start=value(),x=e.clientX,y=e.clientY;host.classList.add('resizing');grip.setPointerCapture(e.pointerId);
        grip.onpointermove=event=>{prefs[key]=move(start,event.clientX-x,event.clientY-y);size();};
        const end=()=>{grip.onpointermove=null;host.classList.remove('resizing');storage.set(prefs);};
        grip.onpointerup=end;grip.onpointercancel=end;
      };
      grip.onkeydown=e=>{
        const delta=key==='panelWidth'?({'ArrowLeft':24,'ArrowRight':-24}[e.key]):({'ArrowUp':-24,'ArrowDown':24}[e.key]);
        if(e.key==='Home'){e.preventDefault();delete prefs[key];size();storage.set(prefs);}
        else if(delta!==undefined){e.preventDefault();prefs[key]=move(value(),key==='panelWidth'?-delta:0,key==='playerHeight'?delta:0);size();storage.set(prefs);}
      };
      grip.ondblclick=()=>{delete prefs[key];size();storage.set(prefs);};
    }
    resizeGrip(panelGrip,'panelWidth',()=>aside.getBoundingClientRect().width,(start,dx)=>clamp(start-dx,280,Math.min(900,window.innerWidth-24)));
    resizeGrip(videoGrip,'playerHeight',playerHeight,(start,dx,dy)=>clamp(start+dy,150,Math.max(150,window.innerHeight-210)));
    panelGrip.title='드래그로 너비 조절 · 두 번 클릭으로 초기화';videoGrip.title='드래그로 높이 조절 · 두 번 클릭으로 초기화';
    window.addEventListener('resize',size);theme.addEventListener('load',size,{once:true});size();
    $('now').textContent='재생 대기';$('nowCourse').textContent='';$('placeholder').textContent='';
    let frame=null,token='';
    let playbackAttention=false,popupActive=false,playerStatus='대기 중';
    const attention=()=>{host.classList.toggle('attention',playbackAttention||popupActive);$('status').textContent=popupActive?'확인 창이 열려 있습니다.':playerStatus;$('status').hidden=!popupActive&&['대기 중','재생 중','일시정지','재생 완료'].includes(playerStatus);};
    const status=(s,needsAttention=false)=>{playerStatus=s;playbackAttention=needsAttention;attention();};
    attention();
    const message=s=>$('message').textContent=s;
    const time=n=>{n=Math.floor(n||0);return `${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toString().padStart(2,'0')}`;};
    const playable=i=>['미완료','기간 미표시'].includes(M.eligibility(i));
    $('filter').append(new Option('기간 없는 미완료','undated'));
    function visible() {const query=$('search').value.trim().toLowerCase();return M.sorted(items,prefs.sort).filter(i=>(!$('course').value||i.courseId===$('course').value)&&(!query||`${i.course} ${i.title}`.toLowerCase().includes(query))&&($('filter').value==='all'||$('filter').value==='done'&&i.completed===true||$('filter').value==='expired'&&M.eligibility(i)==='기간 지남'||$('filter').value==='undated'&&M.eligibility(i)==='기간 미표시'||$('filter').value==='pending'&&M.eligibility(i)==='미완료'));}
    function render() {
      if(draggedId)clearDrop();
      sectionTabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.section===section)));
      sectionTabs.classList.toggle('older-notices',section==='notices'&&feeds.notices.older);
      $('search').placeholder=section==='videos'?'과목 또는 강의 검색':'과목 또는 제목 검색';
      videoTools.hidden=section!=='videos';$('filter').hidden=section!=='videos';$('sort').hidden=section!=='videos';
      activitySort.hidden=section!=='activities';
      $('courseCount').textContent=courses.length;
      $('pendingCount').textContent=items.filter(i=>M.eligibility(i)==='미완료').length;
      $('selectedCount').textContent=selected.size;
      $('start').disabled=!selected.size||!!current;
      $('list').replaceChildren();
      for(const i of section==='videos'?visible():[]) {
        const row=document.createElement('div');row.className='row'+(current?.id===i.id?' active':'');
        const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selected.has(i.id);checkbox.disabled=!playable(i)||current?.id===i.id;checkbox.setAttribute('aria-label',`${i.title} 선택`);
        checkbox.onchange=()=>{if(checkbox.checked){selected.add(i.id);if(current&&current.id!==i.id&&!queue.some(x=>x.id===i.id))queue.push(i);}else{selected.delete(i.id);queue=queue.filter(x=>x.id!==i.id);}render();};
        const details=document.createElement('div');
        for(const [cls,text] of [['course',i.course],['title',i.title],['meta'+(i.period?' period':''),i.period||'기간 미표시']]) {const el=document.createElement('div');el.className=cls;el.textContent=text;details.append(el);}
        const actions=document.createElement('div');actions.className='row-actions';const badge=document.createElement('span');badge.textContent=M.eligibility(i);badge.className='badge'+(badge.textContent==='미완료'?' pending':'');actions.append(badge);
        const kind=document.createElement('div');kind.className='kind'+(i.kind==='비교과'?' extra':'');const label=document.createElement('strong');label.textContent=i.week?i.week+'주차':'강의';kind.title=i.kind;kind.append(label);
        if(current&&current.id!==i.id&&playable(i)) {const next=document.createElement('button');next.textContent='다음 재생';next.onclick=()=>{queue=queue.filter(x=>x.id!==i.id);queue.unshift(i);selected.add(i.id);render();};actions.append(next);}
        row.append(checkbox,kind,details,actions);$('list').append(row);
      }
      more.hidden=true;
      if(section!=='videos')renderCollection();
      if(!$('list').children.length) {$('list').innerHTML='<div class="empty">'+(section==='videos'?'현재 조건에 해당하는 영상이 없습니다.':section==='activities'?'미완료 활동이 없습니다.':feeds[section].busy?'불러오는 중…':feeds[section].error|| (section==='notices'&&!feeds.notices.older?'최근 7일 공지가 없습니다.':'등록된 항목이 없습니다.'))+'</div>';}
      $('queue').replaceChildren();
      const playlist=current?queue:M.sorted(items,prefs.sort).filter(i=>selected.has(i.id)&&playable(i));
      for(const [index,i] of playlist.entries()) {
        const row=document.createElement('div');row.className='queue-row';row.dataset.id=i.id;row.draggable=true;
        row.ondragstart=e=>{draggedId=i.id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',i.id);row.classList.add('queue-dragging');};
        row.ondragover=e=>{if(!draggedId)return;e.preventDefault();e.dataTransfer.dropEffect='move';markDrop(row,e.clientY);};
        row.ondrop=e=>{if(!draggedId)return;e.preventDefault();const source=draggedId;const after=e.clientY>row.getBoundingClientRect().top+row.getBoundingClientRect().height/2;clearDrop();reorder(source,i.id,after);};
        row.ondragend=clearDrop;
        const grip=document.createElement('button');iconButton(grip,'grip',`재생목록 ${i.title} 순서 변경`);grip.classList.add('queue-grip');grip.title='드래그로 순서 변경 · 키보드 ↑↓';
        grip.onpointerdown=e=>startQueueDrag(e,grip,row,i);
        grip.onkeydown=e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const target=playlist[index+(e.key==='ArrowUp'?-1:1)];if(target)reorder(i.id,target.id,e.key==='ArrowDown');};
        const info=document.createElement('div');info.className='queue-info';const title=document.createElement('strong');title.textContent=`${index+1}. ${i.title}`;const course=document.createElement('span');course.textContent=i.course;info.append(title,course);
        const actions=document.createElement('div');actions.className='queue-actions';
        const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label',`재생목록 ${i.title} 제거`);remove.onclick=()=>{queue=queue.filter(x=>x.id!==i.id);selected.delete(i.id);render();};actions.append(remove);row.append(grip,info,actions);$('queue').append(row);
      }
      if(!playlist.length)$('queue').textContent='비어 있음';
    }
    let draggedId=null,dragTarget=null,dragAfter=false,dragPreview=null;
    function clearDrop() {
      $('queue').querySelectorAll('.queue-row').forEach(row=>row.classList.remove('drop-before','drop-after','queue-dragging'));
      dragPreview?.remove();dragPreview=null;draggedId=null;dragTarget=null;host.classList.remove('queue-dragging');
    }
    function markDrop(row,y) {
      $('queue').querySelectorAll('.queue-row').forEach(el=>el.classList.remove('drop-before','drop-after'));
      dragAfter=y>row.getBoundingClientRect().top+row.getBoundingClientRect().height/2;
      dragTarget=row.dataset.id;row.classList.add(dragAfter?'drop-after':'drop-before');
    }
    function reorder(sourceId,targetId,after=false) {
      const playlist=current?queue:M.sorted(items,prefs.sort).filter(i=>selected.has(i.id)&&playable(i));
      const reordered=M.movedOrder(playlist,sourceId,targetId,after);
      if(current)queue=reordered;
      else {
        let index=0;const all=M.sorted(items,prefs.sort).map(i=>selected.has(i.id)&&playable(i)?reordered[index++]:i);
        all.forEach((i,n)=>i.rank=n);prefs.sort='manual';prefs.order=all.map(i=>i.id);$('sort').value='manual';storage.set(prefs);
      }
      render();
      $('queue').querySelector(`.queue-row[data-id="${sourceId}"] .queue-grip`)?.focus();
    }
    function startQueueDrag(e,grip,row,item) {
      if(e.button!==0)return;e.preventDefault();grip.setPointerCapture(e.pointerId);
      draggedId=item.id;row.classList.add('queue-dragging');host.classList.add('queue-dragging');
      dragPreview=document.createElement('div');dragPreview.className='queue-drag-preview';dragPreview.textContent=item.title;shadow.append(dragPreview);
      const move=event=>{
        dragPreview.style.left=Math.min(window.innerWidth-200,event.clientX+14)+'px';dragPreview.style.top=event.clientY+12+'px';
        const box=$('queue').getBoundingClientRect();if(event.clientY<box.top+24)$('queue').scrollTop-=12;else if(event.clientY>box.bottom-24)$('queue').scrollTop+=12;
        if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom){dragTarget=null;$('queue').querySelectorAll('.queue-row').forEach(el=>el.classList.remove('drop-before','drop-after'));return;}
        const rows=[...$('queue').querySelectorAll('.queue-row')];const target=rows.find(el=>{const r=el.getBoundingClientRect();return event.clientY>=r.top&&event.clientY<=r.bottom;});
        if(target)markDrop(target,event.clientY);
      };
      move(e);grip.onpointermove=move;
      const end=event=>{const source=draggedId,target=dragTarget,after=dragAfter;grip.onpointermove=null;grip.onpointerup=null;grip.onpointercancel=null;clearDrop();if(event.type==='pointerup'&&target&&source!==target)reorder(source,target,after);};
      grip.onpointerup=end;grip.onpointercancel=end;
    }
    function renderCollection() {
      const feed=feeds[section];
      let rows=section==='activities'?activities.filter(i=>i.completed===false):section==='resources'?[...activities.filter(i=>i.file),...feed.entries]:feed.entries.filter(i=>feed.older||i.stamp>=Date.now()-7*86400000);
      rows=section==='activities'?M.sortedActivities(rows,activitySort.value):M.newest(rows);
      const filtered=rows.filter(matches);
      for(const i of filtered.slice(0,feed?.limit||filtered.length)) {
        const row=document.createElement('div');row.className='collection-row';
        const kind=document.createElement('span');kind.className='activity-type'+(i.type==='과제'?' assignment':'');kind.textContent=i.type;
        const details=document.createElement('div');details.className='collection-info';
        const course=document.createElement('div');course.className='course';course.textContent=i.course;
        const link=document.createElement('a');link.className='title';link.href=i.url;link.target='_blank';link.rel='noopener';link.textContent=i.title;
        const meta=document.createElement('div');meta.className='meta'+(i.period?' period':'');meta.textContent=section==='activities'?[i.week?i.week+'주차':'',i.period||(['deadline','start'].includes(activitySort.value)?'기간 미표시':'')].filter(Boolean).join(' · '):i.period||[i.date,i.author].filter(Boolean).join(' · ');
        details.append(course,link,meta);row.append(kind,details);$('list').append(row);
      }
      if(feed) {
        const hiddenOlder=section==='notices'&&!feed.older&&feed.entries.some(i=>!i.stamp||i.stamp<Date.now()-7*86400000);
        const hasMore=hiddenOlder||filtered.length>feed.limit||feed.sources.some(s=>s.next||!s.loaded);
        more.hidden=!hasMore&&!feed.error;more.disabled=feed.busy;more.textContent=feed.busy?'불러오는 중…':feed.error?'다시 불러오기':'더 불러오기';
      }
    }
    async function loadFeed(kind,additional=false) {
      const feed=feeds[kind];if(!feed||feed.busy||scanBusy)return;
      feed.busy=true;feed.error='';const version=scanVersion;render();
      try {
        for(const source of feed.sources) {
          let url=source.loaded?(additional?source.next:null):source.url;
          const visited=new Set();
          while(url&&!visited.has(url)) {
            visited.add(url);
            try {
              const parsed=M.board(await read(url),source,url);
              if(version!==scanVersion)return;
              for(const entry of parsed.entries)if(!feed.entries.some(i=>i.id===entry.id))feed.entries.push(entry);
              source.loaded=true;source.next=parsed.next;
              // Fetch all pages still within the last seven days before hiding older posts.
              url=kind==='notices'&&!additional&&parsed.next&&parsed.entries.length&&parsed.entries.every(i=>i.stamp>=Date.now()-7*86400000)?parsed.next:null;
            }catch(e){feed.error=`일부 게시판을 불러오지 못했습니다. ${e.message}`;break;}
          }
        }
        feed.loaded=true;
      }finally{feed.busy=false;if(version===scanVersion)render();}
    }
    async function loadMore(kind) {
      const feed=feeds[kind];if(!feed||feed.busy)return;
      if(kind==='notices')feed.older=true;
      feed.limit+=20;
      await loadFeed(kind,true);
    }
    async function read(url) {
      const u=new URL(url,location.origin);if(u.origin!==location.origin)throw Error('지원하지 않는 주소입니다.');
      const response=await fetch(u.href,{credentials:'same-origin',cache:'no-store'});
      if(!response.ok)throw Error(`페이지를 불러오지 못했습니다 (${response.status}).`);
      if(new URL(response.url).pathname.includes('/login'))throw Error('로그인이 만료됐습니다. 학교 사이트에서 다시 로그인해주세요.');
      const doc=new DOMParser().parseFromString(await response.text(),'text/html');
      if(doc.querySelector('input[type=password]'))throw Error('로그인이 필요합니다.');
      return doc;
    }
    async function scan() {
      if(scanBusy||current)return;scanBusy=true;$('refresh').disabled=true;
      try {
        const home=await read('/dashboard.php');courses=M.courses(home,location.origin);if(!courses.length)throw Error('나의 강의실에서 현재 강좌를 찾지 못했습니다.');
        const found=[],other=[],errors=[];scanVersion++;
        for(const [n,c] of courses.entries()) {message(`강좌 확인 중 ${n+1}/${courses.length} · ${c.title}`);try{const doc=await read(c.url);found.push(...M.lectures(doc,c,location.origin));other.push(...M.activities(doc,c,location.origin));}catch(e){errors.push(`${c.title}: ${e.message}`);}}
        activities=other;
        for(const [kind,feed] of Object.entries(feeds)){feed.entries=[];feed.sources=activities.filter(i=>i.group===kind).map(i=>({...i,loaded:false,next:null}));feed.loaded=false;feed.older=false;feed.limit=20;feed.error='';}
        items=found.map((i,n)=>({...i,rank:prefs.order?.indexOf(i.id)>=0?prefs.order.indexOf(i.id):10000+n}));selected=new Set(items.filter(i=>M.eligibility(i)==='미완료').map(i=>i.id));
        $('course').replaceChildren(new Option('전체 과목',''));courses.forEach(c=>$('course').append(new Option(c.title,c.id)));
        message(errors.length?`일부 강좌를 불러오지 못했습니다. ${errors.join(' / ')}`:`강좌 ${courses.length}개 · 동영상 ${items.length}개`);render();
      }catch(e){message(e.message);}finally{scanBusy=false;$('refresh').disabled=false;}
      if(feeds[section])loadFeed(section);
    }
    const send=type=>frame?.contentWindow?.postMessage({jh:true,token,type},location.origin);
    let minimumProbe=null;
    const probeCurrent=(probe,active,activeRun)=>minimumProbe===probe&&current?.id===active.id&&run===activeRun&&!finishing&&prefs.minimumOnly!==false&&!popupActive;
    async function checkMinimum() {
      const probe=minimumProbe,active=current,activeRun=run;
      if(!probe||!active||probe.busy||Date.now()<probe.nextAt||!playing||!probeCurrent(probe,active,activeRun))return;
      probe.busy=true;
      try {
        const record=M.attendance(await read(`/report/ubcompletion/progress.php?id=${active.courseId}`),active.title);
        if(!probeCurrent(probe,active,activeRun))return;
        // The clock only schedules reads. School records decide whether to advance.
        if(!record||!Number.isFinite(record.requiredSeconds)||record.requiredSeconds<=0||!Number.isFinite(record.learnedSeconds)){probe.nextAt=Infinity;return;}
        probe.nextAt=Date.now()+Math.max(15,record.requiredSeconds-record.learnedSeconds+5)*1000;
        if(!M.minimumConfirmed(record)){probe.failures=0;return;}
        probe.nextAt=Date.now()+60000;
        const c=courses.find(c=>c.id===active.courseId);
        const refreshed=M.lectures(await read(c.url),c,location.origin).find(i=>i.id===active.id);
        if(!probeCurrent(probe,active,activeRun)||!playing||!refreshed?.completed)return;
        probe.failures=0;
        finish();
      }catch{if(probeCurrent(probe,active,activeRun))probe.nextAt=++probe.failures>=3?Infinity:Date.now()+60000;}
      finally{probe.busy=false;}
    }
    function playNext() {
      popupActive=false;
      current=queue.shift()||null;finishing=false;minimumProbe=current?{busy:false,nextAt:0,failures:0}:null;
      if(!current){playing=false;status('재생 완료');$('pause').disabled=true;$('stop').disabled=true;$('refresh').disabled=false;render();return;}
      $('player').style.removeProperty('--video-padding');
      token=crypto.randomUUID();frame=document.createElement('iframe');frame.title='학교 강의 미니플레이어';frame.allow='autoplay; fullscreen';frame.src=current.viewer+'#jh-player='+token;
      $('player').replaceChildren(frame);$('now').textContent=current.title;$('nowCourse').textContent=current.course;$('pause').disabled=false;$('stop').disabled=false;pauseIcon(false);$('refresh').disabled=true;playing=true;status('학교 플레이어를 여는 중…');render();
      const expected=token;setTimeout(()=>{if(token===expected&&current&&playerStatus==='학교 플레이어를 여는 중…')status('플레이어를 불러오지 못했습니다. 로그인 또는 사이트의 삽입 제한을 확인해주세요.',true);},15000);
    }
    async function finish() {
      if(finishing||!current)return;finishing=true;const active=current;const activeRun=run;
      status('진도 저장 중');send('finalize');
      for(const delay of [2500,5000,10000,15000]) {
        await new Promise(r=>setTimeout(r,delay));if(run!==activeRun||current?.id!==active.id)return;
        try{
          const c=courses.find(c=>c.id===active.courseId);const refreshed=M.lectures(await read(c.url),c,location.origin).find(i=>i.id===active.id);
          if(run!==activeRun||current?.id!==active.id)return;
          if(!refreshed?.completed)continue;
          const doc=await read(`/report/ubcompletion/progress.php?id=${active.courseId}`);const record=M.attendance(doc,active.title);
          if(run!==activeRun||current?.id!==active.id)return;
          if(record&&!record.present)continue;
          const original=items.find(i=>i.id===active.id);original.completed=true;selected.delete(active.id);
          frame?.remove();frame=null;playNext();return;
        }catch(e){if(run!==activeRun||current?.id!==active.id)return;status(`진도 확인 실패: ${e.message}`,true);finishing=false;return;}
      }
      status('출석 또는 완료 반영을 확인하지 못해 멈췄습니다. 학교 출석부를 확인한 뒤 중지·새로고침해주세요.',true);playing=false;$('pause').disabled=true;finishing=false;
    }
    const receive=e=>{
      if(e.origin!==location.origin||e.source!==frame?.contentWindow||!e.data?.jh||e.data.token!==token||!current)return;
      if(e.data.type==='popup'){popupActive=e.data.visible===true;attention();}
      if(Number.isFinite(e.data.aspect)&&e.data.aspect>.2&&e.data.aspect<5){$('player').style.setProperty('--video-padding',(100/e.data.aspect)+'%');requestAnimationFrame(size);}
      if(e.data.type==='ready'){send('play');}
      if(e.data.type==='state'){
        const s=e.data;$('progress').max=s.duration||1;$('progress').value=s.current||0;$('time').textContent=`${time(s.current)} / ${time(s.duration)}`;
        if(!finishing){playing=!s.paused;pauseIcon(s.paused);status(s.error?'재생 오류':s.waiting?'버퍼링 중':s.paused?'일시정지':'재생 중',!!(s.error||s.waiting||s.paused));if(!s.paused&&!s.waiting&&!s.error)checkMinimum();}
      }
      if(e.data.type==='blocked'){run++;finishing=false;status(e.data.message,true);playing=false;pauseIcon(true);}
      if(e.data.type==='ended'&&Number.isFinite(e.data.duration)&&e.data.current>=e.data.duration-1)finish();
    };
    window.addEventListener('message',receive);
    $('search').oninput=render;$('filter').onchange=render;$('course').onchange=render;
    $('sort').value=prefs.sort||'deadline';$('sort').onchange=()=>{prefs.sort=$('sort').value;storage.set(prefs);render();};
    $('selectAll').onclick=()=>{visible().filter(playable).forEach(i=>{selected.add(i.id);if(current&&current.id!==i.id&&!queue.some(x=>x.id===i.id))queue.push(i);});render();};$('clear').onclick=()=>{selected=new Set(current?[current.id]:[]);queue=[];render();};
    $('start').onclick=()=>{if(current)return;queue=M.sorted(items,prefs.sort).filter(i=>selected.has(i.id)&&playable(i));if(!queue.length)return;run++;playNext();};
    $('pause').onclick=()=>send(playing?'pause':'play');
    $('stop').onclick=()=>{run++;send('pause');send('finalize');queue=[];current=null;finishing=false;playing=false;popupActive=false;$('pause').disabled=true;$('stop').disabled=true;$('refresh').disabled=false;status('재생을 중지했습니다. 전체 새로고침으로 저장 상태를 확인하세요.',true);render();};
    const shrink=document.createElement('button');iconButton(shrink,'shrink','작게 보기');shrink.style.cssText='position:fixed;right:11vw;top:9vh;z-index:11;background:white';shrink.hidden=true;shadow.append(shrink);
    const togglePlayer=large=>{$('player').classList.toggle('large',large);iconButton($('expand'),large?'shrink':'expand',large?'작게 보기':'크게 보기');shrink.hidden=!large;};
    $('expand').onclick=()=>togglePlayer(!$('player').classList.contains('large'));
    shrink.onclick=()=>togglePlayer(false);
    shadow.addEventListener('keydown',e=>{if(e.key==='Escape')togglePlayer(false);});
    $('volume').value=Math.round((prefs.volume||0)*100);$('volumeLabel').textContent=$('volume').value+'%';
    $('volume').oninput=()=>{prefs.volume=Number($('volume').value)/100;$('volumeLabel').textContent=$('volume').value+'%';storage.set(prefs);};
    $('refresh').onclick=scan;
    $('close').onclick=()=>{run++;send('pause');send('finalize');setTimeout(()=>{window.removeEventListener('message',receive);window.removeEventListener('resize',size);document.title=originalTitle;host.remove();chrome.runtime.sendMessage({type:'jh-audio-release-all'}).catch(()=>{});onClose();},500);};
    render();await scan();
  }
})();
