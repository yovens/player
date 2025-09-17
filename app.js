/* app.js for "Mr_Y Player" 
   - Place this file next to your HTML and keep the HTML IDs/classes as in your template.
   - Uses File System Access if available; IndexedDB for offline blobs.
*/

/* ====== Stateful data ====== */
let localSongs = []; // {name,url,title,artist,cover,blobKey?, fileObj?}
let playCounts = {};
let recent = [];
let playlists = {};
let likedSongs = JSON.parse(localStorage.getItem('likedSongs') || '[]');
let currentIdx = -1;
let isShuffle = false;
let isRepeat = false;

/* ====== DOM refs (graceful) ====== */
const songsGrid = document.getElementById('songsGrid');
const importBtn = document.getElementById('importBtn');
const saveOfflineBtn = document.getElementById('saveOfflineBtn');
const miniBar = document.getElementById('miniBar');
const audioEl = document.getElementById('audioEl');
const miniTitle = document.getElementById('miniTitle');
const miniArtist = document.getElementById('miniArtist');
const miniCover = document.getElementById('miniCover');
const miniPlay = document.getElementById('miniPlay');
const miniPrev = document.getElementById('miniPrev');
const miniNext = document.getElementById('miniNext');
const openFull = document.getElementById('openFull');

const playerModal = document.getElementById('playerModal');
const pvArt = document.getElementById('pvArt');
const pvTitle = document.getElementById('pvTitle');
const pvArtist = document.getElementById('pvArtist');
const pvSeek = document.getElementById('pvSeek');
const pvCur = document.getElementById('pvCur');
const pvDur = document.getElementById('pvDur');
const pvPlay = document.getElementById('pvPlay');
const pvPrev = document.getElementById('pvPrev');
const pvNext = document.getElementById('pvNext');
const pvClose = document.getElementById('pvClose');
const pvCanvas = document.getElementById('pvCanvas');

const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const shuffleCheckbox = document.getElementById('shuffle');
const repeatCheckbox = document.getElementById('repeat');

const likedList = document.getElementById('likedList') || null;
const installBtn = document.getElementById('installBtn') || null;
const themeBtn = document.getElementById('themeBtn') || null;
const menuBtn = document.getElementById('menuBtn') || null;
const sideNav = document.getElementById('sideNav') || null;
const navItems = document.querySelectorAll('nav.side .nav-item') || [];

/* ====== Install prompt handling ====== */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.style.display = 'inline-flex';
});
if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.style.display = 'none';
  });
}

/* ====== Theme cycle (safe) ====== */
const themes = ['theme1','theme2','theme3','theme4','theme5'];
let currentTheme = 0;
if (themeBtn) themeBtn.addEventListener('click', ()=>{
  document.body.classList.remove(...themes);
  currentTheme = (currentTheme + 1) % themes.length;
  if(currentTheme !== 0) document.body.classList.add(themes[currentTheme]);
});

/* ====== Background bubbles (canvas) ====== */
(function setupBg(){
  const bgCanvas = document.getElementById('bgCanvas');
  if(!bgCanvas) return;
  const ctx = bgCanvas.getContext('2d');
  let bubbles = [];
  function resize(){ bgCanvas.width = innerWidth; bgCanvas.height = innerHeight; }
  function init(){
    bubbles = [];
    for(let i=0;i<20;i++){
      bubbles.push({
        x: Math.random()*bgCanvas.width,
        y: Math.random()*bgCanvas.height,
        r: 8 + Math.random()*36,
        dx: (Math.random()-0.5)*0.6,
        dy: (Math.random()-0.5)*0.6,
        hue: Math.random()*360
      });
    }
  }
  function draw(){
    requestAnimationFrame(draw);
    ctx.clearRect(0,0,bgCanvas.width,bgCanvas.height);
    for(const b of bubbles){
      b.x += b.dx; b.y += b.dy; b.hue = (b.hue + 0.05) % 360;
      if(b.x < -60) b.x = bgCanvas.width + 60;
      if(b.x > bgCanvas.width + 60) b.x = -60;
      if(b.y < -60) b.y = bgCanvas.height + 60;
      if(b.y > bgCanvas.height + 60) b.y = -60;
      const g = ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r);
      g.addColorStop(0, `hsla(${b.hue} 80% 60% / 0.12)`);
      g.addColorStop(1,'transparent');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill();
    }
  }
  window.addEventListener('resize', resize);
  resize(); init(); draw();
})();

/* ====== IndexedDB helpers ====== */
const IDB_NAME = 'mry-music-store', IDB_STORE = 'files';
function openDb(){ return new Promise((res,rej)=>{ const r = indexedDB.open(IDB_NAME,1); r.onupgradeneeded = e => { const db = e.target.result; if(!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE); }; r.onsuccess = e => res(e.target.result); r.onerror = e => rej(e); });}
async function saveBlob(key, blob){ const db = await openDb(); return new Promise((res,rej)=>{ const tx = db.transaction(IDB_STORE,'readwrite'); tx.objectStore(IDB_STORE).put(blob,key); tx.oncomplete = ()=> res(true); tx.onerror = e => rej(e); });}
async function getBlob(key){ const db = await openDb(); return new Promise((res,rej)=>{ const tx = db.transaction(IDB_STORE,'readonly'); const req = tx.objectStore(IDB_STORE).get(key); req.onsuccess = e => res(e.target.result); req.onerror = e => rej(e); });}

/* ====== Render songs (Lark-like cards) ====== */
function renderSongs(list = localSongs){
  if(!songsGrid) return;
  songsGrid.innerHTML = '';
  list.forEach((s, idx)=>{
    const card = document.createElement('div');
    card.className = 'card';
    // pretty duration if present
    const cover = s.cover || `https://picsum.photos/400/400?random=${idx}`;
    const liked = likedSongs.includes(s.name);
    card.innerHTML = `
      <div class="card-inner">
        <img class="art" src="${cover}" alt="">
        <div class="info">
          <div class="title-row">
            <div class="title">${escapeHtml(s.title||s.name)}</div>
            <div class="duration">${s.duration?secs(s.duration):''}</div>
          </div>
          <div class="meta">${escapeHtml(s.artist||'Inconnu')}</div>
          <div class="card-actions">
            <button class="btn play-btn" data-idx="${idx}">▶️</button>
            <button class="btn like-btn" data-idx-like="${idx}">${liked ? '❤️' : '🤍'}</button>
          </div>
        </div>
      </div>
    `;
    // events
    card.querySelector('.play-btn')?.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      openSong(idx);
    });
    card.querySelector('.like-btn')?.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      toggleLike(localSongs[idx]);
    });
    card.addEventListener('click', ()=> openSong(idx));
    songsGrid.appendChild(card);
  });
  applyParallaxOnCards();
  renderLikedList();
}

/* liked list render */
function renderLikedList(){
  if(!likedList) return;
  likedList.innerHTML = '';
  likedSongs.forEach(name=>{
    const li = document.createElement('li');
    li.innerHTML = `${escapeHtml(name)} <button class="btn small" onclick="playByName('${name}')">▶️</button>`;
    likedList.appendChild(li);
  });
}

/* ====== Like toggle ====== */
function toggleLike(song){
  const i = likedSongs.indexOf(song.name);
  if(i>=0) likedSongs.splice(i,1);
  else likedSongs.push(song.name);
  localStorage.setItem('likedSongs', JSON.stringify(likedSongs));
  renderSongs();
}

/* ====== Play / open song ====== */
async function openSong(idx){
  if(idx < 0 || idx >= localSongs.length) return;
  currentIdx = idx;
  const s = localSongs[idx];
  // choose blob if saved
  if(s.blobKey){
    try{
      const b = await getBlob(s.blobKey);
      if(b) audioEl.src = URL.createObjectURL(b);
      else audioEl.src = s.url;
    }catch{ audioEl.src = s.url; }
  } else {
    audioEl.src = s.url;
  }

  // update UI
  pvArt && (pvArt.src = s.cover || `https://picsum.photos/800/800?random=${idx}`);
  pvTitle && (pvTitle.textContent = s.title || s.name);
  pvArtist && (pvArtist.textContent = s.artist || 'Inconnu');
  miniCover && (miniCover.src = s.cover || pvArt.src);
  miniTitle && (miniTitle.textContent = s.title || s.name);
  miniArtist && (miniArtist.textContent = s.artist || 'Inconnu');
  miniBar && (miniBar.style.display = 'flex');
  playerModal && (playerModal.style.display = 'flex', playerModal.setAttribute('aria-hidden','false'));

  try { await audioEl.play(); } catch (e) { /* autoplay blocked until interaction */ }

  setupAudio(); // audio context + visualizer
  // stats
  playCounts[s.name] = (playCounts[s.name]||0) + 1;
  recent.unshift(s.name); recent = [...new Set(recent)].slice(0,30);
  updateLists();
  // media session (best-effort)
  if('mediaSession' in navigator){
    try{
      navigator.mediaSession.metadata = new MediaMetadata({ title: s.title||s.name, artist: s.artist||'', artwork: [{src:s.cover||'', sizes:"512x512", type:"image/png"}] });
      navigator.mediaSession.setActionHandler('play', ()=> audioEl.play());
      navigator.mediaSession.setActionHandler('pause', ()=> audioEl.pause());
      navigator.mediaSession.setActionHandler('previoustrack', ()=> prevSong());
      navigator.mediaSession.setActionHandler('nexttrack', ()=> nextSong());
    }catch(e){}
  }
}

/* ====== Audio context & visualizer ====== */
let audioCtx, srcNode, analyser, dataArr, filterL, filterM, filterH, rafId;
const pvCtx = pvCanvas ? pvCanvas.getContext('2d') : null;

function setupAudio(){
  if(!pvCanvas || !pvCtx) return;
  if(!audioCtx){
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    try{
      srcNode = audioCtx.createMediaElementSource(audioEl);
    } catch(e){
      // If creation fails, skip visualizer
      srcNode = null;
    }
    filterL = audioCtx.createBiquadFilter(); filterL.type = 'lowshelf'; filterL.frequency.value = 200;
    filterM = audioCtx.createBiquadFilter(); filterM.type = 'peaking'; filterM.frequency.value = 1000; filterM.Q.value = 1;
    filterH = audioCtx.createBiquadFilter(); filterH.type = 'highshelf'; filterH.frequency.value = 3000;
    analyser = audioCtx.createAnalyser(); analyser.fftSize = 256;
    dataArr = new Uint8Array(analyser.frequencyBinCount);
    if(srcNode){
      srcNode.connect(filterL);
      filterL.connect(filterM);
      filterM.connect(filterH);
      filterH.connect(analyser);
      analyser.connect(audioCtx.destination);
    } else {
      // fallback: connect audio element to destination only
      // (visualizer won't work)
    }
    drawViz();
  }
}

function drawViz(){
  if(!pvCanvas || !pvCtx || !analyser) return;
  rafId = requestAnimationFrame(drawViz);
  analyser.getByteFrequencyData(dataArr);
  const w = pvCanvas.clientWidth, h = pvCanvas.clientHeight;
  pvCanvas.width = w * devicePixelRatio; pvCanvas.height = h * devicePixelRatio;
  pvCtx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
  pvCtx.clearRect(0,0,w,h);
  const bars = 48;
  const step = Math.floor(dataArr.length / bars);
  let x = 0; const barW = Math.max(2, (w / bars) - 2);
  for(let i=0;i<bars;i++){
    const v = dataArr[i*step];
    const H = (v/255) * h;
    pvCtx.fillStyle = `rgba(${120 + v/2}, ${80}, ${200 - v/3}, 0.95)`;
    pvCtx.fillRect(x, h - H, barW, H);
    x += barW + 2;
  }
}

/* ====== Seek UI updates ====== */
audioEl.addEventListener('loadedmetadata', ()=>{
  if(pvSeek) pvSeek.max = Math.floor(audioEl.duration) || 0;
  if(pvDur) pvDur.textContent = secs(audioEl.duration);
});
audioEl.addEventListener('timeupdate', ()=>{
  if(pvSeek) pvSeek.value = Math.floor(audioEl.currentTime);
  if(pvCur) pvCur.textContent = secs(audioEl.currentTime);
  // progress on current card (if visible)
  const cards = document.querySelectorAll('.card');
  if(currentIdx>=0 && cards[currentIdx]){
    const span = cards[currentIdx].querySelector('.progress-bar');
    if(span && audioEl.duration) span.style.width = (audioEl.currentTime / audioEl.duration * 100) + '%';
  }
});
if(pvSeek) pvSeek.addEventListener('input', ()=> audioEl.currentTime = Number(pvSeek.value || 0));

/* ====== Player controls wiring (safely) ====== */
function togglePlay(){
  if(audioEl.paused) { audioEl.play(); if(pvPlay) pvPlay.textContent='⏸️'; if(miniPlay) miniPlay.textContent='⏸️'; }
  else { audioEl.pause(); if(pvPlay) pvPlay.textContent='▶️'; if(miniPlay) miniPlay.textContent='▶️'; }
}
if(pvPlay) pvPlay.addEventListener('click', togglePlay);
if(miniPlay) miniPlay.addEventListener('click', togglePlay);
if(pvPrev) pvPrev.addEventListener('click', prevSong);
if(pvNext) pvNext.addEventListener('click', nextSong);
if(miniPrev) miniPrev.addEventListener('click', prevSong);
if(miniNext) miniNext.addEventListener('click', nextSong);
if(pvClose) pvClose.addEventListener('click', ()=>{ if(playerModal){ playerModal.style.display='none'; playerModal.setAttribute('aria-hidden','true'); } });

function nextSong(){
  if(!localSongs.length) return;
  if(isShuffle){ currentIdx = Math.floor(Math.random()*localSongs.length); openSong(currentIdx); return; }
  if(currentIdx < localSongs.length-1) openSong(currentIdx+1);
  else if(isRepeat) openSong(0);
}
function prevSong(){
  if(currentIdx>0) openSong(currentIdx-1);
}

/* end of track */
audioEl.addEventListener('ended', ()=>{
  if(isRepeat) openSong(currentIdx);
  else nextSong();
});

/* ====== Nav switching no flicker ====== */
const sections = document.querySelectorAll('main.view section');
navItems.forEach(n => n.addEventListener('click', ()=>{
  navItems.forEach(x => x.classList.remove('active'));
  n.classList.add('active');
  const t = n.dataset.target;
  sections.forEach(s => {
    if(s.id === t){ s.hidden = false; s.classList.add('active'); }
    else { s.hidden = true; s.classList.remove('active'); }
  });
}));

/* ====== Import folder (File System Access) ====== */
if(importBtn) importBtn.addEventListener('click', async ()=>{
  if(!window.showDirectoryPicker) return alert('Votre navigateur ne supporte pas la sélection de dossier (utilisez Chrome/Edge récent).');
  try{
    const dir = await window.showDirectoryPicker();
    localSongs = [];
    for await (const entry of dir.values()){
      if(entry.kind === 'file' && /\.(mp3|wav|ogg|m4a)$/i.test(entry.name)){
        const file = await entry.getFile();
        const url = URL.createObjectURL(file);
        // try to read metadata? keep simple
        localSongs.push({ name: entry.name, url, title: entry.name.replace(/\.\w+$/, ''), artist: '', cover: '', blobKey: null, fileObj: file });
      }
    }
    renderSongs();
  }catch(err){
    console.warn(err);
    alert('Sélection annulée ou non supportée.');
  }
});

/* ====== Save all offline ====== */
if(saveOfflineBtn) saveOfflineBtn.addEventListener('click', async ()=>{
  if(!localSongs.length) return alert('Aucune chanson à sauvegarder');
  if(!confirm('Sauvegarder toutes les chansons visibles pour lecture hors-ligne ?')) return;
  for(const s of localSongs){
    try{
      if(s.fileObj) await saveBlob(s.name, s.fileObj);
      else { const r = await fetch(s.url); const b = await r.blob(); await saveBlob(s.name, b); }
      s.blobKey = s.name;
    }catch(e){ console.warn('save fail', e); }
  }
  alert('Sauvegarde terminée (IndexedDB)');
});

/* ====== Search: filter + click to play ====== */
if(searchInput){
  searchInput.addEventListener('input', ()=>{
    const q = searchInput.value.trim().toLowerCase();
    if(!q) { renderSongs(); return; }
    const filtered = localSongs.filter(s => (s.title||s.name).toLowerCase().includes(q) || (s.artist||'').toLowerCase().includes(q));
    renderSongs(filtered);
    // highlight search matches (simple)
    Array.from(document.querySelectorAll('.card .title')).forEach(el=>{
      if(q && el.textContent.toLowerCase().includes(q)){
        el.parentElement.parentElement.style.boxShadow = '0 10px 30px rgba(0,212,255,0.08)';
      }
    });
  });
}

/* ====== Sorting / shuffle / repeat ====== */
if(sortSelect) sortSelect.addEventListener('change', ()=>{
  const v = sortSelect.value;
  if(v === 'alpha') localSongs.sort((a,b)=> (a.title||a.name).localeCompare(b.title||b.name));
  else if(v === 'plays') localSongs.sort((a,b)=> (playCounts[b.name]||0) - (playCounts[a.name]||0));
  renderSongs();
});
if(shuffleCheckbox) shuffleCheckbox.addEventListener('change', ()=> isShuffle = shuffleCheckbox.checked);
if(repeatCheckbox) repeatCheckbox.addEventListener('change', ()=> isRepeat = repeatCheckbox.checked);

/* ====== Play by name global helper ====== */
window.playByName = function(name){
  const idx = localSongs.findIndex(s => s.name === name);
  if(idx >= 0) openSong(idx);
};

/* ====== Update lists (recent/popular) ====== */
function updateLists(){
  const recentEl = document.getElementById('recentList');
  const popularEl = document.getElementById('popularList');
  if(recentEl) { recentEl.innerHTML = ''; recent.slice(0,20).forEach(n => { const li = document.createElement('li'); li.innerHTML = `${escapeHtml(n)} <button class="btn" onclick="playByName('${n}')">▶️</button>`; recentEl.appendChild(li); }); }
  if(popularEl){
    popularEl.innerHTML = '';
    const sorted = Object.entries(playCounts).sort((a,b)=>b[1]-a[1]).slice(0,20);
    sorted.forEach(([name,count])=>{ const li = document.createElement('li'); li.innerHTML = `${escapeHtml(name)} (${count}) <button class="btn" onclick="playByName('${name}')">▶️</button>`; popularEl.appendChild(li); });
  }
}

/* ====== Utils ====== */
function secs(n){ if(!isFinite(n)) return '0:00'; n = Math.floor(n); return Math.floor(n/60) + ':' + String(n%60).padStart(2,'0'); }
function escapeHtml(s){ return (s||'').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ====== Parallax effect on cards when scrolling ====== */
function applyParallaxOnCards(){
  const grid = songsGrid;
  if(!grid) return;
  function onScroll(){
    const cards = grid.querySelectorAll('.card');
    const mid = window.innerHeight / 2;
    cards.forEach((card, i) => {
      const rect = card.getBoundingClientRect();
      const offset = (rect.top + rect.height/2 - mid) * 0.03; // smaller multiplier for subtle effect
      card.style.transform = `translateY(${offset}px)`;
      card.style.transition = 'transform 0.25s ease-out';
    });
  }
  grid.addEventListener('scroll', onScroll, {passive:true});
  window.addEventListener('scroll', onScroll, {passive:true});
  onScroll();
}

/* ====== Keyboard shortcuts ====== */
window.addEventListener('keydown', (e)=>{
  if(e.key === ' '){ e.preventDefault(); togglePlay(); }
  if(e.key === '.') nextSong();
  if(e.key === ',') prevSong();
});

/* ====== Service worker register (PWA) ====== */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=> {
    navigator.serviceWorker.register('./service-worker.js').catch(()=>{/* ignore */});
  });
}

/* ====== Init: render empty UI + attach safe event listeners ====== */
(function init(){
  renderSongs();
  renderPlaylists();
  updateLists();
  // wire some safe elements that may exist
  if(openFull) openFull.addEventListener('click', ()=> { if(playerModal) playerModal.style.display = 'flex'; });
  if(menuBtn && sideNav) menuBtn.addEventListener('click', ()=> sideNav.classList.toggle('active'));
})();

/* ====== Render playlists stub (keeps original logic) ====== */
function renderPlaylists(){
  const area = document.getElementById('playlistsArea');
  if(!area) return;
  area.innerHTML = '';
  for(const [name,arr] of Object.entries(playlists)){
    const div = document.createElement('div');
    div.style.display = 'flex'; div.style.alignItems = 'center'; div.style.gap = '8px'; div.style.marginBottom = '8px';
    const t = document.createElement('div'); t.textContent = name + ' ('+arr.length+')'; t.style.fontWeight = '700';
    const addBtn = document.createElement('button'); addBtn.textContent = 'Ajouter la chanson en cours'; addBtn.className = 'btn';
    addBtn.addEventListener('click', ()=> { if(currentIdx>=0) { playlists[name].push(localSongs[currentIdx].name); alert('Ajouté'); renderPlaylists(); }});
    const delBtn = document.createElement('button'); delBtn.textContent = 'Supprimer'; delBtn.className = 'btn';
    delBtn.addEventListener('click', ()=> { if(confirm('Supprimer playlist ?')){ delete playlists[name]; renderPlaylists(); }});
    div.appendChild(t); div.appendChild(addBtn); div.appendChild(delBtn);
    area.appendChild(div);
  }
}

/* ====== Safety: export a couple of helpers in global scope (used by inline handlers) ====== */
window.toggleLike = toggleLike;
window.openSong = openSong;
window.renderSongs = renderSongs;

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("searchInput");
  const clearSearch = document.getElementById("clearSearch");
  const songs = document.querySelectorAll(".card");

  if (!searchInput) {
    console.error("⚠️ searchInput introuvable dans le HTML !");
    return;
  }

  // Filtrer les chansons
  searchInput.addEventListener("input", () => {
    const query = searchInput.value.toLowerCase();
    songs.forEach(song => {
      const title = song.querySelector(".title").textContent.toLowerCase();
      const artist = song.querySelector(".meta").textContent.toLowerCase();
      song.style.display =
        title.includes(query) || artist.includes(query) ? "flex" : "none";
    });
  });

  // Bouton clear
  if (clearSearch) {
    clearSearch.addEventListener("click", () => {
      searchInput.value = "";
      songs.forEach(song => (song.style.display = "flex"));
    });
  }
});
// ---- Fix: safe DOM init + alpha bar + patch renderSongs ----
document.addEventListener('DOMContentLoaded', () => {

  // récupérer éléments (ils existent maintenant)
  const songsGrid = document.getElementById('songsGrid');
  if (!songsGrid) {
    console.error('Impossible de trouver #songsGrid — vérifie que l\'HTML contient <div id="songsGrid">');
    return;
  }

  // créer / insérer la barre alphabétique si elle n'existe pas
  let alphaBar = document.getElementById('alphaBar');
  if (!alphaBar) {
    const container = document.createElement('div');
    container.className = 'songs-container'; // tu peux styliser .songs-container en CSS
    // replace songsGrid with container -> songsGrid becomes a child
    songsGrid.parentNode.insertBefore(container, songsGrid);
    container.appendChild(songsGrid);

    alphaBar = document.createElement('div');
    alphaBar.id = 'alphaBar';
    alphaBar.className = 'alpha-bar';
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    alphaBar.innerHTML = letters.map(l => `<span>${l}</span>`).join('');
    container.appendChild(alphaBar);
  }

  // helper: mettre data-title sur chaque carte (titre en minuscule)
  function ensureDataTitles() {
    document.querySelectorAll('#songsGrid .card').forEach(card => {
      const tEl = card.querySelector('.title');
      const title = (tEl ? tEl.textContent.trim() : (card.dataset && card.dataset.title) || '');
      card.dataset.title = title;
    });
  }

  // ajouter clics sur lettres
  alphaBar.querySelectorAll('span').forEach(span => {
    span.addEventListener('click', () => {
      const letter = span.textContent.trim().toLowerCase();
      ensureDataTitles();
      // trouver la première carte qui commence par letter
      const cards = Array.from(document.querySelectorAll('#songsGrid .card'));
      const target = cards.find(c => {
        const t = (c.dataset.title || '').trim().toLowerCase();
        return t && t.charAt(0) === letter;
      });
      if (target) {
        // scroll dans le container (smooth)
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // focus visuel
        target.classList.add('flash-target');
        setTimeout(()=> target.classList.remove('flash-target'), 900);
      } else {
        // si aucune chanson, on peut faire un petit retour visuel (optionnel)
        span.classList.add('alpha-empty');
        setTimeout(()=> span.classList.remove('alpha-empty'), 500);
      }
    });
  });

  // --- Patch renderSongs si ta fonction existe déjà ---
  // Si tu as une fonction globale renderSongs(), on la wrappe pour garantir data-title.
  if (typeof window.renderSongs === 'function') {
    const originalRender = window.renderSongs;
    window.renderSongs = function(list = undefined) {
      // appeler l'original
      const res = originalRender(list);
      // et ensuite fixer les data-title et re-attacher listeners de play (si nécessaire)
      ensureDataTitles();
      // si tu as des boutons play .btn[data-idx], on les rattache ici
      document.querySelectorAll('#songsGrid .card').forEach((card, idx) => {
        const playBtn = card.querySelector('[data-idx]');
        if (playBtn && !playBtn._hasListener) {
          playBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const i = Number(playBtn.dataset.idx);
            if (!isNaN(i) && typeof window.openSong === 'function') window.openSong(i);
          });
          playBtn._hasListener = true;
        }
      });
      return res;
    };
  } else {
    // Sinon, si tu n'as pas renderSongs, on crée une version simple (fallback)
    window.renderSongs = function(list = window.localSongs || []) {
      songsGrid.innerHTML = '';
      list.forEach((s, idx) => {
        const el = document.createElement('div');
        el.className = 'card';
        const title = (s.title || s.name || 'Titre').toString();
        el.dataset.title = title;
        el.innerHTML = `
          <img class="art" src="${s.cover||'https://picsum.photos/200/200?random='+idx}" alt="">
          <div class="title">${escapeHtml(title)}</div>
          <div class="meta">${escapeHtml(s.artist||'Inconnu')}</div>
          <div class="card-actions">
            <button class="btn" data-idx="${idx}">▶️ Jouer</button>
          </div>`;
        songsGrid.appendChild(el);
        el.querySelector('[data-idx]')?.addEventListener('click', (e)=> {
          e.stopPropagation();
          if (typeof window.openSong === 'function') window.openSong(idx);
        });
      });
    };
  }

  // style helper pour faire ressortir la cible quand on scrolle
  const style = document.createElement('style');
  style.textContent = `
    .flash-target{ box-shadow:0 8px 30px rgba(0,212,255,0.18); transform: translateY(-4px); transition: all .25s ease; }
    .alpha-bar span.alpha-empty { opacity: .4; transform: scale(.95); }
    /* si besoin, ajouter ici styles pour .songs-container et .alpha-bar */
  `;
  document.head.appendChild(style);

  // ready — si tu veux, force un premier render
  if (typeof window.renderSongs === 'function') window.renderSongs();
});





const canvas = document.getElementById('bgCanvas');
const ctx = canvas.getContext('2d');

let W = canvas.width = window.innerWidth;
let H = canvas.height = window.innerHeight;

// Générer les étoiles/planètes
const stars = [];
const starCount = 80; // nombre d'étoiles

for (let i = 0; i < starCount; i++) {
  stars.push({
    x: Math.random() * W,
    y: Math.random() * H,
    r: Math.random() * 8 + 4, // taille
    dx: (Math.random() - 0.5) * 1.5, // vitesse horizontale
    dy: (Math.random() - 0.5) * 1.5, // vitesse verticale
    color: `hsla(${Math.random()*360}, ${50 + Math.random()*50}%, ${40 + Math.random()*40}%, 0.8)`, // couleur espace
    glow: Math.random() * 15 + 5 // halo lumineux
  });
}

// Animation
function animateStars() {
  ctx.fillStyle = '#0a0a1a'; // fond profond
  ctx.fillRect(0, 0, W, H);

  stars.forEach(s => {
    // Halo lumineux
    const gradient = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.glow);
    gradient.addColorStop(0, s.color);
    gradient.addColorStop(1, 'transparent');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();

    // Déplacement
    s.x += s.dx;
    s.y += s.dy;

    // Rebond aux bords
    if (s.x < -s.r) s.x = W + s.r;
    if (s.x > W + s.r) s.x = -s.r;
    if (s.y < -s.r) s.y = H + s.r;
    if (s.y > H + s.r) s.y = -s.r;
  });

  requestAnimationFrame(animateStars);
}

animateStars();

// Adapter sur redimensionnement
window.addEventListener('resize', () => {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
});
