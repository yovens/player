/* ====== State ====== */
let localSongs = []; // {name,url,title,artist,cover,blobKey?, fileObj?}
let playCounts = {}; // name->count
let recent = []; // list of names
let playlists = {}; // name -> array of song names
let likedSongs = JSON.parse(localStorage.getItem("likedSongs")||"[]"); // store song names
let currentIdx = -1;
let isShuffle = false;
let isRepeat = false;

/* ====== UI refs ====== */
const navItems = document.querySelectorAll('nav.side .nav-item');
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
const eqLow = document.getElementById('eqLow'), eqMid = document.getElementById('eqMid'), eqHigh = document.getElementById('eqHigh');
const searchInput = document.getElementById('searchInput');
const createPlaylistBtn = document.getElementById('createPlaylistBtn');
const playlistsArea = document.getElementById('playlistsArea');
const sortSelect = document.getElementById('sortSelect');
const shuffleCheckbox = document.getElementById('shuffle');
const repeatCheckbox = document.getElementById('repeat');
const likedList = document.getElementById('likedList');
const installBtn = document.getElementById('installBtn');
const themeBtn = document.getElementById('themeBtn');
const menuBtn = document.getElementById('menuBtn');
const sideNav = document.getElementById('sideNav');

/* ====== Header actions ====== */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  installBtn.style.display='inline-flex';
});
installBtn.addEventListener('click', async ()=>{
  if(deferredPrompt){
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.style.display='none';
  }
});
const themes = ['theme1','theme2','theme3','theme4','theme5'];
let currentTheme = 0;
themeBtn.addEventListener('click', ()=>{
  document.body.classList.remove(...themes);
  currentTheme = (currentTheme+1)%themes.length;
  if(currentTheme>0) document.body.classList.add(themes[currentTheme]);
});

menuBtn.addEventListener('click', ()=> sideNav.classList.toggle('active'));

/* ====== Background bubbles ====== */
const bgCanvas = document.getElementById('bgCanvas');
const bgCtx = bgCanvas.getContext('2d');
let bubbles = [];
function resizeBg(){ bgCanvas.width = innerWidth; bgCanvas.height = innerHeight; }
window.addEventListener('resize', resizeBg); resizeBg();
function initBubbles(){
  bubbles = [];
  for(let i=0;i<18;i++){
    bubbles.push({x:Math.random()*bgCanvas.width,y:Math.random()*bgCanvas.height,
      r:8+Math.random()*32,dx:(Math.random()-0.5)*0.5,dy:(Math.random()-0.5)*0.5,
      color:`hsl(${Math.random()*360} 80% 60% / 0.12)`});
  }
}
function drawBubbles(){
  requestAnimationFrame(drawBubbles);
  bgCtx.clearRect(0,0,bgCanvas.width,bgCanvas.height);
  bubbles.forEach(b=>{
    b.x += b.dx; b.y += b.dy;
    if(b.x< -50) b.x = bgCanvas.width+50;
    if(b.x>bgCanvas.width+50) b.x=-50;
    if(b.y< -50) b.y = bgCanvas.height+50;
    if(b.y>bgCanvas.height+50) b.y=-50;
    const g = bgCtx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r);
    g.addColorStop(0,b.color); g.addColorStop(1,'transparent');
    bgCtx.fillStyle = g; bgCtx.beginPath(); bgCtx.arc(b.x,b.y,b.r,0,Math.PI*2); bgCtx.fill();
  });
}
initBubbles(); drawBubbles();

/* ====== IndexedDB helper for offline storage ====== */
const IDB_NAME = 'mry-music-store', IDB_STORE='files';
function openDb(){ return new Promise((res,rej)=>{ const r=indexedDB.open(IDB_NAME,1); r.onupgradeneeded=e=>{ const db=e.target.result; if(!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE); }; r.onsuccess=e=>res(e.target.result); r.onerror=e=>rej(e); });}
async function saveBlob(key,blob){
  const db = await openDb();
  return new Promise((res,rej)=>{ const tx = db.transaction(IDB_STORE,'readwrite'); tx.objectStore(IDB_STORE).put(blob,key); tx.oncomplete=()=>res(true); tx.onerror=e=>rej(e); });
}
async function getBlob(key){
  const db = await openDb();
  return new Promise((res,rej)=>{ const tx = db.transaction(IDB_STORE,'readonly'); const req = tx.objectStore(IDB_STORE).get(key); req.onsuccess=e=>res(e.target.result); req.onerror=e=>rej(e); });
}

/* ====== Render functions ====== */
function renderSongs(list = localSongs){
  songsGrid.innerHTML = '';
  list.forEach((s, idx)=>{
    const el = document.createElement('div'); el.className='card';
    const cover = s.cover || `https://picsum.photos/600/600?random=${idx}`;
    const liked = likedSongs.includes(s.name);
    el.innerHTML = `<img class="art" src="${cover}" alt="">
      <div class="title">${escapeHtml(s.title||s.name)}</div>
      <div class="meta">${escapeHtml(s.artist||'Inconnu')}</div>
      <div class="card-actions">
        <button class="btn" data-idx="${idx}">▶️ Jouer</button>
        <button class="btn like" data-like="${idx}">${liked?'❤️':'🤍'} J'aime</button>
      </div>`;
    el.querySelector('[data-idx]')?.addEventListener('click', (ev)=>{ openSong(idx); ev.stopPropagation(); });
    el.querySelector('[data-like]')?.addEventListener('click', (ev)=>{ toggleLike(localSongs[idx]); ev.stopPropagation(); });
    el.addEventListener('click', ()=> openSong(idx));
    songsGrid.appendChild(el);
  });
  renderLikedList();
}

function renderLikedList(){
  likedList.innerHTML = '';
  likedSongs.forEach(name=>{
    const li = document.createElement('li');
    li.innerHTML = `${escapeHtml(name)} <button class="btn" onclick="playByName('${name}')">▶️</button>`;
    likedList.appendChild(li);
  });
}

/* ====== Like handling ====== */
function toggleLike(song){
  const i = likedSongs.indexOf(song.name);
  if(i>=0) likedSongs.splice(i,1); else likedSongs.push(song.name);
  localStorage.setItem("likedSongs", JSON.stringify(likedSongs));
  renderSongs();
}

/* ====== Song open / play ====== */
async function openSong(idx){
  currentIdx = idx;
  const s = localSongs[idx];
  // blob first if available
  if(s.blobKey){
    const b = await getBlob(s.blobKey);
    if(b){ const u = URL.createObjectURL(b); audioEl.src = u; }
    else audioEl.src = s.url;
  } else audioEl.src = s.url;
  // update UI
  pvArt.src = s.cover || `https://picsum.photos/800/800?random=${idx}`;
  pvTitle.textContent = s.title || s.name;
  pvArtist.textContent = s.artist || 'Inconnu';
  miniCover.src = s.cover || pvArt.src;
  miniTitle.textContent = s.title || s.name;
  miniArtist.textContent = s.artist || 'Inconnu';
  miniBar.style.display = 'flex';
  playerModal.style.display = 'flex';
  playerModal.setAttribute('aria-hidden','false');
  try{ await audioEl.play(); }catch{ /* ignore */ }
  setupAudio();
  // stats
  playCounts[s.name] = (playCounts[s.name]||0)+1;
  recent.unshift(s.name); recent = [...new Set(recent)].slice(0,30);
  updateLists();
  // media session
  if('mediaSession' in navigator){
    try{
      navigator.mediaSession.metadata = new MediaMetadata({title:s.title||s.name,artist:s.artist||'',artwork:[{src:s.cover||'',sizes:"512x512",type:"image/png"}]});
      navigator.mediaSession.setActionHandler('play', ()=>audioEl.play());
      navigator.mediaSession.setActionHandler('pause', ()=>audioEl.pause());
      navigator.mediaSession.setActionHandler('previoustrack', ()=>prevSong());
      navigator.mediaSession.setActionHandler('nexttrack', ()=>nextSong());
    }catch{}
  }
}

/* ====== audio + visualizer + EQ ====== */
let audioCtx, srcNode, analyser, dataArr, filterL, filterM, filterH, rafId;
const pvCtx = pvCanvas.getContext('2d');
function setupAudio(){
  if(!audioCtx){
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    srcNode = audioCtx.createMediaElementSource(audioEl);
    filterL = audioCtx.createBiquadFilter(); filterL.type='lowshelf'; filterL.frequency.value=200;
    filterM = audioCtx.createBiquadFilter(); filterM.type='peaking'; filterM.frequency.value=1000; filterM.Q.value=1;
    filterH = audioCtx.createBiquadFilter(); filterH.type='highshelf'; filterH.frequency.value=3000;
    analyser = audioCtx.createAnalyser(); analyser.fftSize=256;
    dataArr = new Uint8Array(analyser.frequencyBinCount);
    // chain
    srcNode.connect(filterL);
    filterL.connect(filterM);
    filterM.connect(filterH);
    filterH.connect(analyser);
    analyser.connect(audioCtx.destination);
    drawViz();
  }
}
function drawViz(){
  rafId = requestAnimationFrame(drawViz);
  if(!analyser) return;
  analyser.getByteFrequencyData(dataArr);
  const w = pvCanvas.clientWidth, h = pvCanvas.clientHeight;
  pvCanvas.width = w * devicePixelRatio; pvCanvas.height = h * devicePixelRatio;
  pvCtx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
  pvCtx.clearRect(0,0,w,h);
  const bars = 64;
  const step = Math.floor(dataArr.length/bars);
  let x = 0; const barW = Math.max(2,(w/bars)-2);
  for(let i=0;i<bars;i++){
    const v = dataArr[i*step];
    const H = (v/255)*h;
    pvCtx.fillStyle = `rgba(${120 + v/2},${80},${200 - v/3},0.95)`;
    pvCtx.fillRect(x,h-H,barW,H);
    x += barW + 2;
  }
}
[eqLow,eqMid,eqHigh].forEach(el=>el.addEventListener('input', ()=>{
  if(filterL && filterM && filterH){
    filterL.gain.value = Number(eqLow.value);
    filterM.gain.value = Number(eqMid.value);
    filterH.gain.value = Number(eqHigh.value);
  }
}));

/* update seek UI */
audioEl.addEventListener('loadedmetadata', ()=>{
  pvSeek.max = Math.floor(audioEl.duration) || 0;
  pvDur.textContent = secs(audioEl.duration);
});
audioEl.addEventListener('timeupdate', ()=>{
  pvSeek.value = Math.floor(audioEl.currentTime);
  pvCur.textContent = secs(audioEl.currentTime);
});
pvSeek.addEventListener('input', ()=> audioEl.currentTime = Number(pvSeek.value||0));

/* player controls */
function togglePlay(){ if(audioEl.paused){ audioEl.play(); pvPlay.textContent='⏸️'; miniPlay.textContent='⏸️'; } else { audioEl.pause(); pvPlay.textContent='▶️'; miniPlay.textContent='▶️'; } }
pvPlay.addEventListener('click', togglePlay);
miniPlay.addEventListener('click', togglePlay);
pvPrev.addEventListener('click', prevSong); pvNext.addEventListener('click', nextSong);
miniPrev.addEventListener('click', prevSong); miniNext.addEventListener('click', nextSong);
pvClose.addEventListener('click', ()=>{ playerModal.style.display='none'; playerModal.setAttribute('aria-hidden','true'); });
document.getElementById('likeBtn').addEventListener('click', ()=>{
  if(currentIdx<0) return;
  toggleLike(localSongs[currentIdx]);
});

/* next/prev logic including shuffle/repeat */
function nextSong(){
  if(isShuffle){ currentIdx = Math.floor(Math.random()*localSongs.length); openSong(currentIdx); return; }
  if(currentIdx < localSongs.length-1) openSong(currentIdx+1);
  else if(isRepeat) openSong(0);
}
function prevSong(){ if(currentIdx>0) openSong(currentIdx-1); }

/* on end */
audioEl.addEventListener('ended', ()=> {
  if(isRepeat) openSong(currentIdx);
  else nextSong();
});

/* nav switching (no flicker) */
const sections = document.querySelectorAll('main.view section');
navItems.forEach(n=> n.addEventListener('click', ()=>{
  navItems.forEach(x=>x.classList.remove('active'));
  n.classList.add('active');
  const t = n.dataset.target;
  sections.forEach(s => s.hidden = s.id !== t);
  if(innerWidth <= 900){ sideNav.classList.remove('active'); }
}));

/* import folder */
importBtn.addEventListener('click', async ()=>{
  try{
    const dir = await window.showDirectoryPicker();
    localSongs = [];
    for await (const entry of dir.values()){
      if(entry.kind==='file' && entry.name.match(/\.(mp3|wav|ogg|m4a)$/i)){
        const file = await entry.getFile();
        const url = URL.createObjectURL(file);
        localSongs.push({name:entry.name,url,title:entry.name.replace(/\.\w+$/,''),artist:'',cover:'',blobKey:null, fileObj:file});
      }
    }
    renderSongs();
  }catch(err){ console.warn(err); alert('Sélection annulée ou non supportée par ce navigateur'); }
});

/* Save all offline (IndexedDB) */
saveOfflineBtn.addEventListener('click', async ()=>{
  if(!localSongs.length) return alert('Aucune chanson à sauvegarder');
  if(!confirm('Sauvegarder toutes les chansons visibles pour lecture hors‑ligne ?')) return;
  for(const s of localSongs){
    try{
      if(s.fileObj) await saveBlob(s.name,s.fileObj);
      else { const r=await fetch(s.url); await saveBlob(s.name, await r.blob()); }
      s.blobKey = s.name;
    }catch(e){ console.warn('save fail',e); }
  }
  alert('Sauvegarde terminée (IndexedDB)');
});

/* search */
searchInput.addEventListener('input', ()=>{
  const q = searchInput.value.trim().toLowerCase();
  if(!q){ renderSongs(); return; }
  const filtered = localSongs.filter(s => (s.title||s.name).toLowerCase().includes(q) || (s.artist||'').toLowerCase().includes(q));
  renderSongs(filtered);
});

/* create playlist UI */
createPlaylistBtn.addEventListener('click', ()=>{
  const name = prompt('Nom de la playlist:');
  if(!name) return;
  playlists[name] = [];
  renderPlaylists();
});
function renderPlaylists(){
  const area = playlistsArea;
  area.innerHTML = '';
  for(const [name,arr] of Object.entries(playlists)){
    const div = document.createElement('div'); div.style.display='flex'; div.style.alignItems='center'; div.style.gap='8px'; div.style.marginBottom='8px';
    const t = document.createElement('div'); t.textContent = name + ' ('+arr.length+')'; t.style.fontWeight='700';
    const addBtn = document.createElement('button'); addBtn.textContent='Ajouter la chanson en cours'; addBtn.className='btn';
    addBtn.addEventListener('click', ()=> {
      if(currentIdx>=0) { playlists[name].push(localSongs[currentIdx].name); alert('Ajouté'); renderPlaylists(); }
    });
    const delBtn = document.createElement('button'); delBtn.textContent='Supprimer'; delBtn.className='btn';
    delBtn.addEventListener('click', ()=> { if(confirm('Supprimer playlist ?')){ delete playlists[name]; renderPlaylists(); }});
    div.appendChild(t); div.appendChild(addBtn); div.appendChild(delBtn);
    area.appendChild(div);
  }
}

/* update recent/popular lists */
function updateLists(){
  const recentEl = document.getElementById('recentList');
  const popularEl = document.getElementById('popularList');
  recentEl.innerHTML = ''; popularEl.innerHTML = '';
  recent.slice(0,20).forEach(name=>{
    const li = document.createElement('li');
    li.innerHTML = `${escapeHtml(name)} <button class="btn" onclick="playByName('${name}')">▶️</button>`;
    recentEl.appendChild(li);
  });
  const sorted = Object.entries(playCounts).sort((a,b)=>b[1]-a[1]).slice(0,20);
  sorted.forEach(([name,count])=>{
    const li = document.createElement('li'); li.innerHTML = `${escapeHtml(name)} (${count}) <button class="btn" onclick="playByName('${name}')">▶️</button>`;
    popularEl.appendChild(li);
  });
}
window.playByName = function(name){ const idx = localSongs.findIndex(s=>s.name===name); if(idx>=0) openSong(idx); }

/* sort/select controls */
sortSelect.addEventListener('change', ()=> {
  const v = sortSelect.value;
  if(v==='alpha') localSongs.sort((a,b)=> (a.title||a.name).localeCompare(b.title||b.name));
  else if(v==='plays') localSongs.sort((a,b)=> (playCounts[b.name]||0)-(playCounts[a.name]||0));
  renderSongs();
});
shuffleCheckbox.addEventListener('change', ()=> isShuffle = shuffleCheckbox.checked);
repeatCheckbox.addEventListener('change', ()=> isRepeat = repeatCheckbox.checked);

/* util */
function secs(n){ if(!isFinite(n)) return '0:00'; n=Math.floor(n); return Math.floor(n/60)+':'+String(n%60).padStart(2,'0'); }
function escapeHtml(s){ return (s||'').toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* keyboard shortcuts */
window.addEventListener('keydown',(e)=>{
  if(e.key===' '){ e.preventDefault(); if(audioEl.paused) audioEl.play(); else audioEl.pause(); }
  if(e.key==='.'){ nextSong(); }
  if(e.key===','){ prevSong(); }
});

/* Service worker register */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
  });
}
