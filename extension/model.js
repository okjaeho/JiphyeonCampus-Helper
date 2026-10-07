(() => {
  const compact = s => String(s || '').replace(/\s+/g, ' ').trim();
  function idOf(href, base) {
    try { const u = new URL(href, base); return u.origin === new URL(base).origin && /^\d+$/.test(u.searchParams.get('id') || '') ? u.searchParams.get('id') : null; } catch { return null; }
  }
  function courses(doc, base) {
    const seen = new Set();
    return [...doc.querySelectorAll('a.course-link[href*="/course/view.php"], a[href*="/course/view.php"]')].flatMap(a => {
      const id = idOf(a.getAttribute('href'), base);
      if (!id || seen.has(id)) return [];
      seen.add(id);
      return [{id, title: compact(a.querySelector('h3')?.textContent || a.textContent).replace(/\s*NEW\s*$/, ''), kind:compact(a.querySelector('.badge-course')?.textContent)||'교과', level:compact(a.querySelector('.badge-under')?.textContent), url: new URL(a.getAttribute('href'), base).href}];
    });
  }
  function lectures(doc, course, base) {
    const seen = new Set();
    return [...doc.querySelectorAll('li.activity.vod a[href*="/mod/vod/view.php"]')].flatMap(a => {
      const id = idOf(a.getAttribute('href'), base);
      if (!id || seen.has(id)) return [];
      seen.add(id);
      const row = a.closest('li.activity');
      const name = compact(a.querySelector('.instancename')?.childNodes[0]?.textContent || a.textContent).replace(/\s+동영상$/, '');
      const completion = row.querySelector('.autocompletion img');
      const alt = completion?.getAttribute('alt') || '';
      const completed = alt.startsWith('완료하지 못함') ? false : alt.startsWith('완료함') ? true : null;
      const dates = compact(row.querySelector('.displayoptions')?.textContent).match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s*~\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
      const section = row.closest('li.section, li[id^="section-"]');
      const week = Number(section?.id?.match(/section-(\d+)/)?.[1] || name.match(/(\d+)주차/)?.[1] || 0);
      const popup = a.getAttribute('onclick')?.match(/window\.open\(['"]([^'"]+)/)?.[1];
      const viewer = popup ? new URL(popup, base) : new URL(`/mod/vod/viewer.php?id=${id}`, base);
      if (viewer.origin !== new URL(base).origin || viewer.pathname !== '/mod/vod/viewer.php' || viewer.searchParams.get('id') !== id) return [];
      return [{id, courseId:course.id, course:course.title, kind:course.kind||'교과', level:course.level||'', title:name, completed, week, period:dates?`${dates[1]} ~ ${dates[2]}`:'',
        start:dates ? Date.parse(dates[1].replace(' ', 'T') + '+09:00') : null,
        end:dates ? Date.parse(dates[2].replace(' ', 'T') + '+09:00') : null,
        viewer:viewer.href, order:seen.size - 1}];
    });
  }
  function eligibility(item, now = Date.now()) {
    if (item.completed === true) return '완료';
    if (item.completed === null) return '완료 여부 미확인';
    if (item.start && now < item.start) return '공개 예정';
    if (item.end && now > item.end) return '기간 지남';
    if (!item.start && !item.end) return '기간 미표시';
    return '미완료';
  }
  function activities(doc, course, base) {
    const seen=new Set();
    return [...doc.querySelectorAll('li.activity:not(.vod) .activityinstance a[href]')].flatMap(a=>{
      const id=idOf(a.getAttribute('href'),base);
      if(!id||seen.has(id))return [];seen.add(id);
      const url=new URL(a.getAttribute('href'),base);
      if(!/^\/mod\/[^/]+\/view\.php$/.test(url.pathname))return [];
      const row=a.closest('li.activity');
      const alt=row.querySelector('.autocompletion img,.manualcompletion img,img[alt^="완료하지 못함"],img[alt^="완료함"]')?.getAttribute('alt')||'';
      const completed=alt.startsWith('완료하지 못함')?false:alt.startsWith('완료함')?true:null;
      const icon=a.querySelector('img.activityicon');
      const type=compact(icon?.getAttribute('alt'))||'활동';
      const title=compact(a.querySelector('.instancename')?.childNodes[0]?.textContent||a.textContent);
      const week=Number(row.closest('li.section,li[id^="section-"]')?.id?.match(/section-(\d+)/)?.[1]||title.match(/(\d+)주차/)?.[1]||0);
      const board=url.pathname==='/mod/ubboard/view.php';
      const group=board&&(/공지/.test(title)||/ubboard_notice/.test(icon?.getAttribute('src')||''))?'notices':board&&/자료실|강의자료|수업자료/.test(title)?'resources':null;
      const period=compact(row.querySelector('.displayoptions')?.textContent);
      return [{id,courseId:course.id,course:course.title,title,type,completed,week,group,url:url.href,period,...activityDates(period),file:url.pathname==='/mod/ubfile/view.php'||url.pathname==='/mod/resource/view.php',order:seen.size-1}];
    });
  }
  function activityDates(period) {
    const dates=compact(period).match(/\d{4}[-/.]\d{2}[-/.]\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?/g)||[];
    const stamp=(date,end=false)=>{
      if(!date)return null;
      const normalized=date.replace(/[/.]/g,'-').replace(' ','T');
      const value=Date.parse(normalized+(normalized.length===10?(end?'T23:59:59':'T00:00:00'):normalized.length===16?':00':'')+'+09:00');
      return Number.isFinite(value)?value:null;
    };
    if(dates.length>=2)return {start:stamp(dates[0]),end:stamp(dates[1],true)};
    if(dates.length===1&&/마감|종료|제출기한/.test(period))return {start:null,end:stamp(dates[0],true)};
    if(dates.length===1&&/시작|공개/.test(period))return {start:stamp(dates[0]),end:null};
    return {start:null,end:null};
  }
  function sortedActivities(items,mode='week') {
    const collator=new Intl.Collator('ko',{numeric:true});
    const compareNumber=(a,b)=>a===b?0:a-b;
    const week=i=>i.week>0?i.week:Infinity;
    const byWeek=(a,b)=>compareNumber(week(a),week(b));
    const tie=(a,b)=>collator.compare(a.course,b.course)||byWeek(a,b)||(a.order||0)-(b.order||0)||collator.compare(a.title,b.title);
    const byTime=(a,b,key)=>compareNumber(Number.isFinite(a[key])?a[key]:Infinity,Number.isFinite(b[key])?b[key]:Infinity)||tie(a,b);
    const compare=mode==='deadline'?(a,b)=>byTime(a,b,'end'):mode==='start'?(a,b)=>byTime(a,b,'start'):mode==='weekDesc'?(a,b)=>(a.week>0&&b.week>0?b.week-a.week:byWeek(a,b))||tie(a,b):mode==='course'?tie:mode==='type'?(a,b)=>collator.compare(a.type,b.type)||tie(a,b):mode==='title'?(a,b)=>collator.compare(a.title,b.title)||tie(a,b):(a,b)=>byWeek(a,b)||tie(a,b);
    return [...items].sort(compare);
  }
  function board(doc, source, base) {
    const seen=new Set(),entries=[];
    for(const a of doc.querySelectorAll('table a[href*="/mod/ubboard/article.php"]')) {
      let u;try{u=new URL(a.getAttribute('href'),base);}catch{continue;}
      const bwid=u.searchParams.get('bwid');
      if(idOf(u.href,base)!==source.id||!/^\d+$/.test(bwid||'')||seen.has(bwid))continue;
      const row=a.closest('tr');if(!row)continue;
      const cells=[...row.cells];
      const date=cells.map(c=>compact(c.textContent)).find(text=>/^\d{4}[-.]\d{2}[-.]\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?$/.test(text));
      const stamp=date?Date.parse(date.replace(/\./g,'-').replace(' ','T')+(date.length===10?'T00:00:00':date.length===16?':00':'')+'+09:00'):null;
      const head=[...row.closest('table').querySelectorAll('tr:first-child th')].map(c=>compact(c.textContent));
      const authorIndex=head.findIndex(text=>/작성자/.test(text));
      seen.add(bwid);entries.push({id:source.id+':'+bwid,courseId:source.courseId,course:source.course,title:compact(a.textContent),url:u.href,date:date||'',stamp:Number.isFinite(stamp)?stamp:null,author:authorIndex>=0?compact(cells[authorIndex]?.textContent):'',type:source.group==='notices'?'공지':'자료',boardId:source.id});
    }
    const current=new URL(base).searchParams.get('page')||'1';
    const pages=[];
    for(const a of doc.querySelectorAll('a[href]')) {
      let u;try{u=new URL(a.getAttribute('href'),base);}catch{continue;}
      const page=Number(u.searchParams.get('page'));
      if(u.pathname==='/mod/ubboard/view.php'&&idOf(u.href,base)===source.id&&page>Number(current))pages.push({page,url:u.href});
    }
    pages.sort((a,b)=>a.page-b.page);
    return {entries,next:pages[0]?.url||null};
  }
  function newest(items) {return [...items].sort((a,b)=>(b.stamp||0)-(a.stamp||0)||b.id.localeCompare(a.id,undefined,{numeric:true}));}
  function movedOrder(items,sourceId,targetId,after=false) {
    const source=items.find(i=>i.id===sourceId);
    if(!source||sourceId===targetId||!items.some(i=>i.id===targetId))return [...items];
    const result=items.filter(i=>i.id!==sourceId);
    result.splice(result.findIndex(i=>i.id===targetId)+(after?1:0),0,source);
    return result;
  }
  function sorted(items, mode) {
    const collator = new Intl.Collator('ko', {numeric:true});
    const course = (a,b) => collator.compare(a.course,b.course) || a.week-b.week || a.order-b.order;
    return [...items].sort(mode === 'course' ? course : mode === 'week' ? (a,b)=>a.week-b.week || course(a,b) : mode === 'manual' ? (a,b)=>a.rank-b.rank : (a,b)=>(a.end || Infinity)-(b.end || Infinity) || course(a,b));
  }
  function attendance(doc, title) {
    const rows = [...doc.querySelectorAll('table.user_progress_table tr')];
    const row = rows.find(r => [...r.cells].some(c => compact(c.textContent) === compact(title)));
    if (!row) return null;
    const cells = [...row.cells];
    const index = cells.findIndex(c => compact(c.textContent) === compact(title));
    return {required:compact(cells[index+1]?.textContent), learned:compact(cells[index+2]?.childNodes[0]?.textContent), present:compact(cells[index+3]?.textContent) === 'O'};
  }
  const api = {compact,idOf,courses,lectures,activities,activityDates,sortedActivities,board,newest,movedOrder,eligibility,sorted,attendance};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.JHModel = api;
})();
