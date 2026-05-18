/* ─── Ирина Юнаева — ScrollCanvas Engine (Native Scroll-Snap) ─── */
'use strict';

const TOTAL_FRAMES = 480;
const LERP = 0.08;
const CONCURRENCY = 48;

const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent) || innerWidth < 768;
const FRAME_DIR = isMobile ? 'frames-mobile' : 'frames-webp';

/* ── DOM refs ── */
const loader = document.getElementById('loader');
const loaderFill = document.getElementById('loaderFill');
const loaderPct = document.getElementById('loaderPct');
const pages = Array.from(document.querySelectorAll('.page'));
const navLinks = Array.from(document.querySelectorAll('.nav-link'));
const burger = document.getElementById('burger');
const mobileNav = document.getElementById('mobileNav');
const canvas = document.getElementById('scrollCanvas');
const ctx = canvas.getContext('2d');

/* ── State ── */
let targetFrame = 0, currentFrame = 0, isReady = false;
const frames = new Array(TOTAL_FRAMES);

/* ── Canvas sizing ── */
function resize(){
  const dpr = Math.min(devicePixelRatio || 1, isMobile ? 1.5 : 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  drawFrame(Math.round(currentFrame));
}
addEventListener('resize', resize);

/* ── Frame loader ── */
function padNum(n){return String(n).padStart(6,'0')}

function loadFrame(index){
  return new Promise(resolve=>{
    const img = new Image();
    img.onload = ()=>{
      if(img.decode) img.decode().then(()=>{frames[index]=img;resolve()}).catch(()=>{frames[index]=img;resolve()});
      else {frames[index]=img;resolve()}
    };
    img.onerror = ()=>resolve();
    img.src = `${FRAME_DIR}/frame_${padNum(index+1)}.webp`;
  });
}

async function loadAllFrames(){
  let loaded = 0;
  const queue = Array.from({length:TOTAL_FRAMES},(_,i)=>i);
  async function worker(){
    while(queue.length>0){
      const idx=queue.shift();
      if(idx===undefined)return;
      await loadFrame(idx);
      loaded++;
      const pct=Math.floor((loaded/TOTAL_FRAMES)*100);
      loaderFill.style.width=pct+'%';
      loaderPct.textContent=pct+'%';
    }
  }
  await Promise.all(Array.from({length:CONCURRENCY},()=>worker()));
}

/* ── Draw frame (cover fit) ── */
function drawFrame(idx){
  idx=Math.max(0,Math.min(TOTAL_FRAMES-1,idx));
  const img=frames[idx]; if(!img) return;
  const cw=innerWidth,ch=innerHeight;
  const iw=img.naturalWidth||img.width, ih=img.naturalHeight||img.height;
  const scale=Math.max(cw/iw,ch/ih);
  const sw=iw*scale,sh=ih*scale;
  ctx.clearRect(0,0,cw,ch);
  ctx.drawImage(img,(cw-sw)/2,(ch-sh)/2,sw,sh);
}

/* ── NATIVE SCROLL → frame mapping ── */
addEventListener('scroll',()=>{
  if(!isReady) return;
  const maxScroll=document.documentElement.scrollHeight-innerHeight;
  const progress=maxScroll>0?scrollY/maxScroll:0;
  targetFrame=progress*(TOTAL_FRAMES-1);
},{passive:true});

function scrollToPage(i){
  const p=pages[i];
  if(p) scrollTo({top:p.offsetTop,behavior:'smooth'});
}

/* ── Navigation ── */
navLinks.forEach(l=>l.addEventListener('click',e=>{
  e.preventDefault();
  scrollToPage(parseInt(l.dataset.section));
  mobileNav.classList.remove('open');
  burger.classList.remove('open');
}));
document.querySelectorAll('[data-section]').forEach(el=>{
  if(el.classList.contains('nav-link'))return;
  el.addEventListener('click',e=>{e.preventDefault();scrollToPage(parseInt(el.dataset.section))});
});
burger.addEventListener('click',()=>{burger.classList.toggle('open');mobileNav.classList.toggle('open')});

addEventListener('keydown',e=>{
  const cur=pages.findIndex(p=>p.classList.contains('is-active'));
  if(e.key==='ArrowDown'||e.key===' '){e.preventDefault();if(cur<pages.length-1)scrollToPage(cur+1)}
  if(e.key==='ArrowUp'){e.preventDefault();if(cur>0)scrollToPage(cur-1)}
});

/* ── IntersectionObserver for active page ── */
let lastIdx=-1;
const observer=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
    if(entry.isIntersecting){
      const idx=pages.indexOf(entry.target);
      if(idx!==-1 && idx!==lastIdx){
        lastIdx=idx;
        pages.forEach((p,i)=>p.classList.toggle('is-active',i===idx));
        navLinks.forEach(l=>l.classList.toggle('active',parseInt(l.dataset.section)===idx));
      }
    }
  });
},{root:null,rootMargin:'-40% 0px -40% 0px'});
pages.forEach(p=>observer.observe(p));

/* ── Render loop ── */
function animate(){
  requestAnimationFrame(animate);
  currentFrame+=(targetFrame-currentFrame)*LERP;
  if(isReady) drawFrame(Math.round(currentFrame));
}
animate();

/* ── Init ── */
(async function init(){
  resize();
  await loadAllFrames();
  isReady=true;
  drawFrame(0);
  setTimeout(()=>{
    loader.classList.add('hidden');
    pages[0].classList.add('is-active');
  },400);
})();

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

/* ============ VIDEO GALLERY ============ */
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

const modal=document.createElement('div');modal.className='video-modal';modal.innerHTML='<button class="vm-close">✕</button><video class="vm-video" controls playsinline></video>';
document.body.appendChild(modal);
const vmVideo=modal.querySelector('.vm-video');
modal.querySelector('.vm-close').addEventListener('click',()=>{modal.classList.remove('open');vmVideo.pause();vmVideo.src=''});
modal.addEventListener('click',e=>{if(e.target===modal){modal.classList.remove('open');vmVideo.pause();vmVideo.src=''}});

videoData.forEach((v,i)=>{
  const thumb=document.createElement('div');thumb.className='video-thumb';
  const vid=document.createElement('video');
  vid.src=v.src;vid.preload='metadata';vid.muted=true;vid.playsInline=true;
  vid.addEventListener('loadeddata',()=>{vid.currentTime=0.5});
  thumb.appendChild(vid);
  const overlay=document.createElement('div');overlay.className='vt-play';overlay.textContent='▷';thumb.appendChild(overlay);
  const title=document.createElement('div');title.className='vt-title';title.textContent=v.title;thumb.appendChild(title);
  thumb.addEventListener('click',()=>{vmVideo.src=v.src;modal.classList.add('open');vmVideo.play()});
  gallery.appendChild(thumb);
});
