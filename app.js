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

/* ── Site data (loaded from data.json) ── */
let siteData = null;
let activeTracks = [];    /* filtered visible tracks for player */
let curTrack = 0;

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

/* ============================================================
   DYNAMIC CONTENT — load from data.json
   ============================================================ */

async function loadSiteData(){
  try{
    const r = await fetch('data.json?t='+Date.now());
    siteData = await r.json();
  }catch(e){
    console.error('Failed to load data.json',e);
    return;
  }
  renderHero(siteData.hero);
  renderPoems(siteData.poemSections);
  renderVideos(siteData.videos);
  renderTracks(siteData.tracks);
  renderAbout(siteData.about);
}

/* ── HERO ── */
function renderHero(h){
  if(!h) return;
  const el = id => document.getElementById(id);
  if(el('heroName1')) el('heroName1').innerHTML = h.name1;
  if(el('heroName2')) el('heroName2').innerHTML = h.name2;
  if(el('heroMotto')) el('heroMotto').innerHTML = h.motto;
  if(el('heroGreeting')) el('heroGreeting').innerHTML = h.greeting;
  if(el('heroButton')) el('heroButton').innerHTML = h.buttonText;
}

/* ── POEMS ── */
function renderPoems(sections){
  const container = document.getElementById('poemsContainer');
  if(!container || !sections) return;
  container.innerHTML = '';

  sections.filter(s=>s.visible).forEach(sec=>{
    const wrap = document.createElement('div');
    wrap.className = 'poems-section';

    const title = document.createElement('h3');
    title.className = 'poems-section-title';
    title.textContent = sec.title;
    wrap.appendChild(title);

    const slider = document.createElement('div');
    slider.className = 'poems-slider';

    sec.poems.filter(p=>p.visible).forEach(poem=>{
      const card = document.createElement('div');
      card.className = 'poem-card card reveal';
      card.innerHTML = `<p class="poem-text">${poem.text}</p><span class="poem-author">${poem.author}</span>`;
      slider.appendChild(card);
    });

    wrap.appendChild(slider);
    container.appendChild(wrap);
  });
}

/* ── VIDEOS ── */
function parseYouTubeUrl(url){
  if(!url) return null;
  let m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if(m) return { id:m[1], embed:'https://www.youtube.com/embed/'+m[1], thumb:'https://img.youtube.com/vi/'+m[1]+'/hqdefault.jpg' };
  return null;
}

function renderVideos(videos){
  const gallery = document.getElementById('videoGallery');
  if(!gallery || !videos) return;
  gallery.innerHTML = '';

  /* video modal */
  let modal = document.querySelector('.video-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.className = 'video-modal';
    modal.innerHTML = '<button class="vm-close">✕</button><video class="vm-video" controls playsinline></video><div class="vm-iframe-wrap" style="display:none"><iframe class="vm-iframe" allowfullscreen allow="autoplay"></iframe></div>';
    document.body.appendChild(modal);
    const vmVideo = modal.querySelector('.vm-video');
    const vmIframe = modal.querySelector('.vm-iframe');
    const vmIframeWrap = modal.querySelector('.vm-iframe-wrap');
    modal.querySelector('.vm-close').addEventListener('click',()=>{modal.classList.remove('open');vmVideo.pause();vmVideo.src='';vmIframe.src='';vmIframeWrap.style.display='none';vmVideo.style.display=''});
    modal.addEventListener('click',e=>{if(e.target===modal){modal.classList.remove('open');vmVideo.pause();vmVideo.src='';vmIframe.src='';vmIframeWrap.style.display='none';vmVideo.style.display=''}});
  }
  const vmVideo = modal.querySelector('.vm-video');
  const vmIframe = modal.querySelector('.vm-iframe');
  const vmIframeWrap = modal.querySelector('.vm-iframe-wrap');

  videos.filter(v=>v.visible).forEach(v=>{
    const yt = parseYouTubeUrl(v.src);
    const orient = v.orientation || 'portrait';
    const thumb = document.createElement('div');
    thumb.className = 'video-thumb video-thumb--' + orient;

    if(yt){
      /* YouTube thumbnail */
      const img = document.createElement('img');
      img.src = yt.thumb;
      img.alt = v.title;
      img.loading = 'lazy';
      thumb.appendChild(img);
    } else {
      /* Regular video file */
      const vid = document.createElement('video');
      vid.src = v.src;
      vid.preload = 'metadata';
      vid.muted = true;
      vid.playsInline = true;
      vid.addEventListener('loadedmetadata',()=>{
        vid.currentTime = 0.5;
        /* auto-detect orientation if not specified */
        if(!v.orientation && vid.videoWidth && vid.videoHeight){
          const detectedOrient = vid.videoWidth > vid.videoHeight ? 'landscape' : 'portrait';
          thumb.className = 'video-thumb video-thumb--' + detectedOrient;
        }
      });
      thumb.appendChild(vid);
    }

    const overlay = document.createElement('div');
    overlay.className = 'vt-play';
    overlay.textContent = '▷';
    thumb.appendChild(overlay);

    const titleEl = document.createElement('div');
    titleEl.className = 'vt-title';
    titleEl.textContent = v.title;
    thumb.appendChild(titleEl);

    thumb.addEventListener('click',()=>{
      if(yt){
        vmVideo.style.display = 'none';
        vmIframeWrap.style.display = '';
        vmIframe.src = yt.embed + '?autoplay=1';
      } else {
        vmIframeWrap.style.display = 'none';
        vmVideo.style.display = '';
        vmVideo.src = v.src;
        vmVideo.play();
      }
      modal.classList.add('open');
    });

    gallery.appendChild(thumb);
  });
}

/* ── MUSIC PLAYER ── */
function renderTracks(tracks){
  if(!tracks) return;
  activeTracks = tracks.filter(t=>t.visible);
  curTrack = 0;

  const audio = document.getElementById('audioEl');
  const playBtn = document.getElementById('playBtn');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const progressWrap = document.getElementById('progressWrap');
  const progressBar = document.getElementById('progressBar');
  const curTimeEl = document.getElementById('curTime');
  const durTimeEl = document.getElementById('durTime');
  const npTitle = document.getElementById('npTitle');
  const playlist = document.getElementById('playlist');

  if(!audio || !playlist) return;

  /* render playlist items */
  playlist.innerHTML = '';
  activeTracks.forEach((t,i)=>{
    const el = document.createElement('div');
    el.className = 'track' + (i===0?' active':'');
    el.dataset.idx = i;
    el.innerHTML = `<span class="t-num">${String(i+1).padStart(2,'0')}</span><span class="t-name">${t.name}</span>`;
    el.addEventListener('click',()=>{loadTrack(i);audio.play();playBtn.textContent='⏸'});
    playlist.appendChild(el);
  });

  function loadTrack(i){
    curTrack = i;
    audio.src = activeTracks[i].src;
    npTitle.textContent = activeTracks[i].name;
    playlist.querySelectorAll('.track').forEach((t,j)=>t.classList.toggle('active',j===i));
  }

  function fmt(s){
    if(!s||isNaN(s))return'0:00';
    const m=Math.floor(s/60),sec=Math.floor(s%60);
    return m+':'+(sec<10?'0':'')+sec;
  }

  /* set initial title */
  if(activeTracks.length > 0){
    npTitle.textContent = activeTracks[0].name;
  }

  playBtn.addEventListener('click',()=>{
    if(audio.paused){
      if(!audio.src && activeTracks.length>0) loadTrack(0);
      audio.play();
      playBtn.textContent='⏸';
    }else{
      audio.pause();
      playBtn.textContent='▶';
    }
  });
  prevBtn.addEventListener('click',()=>{
    if(activeTracks.length===0)return;
    loadTrack((curTrack-1+activeTracks.length)%activeTracks.length);
    audio.play();playBtn.textContent='⏸';
  });
  nextBtn.addEventListener('click',()=>{
    if(activeTracks.length===0)return;
    loadTrack((curTrack+1)%activeTracks.length);
    audio.play();playBtn.textContent='⏸';
  });
  audio.addEventListener('timeupdate',()=>{
    if(audio.duration){
      progressBar.style.width=(audio.currentTime/audio.duration*100)+'%';
      curTimeEl.textContent=fmt(audio.currentTime);
      durTimeEl.textContent=fmt(audio.duration);
    }
  });
  audio.addEventListener('ended',()=>{
    if(activeTracks.length===0)return;
    loadTrack((curTrack+1)%activeTracks.length);
    audio.play();
  });
  progressWrap.addEventListener('click',e=>{
    if(audio.duration){audio.currentTime=(e.offsetX/progressWrap.offsetWidth)*audio.duration}
  });
}

/* ── ABOUT ── */
function renderAbout(about){
  if(!about) return;
  const el = id => document.getElementById(id);
  if(el('aboutLead')) el('aboutLead').innerHTML = about.lead;
  const pWrap = el('aboutParagraphs');
  if(pWrap && about.paragraphs){
    pWrap.innerHTML = '';
    about.paragraphs.forEach(text=>{
      const p = document.createElement('p');
      p.innerHTML = text;
      pWrap.appendChild(p);
    });
  }
  if(el('footerText')) el('footerText').innerHTML = about.footer;
  if(el('footerSub')) el('footerSub').innerHTML = about.footerSub;
}

/* ── Init ── */
(async function init(){
  resize();
  await loadAllFrames();
  await loadSiteData();
  isReady=true;
  drawFrame(0);
  setTimeout(()=>{
    loader.classList.add('hidden');
    pages[0].classList.add('is-active');
  },400);
})();
