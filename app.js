'use strict';
const TOTAL_FRAMES = 480;
const PAGE_COUNT = 5;
const LERP = 0.12;
const CONCURRENCY = 48;

let scrollPos = 0, targetScroll = 0, currentFrame = 0;
let images = new Array(TOTAL_FRAMES), loadedCount = 0, failCount = 0;
const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent) || window.innerWidth < 768;

const canvas = document.getElementById('scrollCanvas');
const ctx = canvas.getContext('2d');
const loader = document.getElementById('loader');
const loaderFill = document.getElementById('loaderFill');
const loaderPct = document.getElementById('loaderPct');
const pages = document.querySelectorAll('.page');
const navLinks = document.querySelectorAll('.nav-link');
const burger = document.getElementById('burger');
const mobileNav = document.getElementById('mobileNav');

function resizeCanvas(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;drawFrame()}
window.addEventListener('resize',resizeCanvas);resizeCanvas();

function framePath(i){return `${isMobile?'frames-mobile':'frames-webp'}/frame_${String(i).padStart(6,'0')}.webp`}

function preloadFrames(){
  let idx=0,active=0;
  const fallback=setTimeout(()=>{if(loadedCount===0||failCount>=CONCURRENCY)finishLoading()},3000);
  function next(){while(active<CONCURRENCY&&idx<TOTAL_FRAMES){const i=idx++;active++;const img=new Image();img.onload=()=>{images[i]=img;active--;loadedCount++;progress();next()};img.onerror=()=>{active--;failCount++;loadedCount++;progress();next()};img.src=framePath(i+1)}}
  function progress(){const p=Math.round((loadedCount/TOTAL_FRAMES)*100);loaderFill.style.width=p+'%';loaderPct.textContent=p+'%';if(loadedCount>=TOTAL_FRAMES){clearTimeout(fallback);finishLoading()}}
  next();
}

function finishLoading(){loader.classList.add('hidden');pages[0].classList.add('active');revealElements(0);drawFrame()}

function drawFrame(){
  const idx=Math.min(Math.max(Math.round(currentFrame),0),TOTAL_FRAMES-1);
  const img=images[idx];if(!img)return;
  const cw=canvas.width,ch=canvas.height,scale=Math.max(cw/img.naturalWidth,ch/img.naturalHeight);
  const dw=img.naturalWidth*scale,dh=img.naturalHeight*scale;
  ctx.clearRect(0,0,cw,ch);ctx.drawImage(img,(cw-dw)/2,(ch-dh)/2,dw,dh);
}

const MAX_SCROLL=(PAGE_COUNT-1)*1000;
let snapTimer=null;
function scheduleSnap(){
  clearTimeout(snapTimer);
  snapTimer=setTimeout(()=>{
    const nearest=Math.round(targetScroll/1000)*1000;
    targetScroll=Math.max(0,Math.min(nearest,MAX_SCROLL));
  },300);
}
window.addEventListener('wheel',e=>{
  const slider=document.getElementById('poemsSlider');
  const gallery=document.getElementById('videoGallery');
  if(slider&&slider.matches(':hover'))return;
  if(gallery&&gallery.matches(':hover'))return;
  e.preventDefault();
  targetScroll=Math.max(0,Math.min(targetScroll+e.deltaY*1.5,MAX_SCROLL));
  scheduleSnap();
},{passive:false});

let touchStartY=0,touchStartX=0,touchHandled=false;
window.addEventListener('touchstart',e=>{touchStartY=e.touches[0].clientY;touchStartX=e.touches[0].clientX;touchHandled=false},{passive:true});
window.addEventListener('touchend',e=>{
  if(touchHandled)return;
  const dy=touchStartY-(e.changedTouches[0]||e.touches[0]||{clientY:touchStartY}).clientY;
  const dx=Math.abs((e.changedTouches[0]||{clientX:touchStartX}).clientX-touchStartX);
  if(dx>Math.abs(dy))return; /* horizontal swipe — let slider handle */
  if(Math.abs(dy)<30)return; /* too small — ignore */
  touchHandled=true;
  const curPage=Math.round(targetScroll/1000);
  if(dy>0&&curPage<PAGE_COUNT-1)targetScroll=(curPage+1)*1000;
  else if(dy<0&&curPage>0)targetScroll=(curPage-1)*1000;
},{passive:true});

function animate(){
  scrollPos+=(targetScroll-scrollPos)*LERP;
  currentFrame=(scrollPos/MAX_SCROLL)*(TOTAL_FRAMES-1);drawFrame();
  const pageIdx=Math.round(scrollPos/1000);
  pages.forEach((p,i)=>{if(i===pageIdx){p.classList.add('active');revealElements(i)}else p.classList.remove('active')});
  navLinks.forEach(l=>l.classList.toggle('active',parseInt(l.dataset.section)===pageIdx));
  requestAnimationFrame(animate);
}

const revealed=new Set();
function revealElements(idx){if(revealed.has(idx))return;revealed.add(idx);pages[idx].querySelectorAll('.reveal').forEach((el,i)=>setTimeout(()=>el.classList.add('visible'),i*100))}

navLinks.forEach(l=>l.addEventListener('click',e=>{e.preventDefault();targetScroll=parseInt(l.dataset.section)*1000;mobileNav.classList.remove('open');burger.classList.remove('open')}));
document.querySelectorAll('[data-section]').forEach(el=>{if(el.classList.contains('nav-link'))return;el.addEventListener('click',e=>{e.preventDefault();targetScroll=parseInt(el.dataset.section)*1000})});
burger.addEventListener('click',()=>{burger.classList.toggle('open');mobileNav.classList.toggle('open')});

window.addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'||e.key===' '){e.preventDefault();targetScroll=Math.min(targetScroll+1000,MAX_SCROLL)}
  if(e.key==='ArrowUp'){e.preventDefault();targetScroll=Math.max(targetScroll-1000,0)}
});

preloadFrames();requestAnimationFrame(animate);

/* ============ MUSIC PLAYER ============ */
const tracks=[
  {name:'Песня 1',src:'https://www.dropbox.com/scl/fi/5eanbtn3v2z5hvsq3gd3w/1.mpeg?rlkey=pqew3kqu958gracorquuwov8y&raw=1'},
  {name:'Песня 2',src:'https://www.dropbox.com/scl/fi/y006ktwhvrjfkpjtbxp8t/2.mpeg?rlkey=8g7ymze0fe5h91s5yp01ih6se&raw=1'},
  {name:'Песня 3',src:'https://www.dropbox.com/scl/fi/of8nskekxbovj29xe6cme/3.mpeg?rlkey=3eiz7tp97lgzv1nzflgg5fx89&raw=1'}
];
let curTrack=0;
const audio=document.getElementById('audioEl'),playBtn=document.getElementById('playBtn'),prevBtn=document.getElementById('prevBtn'),nextBtn=document.getElementById('nextBtn');
const progressWrap=document.getElementById('progressWrap'),progressBar=document.getElementById('progressBar');
const curTimeEl=document.getElementById('curTime'),durTimeEl=document.getElementById('durTime'),npTitle=document.getElementById('npTitle');
const trackEls=document.querySelectorAll('.track');

function loadTrack(i){curTrack=i;audio.src=tracks[i].src;npTitle.textContent=tracks[i].name;trackEls.forEach((t,j)=>t.classList.toggle('active',j===i))}
function fmt(s){if(!s||isNaN(s))return'0:00';const m=Math.floor(s/60),sec=Math.floor(s%60);return m+':'+(sec<10?'0':'')+sec}
playBtn.addEventListener('click',()=>{if(audio.paused){if(!audio.src)loadTrack(0);audio.play();playBtn.textContent='⏸'}else{audio.pause();playBtn.textContent='▶'}});
prevBtn.addEventListener('click',()=>{loadTrack((curTrack-1+tracks.length)%tracks.length);audio.play();playBtn.textContent='⏸'});
nextBtn.addEventListener('click',()=>{loadTrack((curTrack+1)%tracks.length);audio.play();playBtn.textContent='⏸'});
audio.addEventListener('timeupdate',()=>{if(audio.duration){progressBar.style.width=(audio.currentTime/audio.duration*100)+'%';curTimeEl.textContent=fmt(audio.currentTime);durTimeEl.textContent=fmt(audio.duration)}});
audio.addEventListener('ended',()=>{loadTrack((curTrack+1)%tracks.length);audio.play()});
progressWrap.addEventListener('click',e=>{if(audio.duration){audio.currentTime=(e.offsetX/progressWrap.offsetWidth)*audio.duration}});
trackEls.forEach(t=>t.addEventListener('click',()=>{loadTrack(parseInt(t.dataset.idx));audio.play();playBtn.textContent='⏸'}));

const videoData=[
  {src:'https://www.dropbox.com/scl/fi/dx6ica0q180pyle2f4a2a/WhatsApp-Video-2026-05-06-at-18.09.41.mp4?rlkey=hx7m3c2kzrwxgs0uu05tk11jt&raw=1',title:'Стихотворение 1'},
  {src:'https://www.dropbox.com/scl/fi/ep4mdx9arpc9sl4d56xhp/WhatsApp-Video-2026-05-06-at-18.09.44.mp4?rlkey=79j7r9sngqmydzi963mquibnu&raw=1',title:'Стихотворение 2'},
  {src:'https://www.dropbox.com/scl/fi/bwfd0sjy4nbwvkc7o5cx7/WhatsApp-Video-2026-05-06-at-18.09.46.mp4?rlkey=enzq6y5hy6k8ypqtl871h4vjb&raw=1',title:'Стихотворение 3'},
  {src:'https://www.dropbox.com/scl/fi/9ppl9tn6e01355fsmynrh/WhatsApp-Video-2026-05-06-at-18.09.49.mp4?rlkey=3ubp20dr9w18zdrqyrdiv838m&raw=1',title:'Стихотворение 4'},
  {src:'https://www.dropbox.com/scl/fi/e28dtcw053me55zdpwoe7/WhatsApp-Video-2026-05-06-at-18.09.51.mp4?rlkey=dflw4rukgz86gia28l7iyb6c2&raw=1',title:'Стихотворение 5'},
  {src:'https://www.dropbox.com/scl/fi/ni4a42sxakpyvddyi9v9b/WhatsApp-Video-2026-05-06-at-18.10.43.mp4?rlkey=ky8w7cu3jsq5sp8nrgt08io5x&raw=1',title:'Стихотворение 6'},
  {src:'https://www.dropbox.com/scl/fi/m47naxlejxtfpuug068h8/WhatsApp-Video-2026-05-06-at-18.10.44.mp4?rlkey=j1w4wrr385pj82z13uprg9oa0&raw=1',title:'Стихотворение 7'},
  {src:'https://www.dropbox.com/scl/fi/wt45jhjne5a2sn8okmk14/WhatsApp-Video-2026-05-06-at-18.10.46.mp4?rlkey=rdsprd5895pdcf508tmfzrhkn&raw=1',title:'Стихотворение 8'},
  {src:'https://www.dropbox.com/scl/fi/nkat07xi1tngsopmgiei4/WhatsApp-Video-2026-05-06-at-18.10.49.mp4?rlkey=q7ayoc6cl0figmzg8mabd33cp&raw=1',title:'Стихотворение 9'},
  {src:'https://www.dropbox.com/scl/fi/06reaybsilvh3u7lbpp84/WhatsApp-Video-2026-05-06-at-18.10.50.mp4?rlkey=8gz5ft0xiv40ydbjn2bh5tp7j&raw=1',title:'Стихотворение 10'},
  {src:'https://www.dropbox.com/scl/fi/y2dr02j1623ngwuw9seqy/WhatsApp-Video-2026-05-06-at-18.10.54.mp4?rlkey=3dmnc7801qxnchel4k6qrsbsx&raw=1',title:'Стихотворение 11'},
  {src:'https://www.dropbox.com/scl/fi/p7vmtv1pad9w65kw6d875/WhatsApp-Video-2026-05-06-at-18.10.57.mp4?rlkey=t4vv897t89xbjbu022xscqw1y&raw=1',title:'Стихотворение 12'},
  {src:'https://www.dropbox.com/scl/fi/qs8a5akck1j966rasbjv2/WhatsApp-Video-2026-05-06-at-18.10.59.mp4?rlkey=n3ns7cdx5340q26htqbffjedh&raw=1',title:'Стихотворение 13'},
  {src:'https://www.dropbox.com/scl/fi/f1ii8lj16sa2smpq8wgq6/WhatsApp-Video-2026-05-06-at-18.11.02.mp4?rlkey=mfxxpsdgkw08pl1udu85zbdud&raw=1',title:'Стихотворение 14'},
  {src:'https://www.dropbox.com/scl/fi/cfcc06j3hg4t3ba9v0n4u/WhatsApp-Video-2026-05-06-at-18.11.04.mp4?rlkey=k4dgt5t2njsmn8z5bpp7onxkk&raw=1',title:'Стихотворение 15'},
  {src:'https://www.dropbox.com/scl/fi/zr9zqk2dct9kuv9qeaic5/WhatsApp-Video-2026-05-06-at-18.11.07.mp4?rlkey=8pylqk4uzmiz2sfcw90y6ft2y&raw=1',title:'Стихотворение 16'},
  {src:'https://www.dropbox.com/scl/fi/4mxet9hsax496193ov3s5/WhatsApp-Video-2026-05-06-at-18.10.06.mp4?rlkey=l5qaxtwmuixl0t8wjiqz650xv&raw=1',title:'Стихотворение 17'}
];
const gallery=document.getElementById('videoGallery');

/* build modal */
const modal=document.createElement('div');modal.className='video-modal';modal.innerHTML='<button class="vm-close">✕</button><video class="vm-video" controls playsinline></video>';
document.body.appendChild(modal);
const vmVideo=modal.querySelector('.vm-video');
modal.querySelector('.vm-close').addEventListener('click',()=>{modal.classList.remove('open');vmVideo.pause();vmVideo.src=''});
modal.addEventListener('click',e=>{if(e.target===modal){modal.classList.remove('open');vmVideo.pause();vmVideo.src=''}});

videoData.forEach((v,i)=>{
  const thumb=document.createElement('div');thumb.className='video-thumb';
  /* use actual video element as preview so each shows its own first frame */
  const vid=document.createElement('video');
  vid.src=v.src;vid.preload='metadata';vid.muted=true;vid.playsInline=true;
  vid.addEventListener('loadeddata',()=>{vid.currentTime=0.5});
  thumb.appendChild(vid);
  const overlay=document.createElement('div');overlay.className='vt-play';overlay.textContent='▷';thumb.appendChild(overlay);
  const title=document.createElement('div');title.className='vt-title';title.textContent=v.title;thumb.appendChild(title);
  thumb.addEventListener('click',()=>{vmVideo.src=v.src;modal.classList.add('open');vmVideo.play()});
  gallery.appendChild(thumb);
});
