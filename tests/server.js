const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const done=new Set(['103']);
const closes=[];
let deny=false;
const titles={'101':'[사전] 6주차_1부','102':'[사전] 6주차_2부','103':'[사전] 3주차_완료','104':'[사전] 1주차_기간지남','201':'6주차 인공지능 소개','202':'7주차 공개예정','203':'완료표시 없는 영상'};
const names={'1':'데모 · 데이터로읽는세상','2':'데모 · 인공지능과빅데이터'};
const scripts='<script src="/tests/shim.js"></script><script src="/extension/model.js"></script><script src="/extension/content.js"></script>';
function activity(id,module,title,type,completed=null,period=''){return `<li class="activity ${module}" id="module-${id}"><div class="activityinstance"><a href="/mod/${module}/view.php?id=${id}"><img class="activityicon" alt="${type}"><span class="instancename">${title}<span class="accesshide"> ${type}</span></span></a></div>${period?`<span class="displayoptions">${period}</span>`:''}${completed===null?'':`<span class="autocompletion"><img alt="${completed?'완료함':'완료하지 못함'}: ${title}"></span>`}</li>`;}
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
const dateBefore=days=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(Date.now()-days*86400000));
function boardRow(board,id,title,date){return `<tr><td>${id}</td><td><a href="/mod/ubboard/article.php?id=${board}&bwid=${id}">${title}</a></td><td>담당 교수</td><td>${date}</td><td>3</td></tr>`;}
function row(id){const completed=done.has(id);const dates=id==='104'?'2020-01-01 00:00:00 ~ 2020-01-02 23:59:59':id==='202'?'2099-01-01 00:00:00 ~ 2099-01-02 23:59:59':'2026-10-06 00:00:00 ~ 2026-10-19 23:59:59';return `<li class="activity vod" id="module-${id}"><div class="activityinstance"><a href="/mod/vod/view.php?id=${id}" onclick="window.open('/mod/vod/viewer.php?id=${id}');return false;"><span class="instancename">${titles[id]}<span class="accesshide"> 동영상</span></span></a><span class="displayoptions">${dates}</span></div>${id==='203'?'':`<span class="autocompletion"><img alt="${completed?'완료함':'완료하지 못함'}: ${titles[id]}"></span>`}</li>`;}
http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');const id=u.searchParams.get('id');
  function html(body){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="ko"><meta charset="utf-8"><title>집현 강의 모아보기 · 테스트</title>'+body+'</html>');}
  if(u.pathname==='/'||u.pathname==='/dashboard.php')return html(`<body><h1>테스트 강의실</h1><p>실제 출석과 무관한 데모입니다.</p><a href="/fixture/reset">데모 기록 초기화</a><a href="/fixture/deny">진도 저장 실패 테스트</a>${Object.entries(names).map(([id,n])=>`<a class="course-link" href="/course/view.php?id=${id}"><h3>${n}</h3></a>`).join('')}${scripts}</body>`);
  if(u.pathname==='/course/view.php')return html(`<body><h2>${names[id]}</h2><ul><li id="section-6">${(id==='1'?['101','102','103','104','101']:['201','202','203']).map(row).join('')}${activity(id==='1'?'301':'401','assign','6주차 실습 과제','과제',false,id==='1'?'2026-10-06 00:00:00 ~ 2026-10-19 23:59:59':'2026-10-01 00:00:00 ~ 2026-10-12 23:59:59')}${activity(id==='1'?'302':'402','ubfile','6주차 강의자료','파일',false,'2026-10-03 00:00:00 ~ 2026-10-09 23:59:59')}${activity(id==='1'?'303':'403','ubfile','완료된 읽기 자료','파일',true)}${activity(id==='1'?'501':'601','ubboard','과목공지','게시판')}${activity(id==='1'?'502':'602','ubboard','자료실','게시판')}</li></ul></body>`);
  if(u.pathname==='/mod/ubboard/view.php') {
    const notice=id==='501'||id==='601',page=Number(u.searchParams.get('page')||1);
    const rows=notice?page===1?[boardRow(id,'10','이번 주 수업 안내',today),boardRow(id,'9','과제 제출 일정',dateBefore(3)),boardRow(id,'8','지난 공지',dateBefore(10))]:[boardRow(id,'7','이전 공지 추가 로드',dateBefore(20))]:[boardRow(id,'11','실습 예제 파일',dateBefore(1))];
    return html(`<body><table class="ubboard_table"><tr><th>번호</th><th>제목</th><th>작성자</th><th>작성일</th><th>조회수</th></tr>${rows.join('')}</table>${notice&&page===1?`<nav class="pagination"><a href="/mod/ubboard/view.php?id=${id}&page=2">2</a></nav>`:''}</body>`);
  }
  if(['/mod/assign/view.php','/mod/ubfile/view.php','/mod/ubboard/article.php'].includes(u.pathname))return html('<body><h1>데모 항목 원문</h1><a href="/dashboard.php#jh-open">헬퍼로 돌아가기</a></body>');
  if(u.pathname==='/report/ubcompletion/progress.php')return html(`<body><table class="user_progress_table">${(id==='1'?['101','102','103','104']:['201','202','203']).map(i=>`<tr><td>${titles[i]}</td><td>00:02</td><td>00:03</td><td>${done.has(i)?'O':'X'}</td></tr>`).join('')}</table></body>`);
  if(u.pathname==='/mod/vod/viewer.php')return html(`<head><style>body{margin:0;background:#111;color:white;font:14px system-ui}header{padding:0 8px;background:#87223e;display:flex;justify-content:space-between;align-items:center}video{width:100%;height:100%;display:block}p{margin:0}</style></head><body><div id="viewer"><header id="vod_header">${titles[id]}<button onclick="document.getElementById('fixture-dialog').showModal()">확인 창 테스트</button><button class="vod_close_button">종료</button></header><div id="vod_viewer"><div id="my-video"><video id="my-video_html5_api" controls playsinline src="/tests/sample.mp4"></video></div></div><p id="vod_footer">데모 영상 · 실제 출석에 반영되지 않습니다.</p></div><dialog id="fixture-dialog" aria-label="테스트 확인 창"><p>확인 창 테스트</p><button onclick="this.closest('dialog').close()">확인 창 닫기</button></dialog>${scripts}<script>document.querySelector('.vod_close_button').onclick=async()=>{await fetch('/fixture/complete?id=${id}');document.body.dataset.closed='true';};setInterval(()=>{const v=document.querySelector('video');v.muted=false;v.volume=.8;setTimeout(()=>document.body.dataset.audio=JSON.stringify({muted:v.muted,volume:v.volume,paused:v.paused}),50);},1000);</script></body>`);
  if(u.pathname==='/fixture/complete'){if(!deny)done.add(id);closes.push(id);return res.end('ok');}
  if(u.pathname==='/fixture/reset'||u.pathname==='/fixture/deny'){done.clear();done.add('103');closes.length=0;deny=u.pathname.endsWith('/deny');res.statusCode=302;res.setHeader('Location','/dashboard.php#jh-open');return res.end();}
  if(u.pathname==='/fixture/status'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({done:[...done],closes}));}
  const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
  if(!fs.existsSync(file)){res.statusCode=404;return res.end();}
  const types={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.mp4':'video/mp4','.html':'text/html; charset=utf-8'};res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');fs.createReadStream(file).pipe(res);
}).listen(8789,'127.0.0.1',()=>console.log('Test fixture: http://127.0.0.1:8789/dashboard.php#jh-open'));
