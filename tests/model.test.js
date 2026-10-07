const assert=require('node:assert/strict');
const M=require('../extension/model.js');
const now=Date.parse('2026-10-07T12:00:00+09:00');
assert.equal(M.eligibility({completed:false,start:now-100,end:now+100},now),'미완료');
assert.equal(M.eligibility({completed:false,end:now-1},now),'기간 지남');
assert.equal(M.eligibility({completed:false,start:now+1},now),'공개 예정');
assert.equal(M.eligibility({completed:null},now),'완료 여부 미확인');
assert.equal(M.eligibility({completed:false},now),'기간 미표시');
assert.equal(M.eligibility({completed:true},now),'완료');
assert.equal(M.idOf('/course/view.php?id=12','https://ecampus.sejong.ac.kr'),'12');
assert.equal(M.idOf('https://evil.test/course/view.php?id=12','https://ecampus.sejong.ac.kr'),null);
assert.equal(M.idOf('/course/view.php?id=bad','https://ecampus.sejong.ac.kr'),null);
const a={id:'a',course:'나',week:1,order:0,end:2,rank:1};
const b={id:'b',course:'가',week:2,order:0,end:1,rank:0};
assert.deepEqual(M.sorted([a,b],'deadline').map(x=>x.id),['b','a']);
assert.deepEqual(M.sorted([a,b],'week').map(x=>x.id),['a','b']);
assert.deepEqual(M.sorted([a,b],'manual').map(x=>x.id),['b','a']);
assert.deepEqual([a,b].map(x=>x.id),['a','b']);
assert.deepEqual(M.newest([{id:'1',stamp:null},{id:'2',stamp:10},{id:'3',stamp:30}]).map(x=>x.id),['3','2','1']);
assert.deepEqual(M.activityDates('2026-10-06 00:00:00 ~ 2026-10-19 23:59:59'),{start:Date.parse('2026-10-06T00:00:00+09:00'),end:Date.parse('2026-10-19T23:59:59+09:00')});
assert.deepEqual(M.activityDates('마감일: 2026/10/19 18:30'),{start:null,end:Date.parse('2026-10-19T18:30:00+09:00')});
assert.deepEqual(M.activityDates('제출기한 2026-10-19'),{start:null,end:Date.parse('2026-10-19T23:59:59+09:00')});
assert.deepEqual(M.activityDates('기간 없음'),{start:null,end:null});
const activities=[
  {id:'1',course:'나',title:'과제 10',type:'과제',week:6,start:20,end:40,order:0},
  {id:'2',course:'가',title:'과제 2',type:'과제',week:2,start:10,end:30,order:1},
  {id:'3',course:'가',title:'자료',type:'파일',week:0,start:null,end:null,order:2},
  {id:'4',course:'가',title:'퀴즈',type:'퀴즈',week:4,start:30,end:20,order:3}
];
for(const [mode,ids] of [['week',['2','4','1','3']],['weekDesc',['1','4','2','3']],['deadline',['4','2','1','3']],['start',['2','1','4','3']],['course',['2','4','3','1']],['type',['2','1','4','3']],['title',['2','1','3','4']]])assert.deepEqual(M.sortedActivities(activities,mode).map(i=>i.id),ids,mode);
assert.deepEqual(activities.map(i=>i.id),['1','2','3','4']);
assert.deepEqual(M.movedOrder([a,b,{id:'c'}],'c','a').map(i=>i.id),['c','a','b']);
assert.deepEqual(M.movedOrder([a,b,{id:'c'}],'a','b',true).map(i=>i.id),['b','a','c']);
assert.deepEqual(M.movedOrder([a,b],'a','a').map(i=>i.id),['a','b']);
assert.deepEqual(M.movedOrder([a,b],'missing','b').map(i=>i.id),['a','b']);
console.log('Eligibility, origin validation and ordering checks passed.');
