(() => {
/** Pure page-input policy; no DOM, timers or device-specific detection. */
const PAGE_TURN = Object.freeze({quiet:280,threshold:24,line:16,animation:480,lock:540,reducedLock:120,swipe:65,minScale:0.65,canvas:1600});
function normalizeWheel(delta,mode=0,height=800){return delta*(mode===1?PAGE_TURN.line:mode===2?height:1);}
function canRead(direction,top,scrollHeight,clientHeight){return scrollHeight>clientHeight+2&&(direction>0?top<scrollHeight-clientHeight-2:top>2);}
function swipeDirection(dx,dy){return Number.isFinite(dx)&&Number.isFinite(dy)&&Math.abs(dy)>PAGE_TURN.swipe&&Math.abs(dy)>Math.abs(dx)*1.4?Math.sign(dy):0;}
class WheelGesture {
  constructor({quiet=PAGE_TURN.quiet,threshold=PAGE_TURN.threshold}={}){this.quiet=quiet;this.threshold=threshold;this.reset();}
  reset(){this.last=-Infinity;this.total=0;this.direction=0;this.used=false;}
  consume(){this.used=true;}
  feed({time,dy,dx=0,mode=0,ctrl=false,meta=false,shift=false,height=800},locked=false){
    if(ctrl||meta||shift||!Number.isFinite(dy)||!Number.isFinite(dx)||!Number.isFinite(time)||Math.abs(dx)>Math.abs(dy)||dy===0)return {step:0,ignored:true,newSet:false};
    const newSet=time-this.last>=this.quiet;
    if(newSet){this.total=0;this.direction=0;this.used=false;}
    this.last=time;
    if(locked){this.consume();return {step:0,ignored:false,newSet};}
    if(this.used)return {step:0,ignored:false,newSet};
    const direction=Math.sign(dy);
    if(this.direction!==direction){this.direction=direction;this.total=0;}
    this.total+=Math.min(Math.abs(normalizeWheel(dy,mode,height)),400);
    if(this.total<this.threshold)return {step:0,ignored:false,newSet};
    this.consume();return {step:direction,ignored:false,newSet};
  }
}

/* Whole-document paging. Core policy is concatenated before this file at build time. */
(() => {
 'use strict';
 function initPageTurn(){
  const root=document.documentElement,main=document.querySelector('main'),pager=document.querySelector('.pager');
  const pages=main?[...main.querySelectorAll(':scope > section.page')]:[];
  if(!pager||!pages.length||typeof window.matchMedia!=='function')return;
  const gate=new WheelGesture(),reduced=matchMedia('(prefers-reduced-motion: reduce)'),small=matchMedia('(max-width:900px)');
  const prev=pager.querySelector('[data-page-prev]'),next=pager.querySelector('[data-page-next]'),select=pager.querySelector('[data-page-select]');
  const count=pager.querySelector('[data-page-count]'),hint=pager.querySelector('[data-page-hint]'),toggle=pager.querySelector('[data-pager-mode]'),live=pager.querySelector('[data-page-live]');
  if(!prev||!next||!select||!count||!hint||!toggle||!live)return;
  const labels=pages.map(p=>{
   if(p.id==='cover')return '표지';if(p.id==='contents')return '목차';if(p.id==='closing')return '마무리';
   const title=(p.querySelector('h2')?.textContent||p.id).trim(),model=p.querySelector('.model')?.textContent;
   const source=p.querySelector('.source-title')?.textContent;
   return p.classList.contains('engineering')?`${source||''} · ${title}`:`${title}${model?' '+model:''} · ${source||''}`;
  });
  const panels=[];let index=0,paged=false,lockedUntil=0,innerSet=false,touch=null,resizePending=false,scrollQueued=false;
  const now=()=>performance.now(),modalOpen=()=>Boolean(document.querySelector('dialog[open]'));
  const active=()=>panels[index],sheet=()=>active().sheet;
  const reading=direction=>canRead(direction,sheet().scrollTop,sheet().scrollHeight,sheet().clientHeight);
  function indexOfHash(hash=location.hash){try{const id=decodeURIComponent(hash.replace(/^#/,''));return id?pages.findIndex(p=>p.id===id):0;}catch{return -1;}}
  function updateUrl(){const hash='#'+pages[index].id;if(location.hash===hash)return;try{history.pushState(null,'',hash);}catch{/* a file viewer may deny history writes */}}
  function sync(){
   root.dataset.pageId=pages[index].id;root.dataset.page=String(index+1);
   count.textContent=`${String(index+1).padStart(2,'0')} / ${String(pages.length).padStart(2,'0')}`;
   select.value=String(index);select.title=labels[index];prev.disabled=index===0;next.disabled=index===pages.length-1;
   toggle.textContent=paged?'전체 읽기':'한 장씩';toggle.setAttribute('aria-pressed',String(!paged));
   hint.textContent=!paged?'전체 문서 · 자유롭게 스크롤':sheet().scrollHeight>sheet().clientHeight+2?'현재 장을 끝까지 읽고, 새 동작으로 넘기세요.':'휠 한 동작 = 한 장 · 멈춘 뒤 다시 굴리세요.';
   if(!paged)return;
   let selected=null;
   const nav=[...document.querySelectorAll('.nav-links a')];
   for(const link of nav){const n=indexOfHash(link.hash);if(n>=0&&n<=index)selected=link;}
   if(pages[index].id==='cover')selected=null;
   for(const link of nav){link.classList.toggle('active',link===selected);if(link===selected)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');}
   const progress=document.querySelector('.progress');if(progress)progress.style.width=`${(index+1)/pages.length*100}%`;
  }
  function fit(){
   resizePending=false;if(!paged)return;
   const header=document.querySelector('.site-nav');
   root.style.setProperty('--pager-top',`${Math.ceil(header?.getBoundingClientRect().height||64)}px`);
   root.style.setProperty('--pager-bottom',`${Math.ceil(pager.getBoundingClientRect().height)}px`);
   const {sheet:s,space,box,page}=active();
   if(small.matches){space.style.cssText='';box.style.cssText='';}
   else{
    const height=Math.max(900,page.scrollHeight,page.offsetHeight),widthRatio=s.clientWidth/PAGE_TURN.canvas;
    const minScale=Math.min(PAGE_TURN.minScale,widthRatio);
    const scale=Math.min(widthRatio,Math.max(minScale,Math.min(1,(s.clientHeight-12)/height)));
    box.style.width=`${PAGE_TURN.canvas}px`;box.style.transform=`scale(${scale})`;
    space.style.width=`${PAGE_TURN.canvas*scale}px`;space.style.height=`${height*scale}px`;
    space.style.marginTop=`${Math.max(0,(s.clientHeight-height*scale)/2)}px`;
   }
   sync();
  }
  function requestFit(){if(!resizePending){resizePending=true;requestAnimationFrame(()=>{try{fit();}catch{setMode(false);}});}}
  function go(target,{direction=1,animate=true,force=false,history=true,step=false}={}){
   if(target<0||target>=pages.length||!Number.isInteger(target)||(!force&&now()<lockedUntil))return false;
   const previous=index,changed=target!==index,oldPanel=panels[index]?.panel,oldFocus=document.activeElement;
   index=target;
   if(!paged){pages[index].scrollIntoView({behavior:'auto',block:'start'});sync();if(history)updateUrl();return true;}
   for(let n=0;n<panels.length;n++){
    const p=panels[n].panel;p.hidden=n!==index;p.inert=n!==index;p.classList.toggle('is-active',n===index);p.classList.remove('page-enter-down','page-enter-up');
    if(n!==index)p.setAttribute('aria-hidden','true');else p.removeAttribute('aria-hidden');
   }
   fit();
   if(changed)sheet().scrollTop=step&&direction<0?sheet().scrollHeight:0;
   if(changed&&animate&&!reduced.matches){void active().panel.offsetHeight;active().panel.classList.add(direction>0?'page-enter-down':'page-enter-up');}
   lockedUntil=now()+(changed&&animate?(reduced.matches?PAGE_TURN.reducedLock:PAGE_TURN.lock):0);
   if(changed&&oldPanel?.contains(oldFocus))pages[index].focus({preventScroll:true});
   if(changed)live.textContent=`${index+1} / ${pages.length}, ${labels[index]}`;
   if(history)updateUrl();sync();return previous!==index||!changed;
  }
  function setMode(value){
   if(modalOpen())return;
   paged=Boolean(value);root.classList.toggle('page-mode',paged);root.dataset.readingMode=paged?'paged':'continuous';
   gate.reset();innerSet=false;touch=null;lockedUntil=0;
   if(paged){window.scrollTo(0,0);go(index,{force:true,animate:false,history:false});}
   else{
    for(const p of panels){p.panel.hidden=false;p.panel.inert=false;p.panel.removeAttribute('aria-hidden');p.panel.classList.remove('page-enter-down','page-enter-up');p.space.style.cssText='';p.box.style.cssText='';}
    sync();requestAnimationFrame(()=>{pages[index].scrollIntoView({behavior:'auto',block:'start'});window.dispatchEvent(new Event('scroll'));});
   }
  }
  try{
   for(const [i,page] of pages.entries()){
    const panel=document.createElement('div'),s=document.createElement('div'),space=document.createElement('div'),box=document.createElement('div');
    panel.className='deck-panel';s.className='deck-sheet';space.className='deck-space';box.className='deck-fitbox';
    panel.dataset.dark=String(page.classList.contains('hero'));page.before(panel);panel.append(s);s.append(space);space.append(box);box.append(page);
    page.tabIndex=-1;panels.push({panel,sheet:s,space,box,page});
    const option=document.createElement('option');option.value=String(i);option.textContent=`${String(i+1).padStart(2,'0')} · ${labels[i]}`;select.append(option);
   }
   const initial=indexOfHash();index=initial<0?0:initial;pager.hidden=false;root.classList.add('pager-ready');setMode(true);
  }catch{
   root.classList.remove('page-mode','pager-ready');pager.hidden=true;
   for(const p of panels){p.panel.before(p.page);p.panel.remove();}return;
  }
  const step=direction=>{if(go(index+direction,{direction,step:true})){gate.reset();innerSet=false;}};
  prev.addEventListener('click',()=>step(-1));next.addEventListener('click',()=>step(1));
  toggle.addEventListener('click',()=>setMode(!paged));
  select.addEventListener('change',()=>{if(modalOpen())return;go(Number(select.value),{force:true,direction:Math.sign(Number(select.value)-index)});gate.reset();innerSet=false;});
  document.addEventListener('wheel',e=>{
   if(!paged||modalOpen()||e.target.closest?.('.pager select,input,textarea,[contenteditable="true"]'))return;
   const r=gate.feed({time:now(),dy:e.deltaY,dx:e.deltaX,mode:e.deltaMode,ctrl:e.ctrlKey,meta:e.metaKey,shift:e.shiftKey,height:sheet().clientHeight},now()<lockedUntil);
   if(r.ignored)return;
   if(e.cancelable)e.preventDefault();
   if(r.newSet)innerSet=now()>=lockedUntil&&reading(Math.sign(e.deltaY));
   if(innerSet){sheet().scrollTop+=normalizeWheel(e.deltaY,e.deltaMode,sheet().clientHeight);return;}
   if(r.step)go(index+r.step,{direction:r.step,step:true});
  },{passive:false});
  document.addEventListener('keydown',e=>{
   if(modalOpen())return;
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){setMode(false);return;}
   if(!paged||e.ctrlKey||e.metaKey||e.altKey||e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
   if(e.target.closest?.('button,a')&&(e.key===' '||e.key==='Enter'))return;
   if(e.shiftKey&&e.key!==' ')return;
   const direction=e.key===' '?(e.shiftKey?-1:1):['ArrowDown','PageDown'].includes(e.key)?1:['ArrowUp','PageUp'].includes(e.key)?-1:0;
   if(!direction&&!['Home','End'].includes(e.key))return;
   e.preventDefault();if(e.repeat||now()<lockedUntil)return;
   if(direction&&reading(direction)){sheet().scrollTop+=direction*sheet().clientHeight*.8;return;}
   go(e.key==='Home'?0:e.key==='End'?pages.length-1:index+direction,{direction:direction||1,step:Boolean(direction)});gate.reset();innerSet=false;
  });
  main.addEventListener('touchstart',e=>{
   if(!paged||modalOpen()||e.touches.length!==1||now()<lockedUntil){touch=null;return;}
   const s=sheet();touch={x:e.touches[0].clientX,y:e.touches[0].clientY,top:s.scrollTop,height:s.scrollHeight,client:s.clientHeight,kind:null,cancelled:false};
  },{passive:true});
  main.addEventListener('touchmove',e=>{
   if(!touch)return;
   if(modalOpen()||e.touches.length!==1){touch.cancelled=true;return;}
   const dy=touch.y-e.touches[0].clientY,dx=touch.x-e.touches[0].clientX;
   if(touch.kind===null&&Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)*1.2)touch.kind=canRead(Math.sign(dy),touch.top,touch.height,touch.client)?'read':'page';
   if(touch.kind==='page'&&e.cancelable)e.preventDefault();
  },{passive:false});
  main.addEventListener('touchend',e=>{
   const t=touch;touch=null;if(!t||t.cancelled||t.kind!=='page'||modalOpen()||!e.changedTouches.length)return;
   const direction=swipeDirection(t.x-e.changedTouches[0].clientX,t.y-e.changedTouches[0].clientY);
   if(direction){if(e.cancelable)e.preventDefault();step(direction);}
  },{passive:false});
  main.addEventListener('touchcancel',()=>{touch=null;},{passive:true});
  document.addEventListener('click',e=>{
   const link=e.target.closest?.('a[href^="#"]');
   if(!paged||!link||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||modalOpen())return;
   if(link.hash==='#main'){e.preventDefault();pages[index].focus({preventScroll:true});return;}
   const target=indexOfHash(link.hash);if(target<0)return;
   e.preventDefault();go(target,{force:true,direction:Math.sign(target-index)});gate.reset();innerSet=false;
  });
  function fromHistory(){const target=indexOfHash();if(target<0||modalOpen())return;go(target,{force:true,animate:false,history:false});gate.reset();innerSet=false;}
  window.addEventListener('hashchange',fromHistory);window.addEventListener('popstate',fromHistory);
  window.addEventListener('resize',requestFit);window.visualViewport?.addEventListener('resize',requestFit);
  document.fonts?.ready.then(requestFit);
  for(const img of main.querySelectorAll('img'))img.addEventListener('load',requestFit);
  const pauseAfterModal=()=>{gate.reset();innerSet=false;lockedUntil=now()+PAGE_TURN.quiet;};
  document.addEventListener('portfolio:modal-close',pauseAfterModal);
  document.querySelector('.lightbox')?.addEventListener('close',pauseAfterModal);
  window.addEventListener('scroll',()=>{
   if(paged||scrollQueued)return;scrollQueued=true;
   requestAnimationFrame(()=>{scrollQueued=false;if(paged)return;let found=0;pages.forEach((p,i)=>{if(p.getBoundingClientRect().top<innerHeight*.4)found=i;});index=found;sync();});
  },{passive:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initPageTurn,{once:true});else initPageTurn();
})();

/* Progressive enhancement: core text, anchor links and image links need no JS. */
'use strict';
(() => {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const nav = [...document.querySelectorAll('.nav-links a')].map(link => ({link,target:document.getElementById(link.hash.slice(1))})).filter(x=>x.target);
  const progress = document.querySelector('.progress');
  let queued=false;
  function track(){
    queued=false;
    if(document.documentElement.classList.contains('page-mode'))return;
    const cutoff=100;let selected=null;
    for(const item of nav)if(item.target.getBoundingClientRect().top<=cutoff)selected=item;
    for(const item of nav){item.link.classList.toggle('active',item===selected);if(item===selected)item.link.setAttribute('aria-current','location');else item.link.removeAttribute('aria-current');}
    const limit=document.documentElement.scrollHeight-innerHeight;
    if(progress)progress.style.width=`${limit>0?Math.min(100,Math.max(0,scrollY/limit*100)):0}%`;
  }
  const requestTrack=()=>{if(!queued){queued=true;requestAnimationFrame(track)}};
  window.addEventListener('scroll',requestTrack,{passive:true});window.addEventListener('resize',requestTrack);window.addEventListener('hashchange',requestTrack);track();
  // No hidden-at-start class. A failed observer cannot hide portfolio content.
  if(!document.documentElement.classList.contains('page-mode') && !reduced && typeof window.IntersectionObserver==='function'){
    try{
      const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('motion-enter');observer.unobserve(entry.target)}},{threshold:.06});
      document.querySelectorAll('main section:not(.hero) .kicker, main section h2').forEach(el=>observer.observe(el));
    }catch{/* enhancement unavailable; keep static content */}
  }
  const dialog=document.querySelector('.lightbox');
  if(!dialog||typeof dialog.showModal!=='function')return;
  const image=dialog.querySelector('img'),view=dialog.querySelector('.image-view'),label=dialog.querySelector('.lightbox-label');
  const closeButton=dialog.querySelector('[data-close]'),sizeButton=dialog.querySelector('[data-size]'),error=dialog.querySelector('.image-error');
  let opener=null;
  function fit(){view.classList.remove('full-size');sizeButton.setAttribute('aria-pressed','false');sizeButton.textContent='원본 크기';view.scrollTop=0;view.scrollLeft=0;}
  function close(){document.dispatchEvent(new Event('portfolio:modal-close'));if(dialog.open)dialog.close();document.body.classList.remove('modal-open');fit();image.removeAttribute('src');opener?.focus({preventScroll:true})}
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[data-zoom]');
    if(!link||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const thumb=link.querySelector('img');
    if(!thumb)return;
    try{
      opener=link;fit();error.hidden=true;label.textContent=thumb.alt;image.alt=thumb.alt;
      dialog.showModal();document.body.classList.add('modal-open');image.src=link.href;
      sizeButton.focus();event.preventDefault();
    }catch{document.body.classList.remove('modal-open');if(dialog.open)dialog.close();/* ordinary href remains usable */}
  });
  closeButton.addEventListener('click',close);
  sizeButton.addEventListener('click',()=>{const full=view.classList.toggle('full-size');sizeButton.setAttribute('aria-pressed',String(full));sizeButton.textContent=full?'화면 맞춤':'원본 크기'});
  dialog.addEventListener('cancel',event=>{event.preventDefault();close()});
  dialog.addEventListener('close',()=>{document.body.classList.remove('modal-open')});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close()}});
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    if(event.shiftKey&&document.activeElement===sizeButton){event.preventDefault();closeButton.focus()}
    else if(!event.shiftKey&&document.activeElement===closeButton){event.preventDefault();sizeButton.focus()}
  });
  image.addEventListener('error',()=>{if(dialog.open)error.hidden=false});
  image.addEventListener('load',()=>{error.hidden=true});
})();

})();