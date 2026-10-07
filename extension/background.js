chrome.action.onClicked.addListener(() => chrome.tabs.create({url: 'https://ecampus.sejong.ac.kr/dashboard.php#jh-open'}));

// Keep the media element audible to Chrome while muting its actual tab output.
// Session storage survives service-worker suspension without persisting tab IDs.
const audioJobs=new Map();
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(!['jh-audio-set','jh-audio-release','jh-audio-release-all'].includes(message?.type))return;
  let url;try{url=new URL(sender.url);}catch{return;}
  if(url.origin!=='https://ecampus.sejong.ac.kr'||!Number.isInteger(sender.tab?.id))return;
  if(message.type==='jh-audio-release-all'?sender.frameId!==0:url.pathname!=='/mod/vod/viewer.php')return;
  if(message.type==='jh-audio-set'&&(!Number.isFinite(message.volume)||message.volume<0||message.volume>1)){respond({ok:false});return;}
  const tabId=sender.tab.id,key='jhAudio:'+tabId,owner=sender.documentId||sender.frameId+':'+sender.url;
  const job=(audioJobs.get(tabId)||Promise.resolve()).catch(()=>{}).then(async()=>{
    const tab=await chrome.tabs.get(tabId),saved=(await chrome.storage.session.get(key))[key];
    const ours=tab.mutedInfo?.reason==='extension'&&tab.mutedInfo.extensionId===chrome.runtime.id;
    if(message.type==='jh-audio-set'&&message.volume===0&&message.preventMutedPause!==false){
      await chrome.storage.session.set({[key]:{originalMuted:saved?saved.originalMuted:!!tab.mutedInfo?.muted,owner}});
      const updated=tab.mutedInfo?.muted?tab:await chrome.tabs.update(tabId,{muted:true});
      return {ok:true,tabMuted:updated.mutedInfo?.muted===true};
    }
    if(saved&&(message.type==='jh-audio-set'||message.type==='jh-audio-release-all'||saved.owner===owner)){
      // Preserve a mute choice the user made through Chrome while the helper ran.
      if(ours&&tab.mutedInfo.muted!==saved.originalMuted)await chrome.tabs.update(tabId,{muted:saved.originalMuted});
      await chrome.storage.session.remove(key);
    }
    return {ok:true};
  });
  audioJobs.set(tabId,job);
  job.then(respond,()=>respond({ok:false})).finally(()=>{if(audioJobs.get(tabId)===job)audioJobs.delete(tabId);});
  return true;
});
chrome.tabs.onRemoved.addListener(tabId=>{chrome.storage.session.remove('jhAudio:'+tabId).catch(()=>{});});
