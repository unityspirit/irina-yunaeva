/* ═══════════════════════════════════════════════════════════════
   ADMIN PANEL — Ирина Юнаева
   Complete logic: auth, GitHub API, CRUD, uploads, drag & drop
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const REPO_OWNER = 'unityspirit';
const REPO_NAME = 'irina-yunaeva';
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;
const PBKDF2_SALT = 'irina-yunaeva-admin-salt';
const MAX_FILE_SIZE = 95 * 1024 * 1024; // 95 MB

let siteData = null;
let fileSha = null;
let ghToken = null;
let hasUnsavedChanges = false;
let currentAudio = null;

/* ══════════════════════════════════════════════════════════════
   CRYPTO MODULE
   ══════════════════════════════════════════════════════════════ */

async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function deriveKey(password) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(PBKDF2_SALT), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptToken(token, password) {
  const key = await deriveKey(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(token);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const payload = { iv: Array.from(iv), ct: Array.from(new Uint8Array(ciphertext)) };
  localStorage.setItem('iy_enc_token', JSON.stringify(payload));
}

async function decryptToken(password) {
  const raw = localStorage.getItem('iy_enc_token');
  if (!raw) return null;
  try {
    const { iv, ct } = JSON.parse(raw);
    const key = await deriveKey(password);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      new Uint8Array(ct)
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════
   AUTH MODULE — token is stored encrypted in data.json
   ══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const errEl = document.getElementById('loginError');
    const password = document.getElementById('loginPassword').value;

    btn.classList.add('loading');
    errEl.classList.remove('visible');

    try {
      // 1. Fetch data.json publicly (no token needed for public repo)
      const res = await fetch('data.json?t=' + Date.now());
      if (!res.ok) throw new Error('Не удалось загрузить данные сайта');
      const data = await res.json();

      // 2. Validate password
      const hash = await sha256(password);
      if (hash !== data.password_hash) {
        throw new Error('Неверный пароль');
      }

      // 3. Decrypt token from data.json's encrypted_token field
      if (!data.encrypted_token) {
        throw new Error('Зашифрованный токен не найден в данных сайта');
      }
      const { iv, ct } = data.encrypted_token;
      const key = await deriveKey(password);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        key,
        new Uint8Array(ct)
      );
      ghToken = new TextDecoder().decode(decrypted);

      // 4. Now fetch via GitHub API to get sha for updates
      const ghResult = await ghGetFile('data.json');
      siteData = JSON.parse(ghResult.content);
      fileSha = ghResult.sha;

      sessionStorage.setItem('iy_password', password);

      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('dashboard').classList.add('visible');

      renderAllTabs();
      showToast('Добро пожаловать!', 'success');
    } catch (err) {
      errEl.textContent = err.message || 'Ошибка входа';
      errEl.classList.add('visible');
      ghToken = null;
    } finally {
      btn.classList.remove('loading');
    }
  });
});

function logout() {
  if (hasUnsavedChanges && !confirm('Есть несохранённые изменения. Выйти?')) return;
  ghToken = null;
  siteData = null;
  fileSha = null;
  hasUnsavedChanges = false;
  sessionStorage.removeItem('iy_password');
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  document.getElementById('dashboard').classList.remove('visible');
  document.getElementById('loginScreen').style.display = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').classList.remove('visible');
}

// Unsaved changes guard
window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
});

/* ══════════════════════════════════════════════════════════════
   GITHUB API MODULE
   ══════════════════════════════════════════════════════════════ */

async function ghGetFile(path) {
  const res = await fetch(`${API_BASE}/${path}`, {
    headers: {
      Authorization: `token ${ghToken}`,
      Accept: 'application/vnd.github.v3+json'
    }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `GitHub API ошибка: ${res.status}`);
  }
  const data = await res.json();
  const content = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
  return { content, sha: data.sha };
}

async function ghPutFile(path, content, sha, message) {
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    sha
  };
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${ghToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b.message || `GitHub PUT ошибка: ${res.status}`);
  }
  return res.json();
}

async function ghPutBinaryFile(path, base64Content, sha, message) {
  const body = { message, content: base64Content };
  if (sha) body.sha = sha;
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${ghToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b.message || `GitHub PUT ошибка: ${res.status}`);
  }
  return res.json();
}

async function ghDeleteFile(path, sha, message) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'DELETE',
    headers: {
      Authorization: `token ${ghToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message, sha })
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b.message || `GitHub DELETE ошибка: ${res.status}`);
  }
  return res.json();
}

/* ══════════════════════════════════════════════════════════════
   DATA MANAGEMENT
   ══════════════════════════════════════════════════════════════ */

async function loadData() {
  const { content, sha } = await ghGetFile('data.json');
  siteData = JSON.parse(content);
  fileSha = sha;
}

async function saveData() {
  const btn = document.getElementById('saveBtn');
  const status = document.getElementById('saveStatus');
  btn.classList.add('loading');
  status.className = 'save-status saving';
  status.querySelector('span:last-child').textContent = 'Сохранение…';

  try {
    const json = JSON.stringify(siteData, null, 2);
    const result = await ghPutFile('data.json', json, fileSha, 'Обновление через админ-панель');
    fileSha = result.content.sha;
    hasUnsavedChanges = false;
    status.className = 'save-status saved';
    status.querySelector('span:last-child').textContent = 'Сохранено';
    showToast('Изменения сохранены ✓', 'success');
  } catch (err) {
    showToast('Ошибка сохранения: ' + err.message, 'error');
    status.className = 'save-status unsaved';
    status.querySelector('span:last-child').textContent = 'Ошибка';
  } finally {
    btn.classList.remove('loading');
  }
}

function markDirty() {
  hasUnsavedChanges = true;
  const status = document.getElementById('saveStatus');
  if (status) {
    status.className = 'save-status unsaved';
    status.querySelector('span:last-child').textContent = 'Не сохранено';
  }
}

function generateId(prefix = 'x') {
  return prefix + Date.now() + Math.random().toString(36).substr(2, 4);
}

/* ══════════════════════════════════════════════════════════════
   TAB NAVIGATION
   ══════════════════════════════════════════════════════════════ */

function switchTab(tabId, el) {
  if (el) el.blur();
  // Deactivate all
  document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

  // Activate selected
  const link = el || document.querySelector(`[data-tab="${tabId}"]`);
  if (link) link.classList.add('active');
  const panel = document.getElementById(`tab-${tabId}`);
  if (panel) panel.classList.add('active');

  // Stop any playing audio when leaving
  if (tabId !== 'tracks' && currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  return false;
}

function renderAllTabs() {
  renderHeroTab();
  renderPoemsTab();
  renderVideosTab();
  renderTracksTab();
  renderAboutTab();
  renderSettingsTab();
}

/* ══════════════════════════════════════════════════════════════
   HERO TAB
   ══════════════════════════════════════════════════════════════ */

function renderHeroTab() {
  const c = document.getElementById('tab-hero');
  const h = siteData.hero;
  c.innerHTML = `
    <h2 class="section-title"><span class="icon">🏠</span> Главная страница</h2>
    <div class="card">
      <div class="form-group">
        <label>Имя (первая строка) <span class="char-count" id="cc-name1">${h.name1.length}</span></label>
        <input class="form-input" value="${esc(h.name1)}" oninput="siteData.hero.name1=this.value;markDirty();updCC('cc-name1',this)">
      </div>
      <div class="form-group">
        <label>Фамилия (вторая строка) <span class="char-count" id="cc-name2">${h.name2.length}</span></label>
        <input class="form-input" value="${esc(h.name2)}" oninput="siteData.hero.name2=this.value;markDirty();updCC('cc-name2',this)">
      </div>
      <div class="form-group">
        <label>Девиз <span class="char-count" id="cc-motto">${h.motto.length}</span></label>
        <input class="form-input" value="${esc(h.motto)}" oninput="siteData.hero.motto=this.value;markDirty();updCC('cc-motto',this)">
      </div>
      <div class="form-group">
        <label>Приветствие <span class="char-count" id="cc-greeting">${h.greeting.length}</span></label>
        <textarea class="form-textarea" oninput="siteData.hero.greeting=this.value;markDirty();updCC('cc-greeting',this);autoResize(this)">${esc(h.greeting)}</textarea>
        <p class="form-hint">Используйте &lt;br&gt; для переноса строки</p>
      </div>
      <div class="form-group">
        <label>Текст кнопки <span class="char-count" id="cc-btn">${h.buttonText.length}</span></label>
        <input class="form-input" value="${esc(h.buttonText)}" oninput="siteData.hero.buttonText=this.value;markDirty();updCC('cc-btn',this)">
      </div>
    </div>
  `;
  autoResizeAll(c);
}

/* ══════════════════════════════════════════════════════════════
   POEMS TAB
   ══════════════════════════════════════════════════════════════ */

function renderPoemsTab() {
  const c = document.getElementById('tab-poems');
  let html = `<h2 class="section-title"><span class="icon">📝</span> Стихи</h2>`;

  siteData.poemSections.forEach((sec, si) => {
    html += `
      <div class="section-card draggable-item" draggable="true"
           ondragstart="dsDragStart(event,'sections',${si})"
           ondragover="dsDragOver(event)" ondragleave="dsDragLeave(event)"
           ondrop="dsDrop(event,'sections',${si})" ondragend="dsDragEnd(event)">
        <div class="section-card-header">
          <span class="drag-handle" title="Перетащить">⋮⋮</span>
          <input class="section-title-input flex-grow" value="${esc(sec.title)}"
                 oninput="siteData.poemSections[${si}].title=this.value;markDirty()">
          <label class="toggle">
            <input type="checkbox" ${sec.visible ? 'checked' : ''}
                   onchange="siteData.poemSections[${si}].visible=this.checked;markDirty()">
            <span class="toggle-slider"></span>
            <span class="toggle-label">Виден</span>
          </label>
          <button class="btn btn-danger btn-sm" onclick="deleteSection(${si})">🗑 Удалить</button>
        </div>
        <div class="section-card-body">`;

    sec.poems.forEach((poem, pi) => {
      html += `
          <div class="poem-item draggable-item" draggable="true"
               ondragstart="dsDragStart(event,'poems-${si}',${pi})"
               ondragover="dsDragOver(event)" ondragleave="dsDragLeave(event)"
               ondrop="dsDrop(event,'poems-${si}',${pi})" ondragend="dsDragEnd(event)">
            <span class="drag-handle" title="Перетащить">⋮⋮</span>
            <div class="poem-body">
              <div class="form-group mb-sm">
                <textarea class="form-textarea" placeholder="Текст стихотворения…"
                  oninput="siteData.poemSections[${si}].poems[${pi}].text=this.value;markDirty();autoResize(this)">${esc(poem.text)}</textarea>
              </div>
              <div class="form-group" style="margin-bottom:0">
                <input class="form-input" placeholder="Автор" value="${esc(poem.author)}"
                  oninput="siteData.poemSections[${si}].poems[${pi}].author=this.value;markDirty()">
              </div>
            </div>
            <div class="poem-actions">
              <label class="toggle" title="Видимость">
                <input type="checkbox" ${poem.visible ? 'checked' : ''}
                       onchange="siteData.poemSections[${si}].poems[${pi}].visible=this.checked;markDirty()">
                <span class="toggle-slider"></span>
              </label>
              <button class="btn btn-icon btn-danger" title="Удалить" onclick="deletePoem(${si},${pi})">🗑</button>
            </div>
          </div>`;
    });

    html += `
          <button class="btn btn-ghost btn-sm mt-sm" onclick="addPoem(${si})">+ Добавить стихотворение</button>
        </div>
      </div>`;
  });

  html += `<button class="btn btn-primary mt-md" onclick="addSection()">+ Добавить раздел</button>`;
  c.innerHTML = html;
  autoResizeAll(c);
}

function addSection() {
  siteData.poemSections.push({
    id: generateId('sec-'),
    title: 'Новый раздел',
    visible: true,
    poems: []
  });
  markDirty();
  renderPoemsTab();
}

function deleteSection(si) {
  if (!confirm(`Удалить раздел «${siteData.poemSections[si].title}» и все его стихи?`)) return;
  siteData.poemSections.splice(si, 1);
  markDirty();
  renderPoemsTab();
}

function addPoem(si) {
  siteData.poemSections[si].poems.push({
    id: generateId('p-'),
    text: '',
    author: 'И.Юнаева',
    visible: true
  });
  markDirty();
  renderPoemsTab();
}

function deletePoem(si, pi) {
  siteData.poemSections[si].poems.splice(pi, 1);
  markDirty();
  renderPoemsTab();
}

/* ══════════════════════════════════════════════════════════════
   VIDEOS TAB
   ══════════════════════════════════════════════════════════════ */

function renderVideosTab() {
  const c = document.getElementById('tab-videos');
  let html = `
    <h2 class="section-title"><span class="icon">🎬</span> Видео</h2>
    <div class="add-area">
      <div class="add-area-header">
        <span class="add-area-title">Добавить видео</span>
        <div class="mode-toggle">
          <button class="active" onclick="switchAddMode('video','file',this)">📁 Загрузить файл</button>
          <button onclick="switchAddMode('video','link',this)">🔗 По ссылке</button>
        </div>
      </div>

      <div class="add-mode-panel active" id="video-mode-file">
        <div class="drop-zone" id="videoDropZone"
             onclick="document.getElementById('videoFileInput').click()"
             ondragover="event.preventDefault();this.classList.add('dragover')"
             ondragleave="this.classList.remove('dragover')"
             ondrop="handleVideoDrop(event)">
          <div class="drop-zone-icon">🎞️</div>
          <div class="drop-zone-text">Перетащите видео сюда или нажмите для выбора</div>
          <div class="drop-zone-hint">MP4, WebM, MOV · до 95 МБ</div>
        </div>
        <input type="file" id="videoFileInput" accept="video/*" style="display:none" onchange="handleVideoFile(this.files[0])">
        <div class="progress-bar" id="videoProgress">
          <div class="progress-bar-fill" id="videoProgressFill"></div>
        </div>
        <div class="form-group mt-md">
          <label>Название видео</label>
          <input class="form-input" id="videoFileTitle" placeholder="Стихотворение…">
        </div>
      </div>

      <div class="add-mode-panel" id="video-mode-link">
        <div class="form-group">
          <label>Ссылка на видео</label>
          <input class="form-input" id="videoLinkUrl" placeholder="YouTube, Dropbox или прямая ссылка">
        </div>
        <div class="form-group">
          <label>Название</label>
          <input class="form-input" id="videoLinkTitle" placeholder="Стихотворение…">
        </div>
        <div class="form-group">
          <label>Ориентация</label>
          <div class="orientation-select" id="videoLinkOrientation">
            <button class="active" onclick="selectOrientation(this,'portrait')">📱 Вертикальное</button>
            <button onclick="selectOrientation(this,'landscape')">🖥 Горизонтальное</button>
          </div>
        </div>
        <button class="btn btn-primary btn-sm mt-sm" onclick="addVideoByLink()">Добавить</button>
      </div>
    </div>`;

  // List
  if (siteData.videos.length === 0) {
    html += `<div class="empty-state"><div class="icon">🎬</div><p>Видео пока нет</p></div>`;
  } else {
    siteData.videos.forEach((v, i) => {
      const thumb = getVideoThumb(v);
      const orientLabel = v.orientation === 'portrait' ? 'Вертикальное' : 'Горизонтальное';
      const orientClass = v.orientation || 'portrait';
      html += `
        <div class="media-item draggable-item" draggable="true"
             ondragstart="dsDragStart(event,'videos',${i})"
             ondragover="dsDragOver(event)" ondragleave="dsDragLeave(event)"
             ondrop="dsDrop(event,'videos',${i})" ondragend="dsDragEnd(event)">
          <span class="drag-handle">⋮⋮</span>
          <div class="media-thumb">${thumb}</div>
          <div class="media-info">
            <input class="media-title-input" value="${esc(v.title)}"
                   oninput="siteData.videos[${i}].title=this.value;markDirty()">
            <span class="media-badge ${orientClass}">${orientLabel}</span>
          </div>
          <div class="media-actions">
            <label class="toggle" title="Видимость">
              <input type="checkbox" ${v.visible ? 'checked' : ''}
                     onchange="siteData.videos[${i}].visible=this.checked;markDirty()">
              <span class="toggle-slider"></span>
            </label>
            <button class="btn btn-icon btn-danger" title="Удалить" onclick="deleteVideo(${i})">🗑</button>
          </div>
        </div>`;
    });
  }

  c.innerHTML = html;
}

function getVideoThumb(v) {
  if (v.type === 'youtube') {
    const yt = parseYouTubeUrl(v.src);
    if (yt) return `<img src="${yt.thumbnailUrl}" alt="">`;
  }
  return `<span class="placeholder-icon">🎬</span>`;
}

function handleVideoDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('video/')) handleVideoFile(file);
}

async function handleVideoFile(file) {
  if (!file) return;
  if (file.size > MAX_FILE_SIZE) {
    showToast('Файл слишком большой (макс. 95 МБ)', 'error');
    return;
  }

  const progressBar = document.getElementById('videoProgress');
  const progressFill = document.getElementById('videoProgressFill');
  progressBar.classList.add('visible');
  progressFill.style.width = '10%';

  try {
    const orientation = await detectVideoOrientation(file);
    progressFill.style.width = '30%';

    const filePath = await uploadMediaFile(file, 'assets/videos', (pct) => {
      progressFill.style.width = (30 + pct * 0.7) + '%';
    });

    const title = document.getElementById('videoFileTitle').value.trim() || file.name;
    siteData.videos.push({
      id: generateId('v'),
      type: 'file',
      src: filePath,
      title,
      orientation,
      visible: true
    });
    markDirty();
    progressFill.style.width = '100%';
    showToast('Видео загружено!', 'success');
    setTimeout(() => {
      progressBar.classList.remove('visible');
      progressFill.style.width = '0%';
      document.getElementById('videoFileTitle').value = '';
      renderVideosTab();
    }, 600);
  } catch (err) {
    showToast('Ошибка загрузки: ' + err.message, 'error');
    progressBar.classList.remove('visible');
    progressFill.style.width = '0%';
  }
}

function addVideoByLink() {
  const url = document.getElementById('videoLinkUrl').value.trim();
  const title = document.getElementById('videoLinkTitle').value.trim();
  if (!url) { showToast('Введите ссылку', 'error'); return; }

  const yt = parseYouTubeUrl(url);
  const orientBtns = document.querySelectorAll('#videoLinkOrientation button');
  let orientation = 'portrait';
  orientBtns.forEach(b => { if (b.classList.contains('active')) orientation = b.dataset.orient || 'portrait'; });

  siteData.videos.push({
    id: generateId('v'),
    type: yt ? 'youtube' : 'external',
    src: yt ? yt.embedUrl : url,
    title: title || 'Без названия',
    orientation: yt ? 'landscape' : orientation,
    visible: true
  });
  markDirty();
  document.getElementById('videoLinkUrl').value = '';
  document.getElementById('videoLinkTitle').value = '';
  renderVideosTab();
  showToast('Видео добавлено', 'success');
}

function deleteVideo(i) {
  if (!confirm(`Удалить видео «${siteData.videos[i].title}»?`)) return;
  siteData.videos.splice(i, 1);
  markDirty();
  renderVideosTab();
}

/* ══════════════════════════════════════════════════════════════
   TRACKS TAB
   ══════════════════════════════════════════════════════════════ */

function renderTracksTab() {
  const c = document.getElementById('tab-tracks');
  let html = `
    <h2 class="section-title"><span class="icon">🎵</span> Музыка</h2>
    <div class="add-area">
      <div class="add-area-header">
        <span class="add-area-title">Добавить аудио</span>
        <div class="mode-toggle">
          <button class="active" onclick="switchAddMode('track','file',this)">📁 Загрузить файл</button>
          <button onclick="switchAddMode('track','link',this)">🔗 По ссылке</button>
        </div>
      </div>

      <div class="add-mode-panel active" id="track-mode-file">
        <div class="drop-zone" id="trackDropZone"
             onclick="document.getElementById('trackFileInput').click()"
             ondragover="event.preventDefault();this.classList.add('dragover')"
             ondragleave="this.classList.remove('dragover')"
             ondrop="handleTrackDrop(event)">
          <div class="drop-zone-icon">🎶</div>
          <div class="drop-zone-text">Перетащите аудиофайл сюда</div>
          <div class="drop-zone-hint">MP3, MPEG, WAV, OGG · до 95 МБ</div>
        </div>
        <input type="file" id="trackFileInput" accept="audio/*" style="display:none" onchange="handleTrackFile(this.files[0])">
        <div class="progress-bar" id="trackProgress">
          <div class="progress-bar-fill" id="trackProgressFill"></div>
        </div>
        <div class="form-group mt-md">
          <label>Название трека</label>
          <input class="form-input" id="trackFileName" placeholder="Песня…">
        </div>
      </div>

      <div class="add-mode-panel" id="track-mode-link">
        <div class="form-group">
          <label>Ссылка на аудио</label>
          <input class="form-input" id="trackLinkUrl" placeholder="Dropbox или прямая ссылка">
        </div>
        <div class="form-group">
          <label>Название</label>
          <input class="form-input" id="trackLinkName" placeholder="Песня…">
        </div>
        <button class="btn btn-primary btn-sm mt-sm" onclick="addTrackByLink()">Добавить</button>
      </div>
    </div>`;

  if (siteData.tracks.length === 0) {
    html += `<div class="empty-state"><div class="icon">🎵</div><p>Аудиозаписей пока нет</p></div>`;
  } else {
    siteData.tracks.forEach((t, i) => {
      html += `
        <div class="media-item draggable-item" draggable="true"
             ondragstart="dsDragStart(event,'tracks',${i})"
             ondragover="dsDragOver(event)" ondragleave="dsDragLeave(event)"
             ondrop="dsDrop(event,'tracks',${i})" ondragend="dsDragEnd(event)">
          <span class="drag-handle">⋮⋮</span>
          <button class="track-play" onclick="toggleTrackPreview('${esc(t.src)}',this)" title="Прослушать">▶</button>
          <div class="media-info">
            <input class="media-title-input" value="${esc(t.name)}"
                   oninput="siteData.tracks[${i}].name=this.value;markDirty()">
          </div>
          <div class="media-actions">
            <label class="toggle" title="Видимость">
              <input type="checkbox" ${t.visible ? 'checked' : ''}
                     onchange="siteData.tracks[${i}].visible=this.checked;markDirty()">
              <span class="toggle-slider"></span>
            </label>
            <button class="btn btn-icon btn-danger" title="Удалить" onclick="deleteTrack(${i})">🗑</button>
          </div>
        </div>`;
    });
  }

  c.innerHTML = html;
}

function handleTrackDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('audio/')) handleTrackFile(file);
}

async function handleTrackFile(file) {
  if (!file) return;
  if (file.size > MAX_FILE_SIZE) {
    showToast('Файл слишком большой (макс. 95 МБ)', 'error');
    return;
  }

  const progressBar = document.getElementById('trackProgress');
  const progressFill = document.getElementById('trackProgressFill');
  progressBar.classList.add('visible');
  progressFill.style.width = '10%';

  try {
    const filePath = await uploadMediaFile(file, 'assets/music', (pct) => {
      progressFill.style.width = (10 + pct * 0.9) + '%';
    });

    const name = document.getElementById('trackFileName').value.trim() || file.name.replace(/\.[^/.]+$/, '');
    siteData.tracks.push({
      id: generateId('t'),
      type: 'file',
      name,
      src: filePath,
      visible: true
    });
    markDirty();
    progressFill.style.width = '100%';
    showToast('Аудио загружено!', 'success');
    setTimeout(() => {
      progressBar.classList.remove('visible');
      progressFill.style.width = '0%';
      document.getElementById('trackFileName').value = '';
      renderTracksTab();
    }, 600);
  } catch (err) {
    showToast('Ошибка загрузки: ' + err.message, 'error');
    progressBar.classList.remove('visible');
    progressFill.style.width = '0%';
  }
}

function addTrackByLink() {
  const url = document.getElementById('trackLinkUrl').value.trim();
  const name = document.getElementById('trackLinkName').value.trim();
  if (!url) { showToast('Введите ссылку', 'error'); return; }

  siteData.tracks.push({
    id: generateId('t'),
    type: 'external',
    name: name || 'Без названия',
    src: url,
    visible: true
  });
  markDirty();
  document.getElementById('trackLinkUrl').value = '';
  document.getElementById('trackLinkName').value = '';
  renderTracksTab();
  showToast('Аудио добавлено', 'success');
}

function deleteTrack(i) {
  if (!confirm(`Удалить трек «${siteData.tracks[i].name}»?`)) return;
  siteData.tracks.splice(i, 1);
  markDirty();
  renderTracksTab();
}

function toggleTrackPreview(src, btn) {
  if (currentAudio && currentAudio._src === src) {
    if (currentAudio.paused) {
      currentAudio.play();
      btn.textContent = '⏸';
    } else {
      currentAudio.pause();
      btn.textContent = '▶';
    }
    return;
  }
  // Stop previous
  if (currentAudio) {
    currentAudio.pause();
    document.querySelectorAll('.track-play').forEach(b => b.textContent = '▶');
  }
  currentAudio = new Audio(src);
  currentAudio._src = src;
  currentAudio.play().catch(() => showToast('Не удалось воспроизвести', 'error'));
  btn.textContent = '⏸';
  currentAudio.addEventListener('ended', () => {
    btn.textContent = '▶';
    currentAudio = null;
  });
}

/* ══════════════════════════════════════════════════════════════
   ABOUT TAB
   ══════════════════════════════════════════════════════════════ */

function renderAboutTab() {
  const c = document.getElementById('tab-about');
  const a = siteData.about;
  let html = `
    <h2 class="section-title"><span class="icon">👤</span> О себе</h2>
    <div class="card">
      <div class="form-group">
        <label>Вступительный текст</label>
        <textarea class="form-textarea" oninput="siteData.about.lead=this.value;markDirty();autoResize(this)">${esc(a.lead)}</textarea>
      </div>

      <div class="form-group">
        <label>Абзацы</label>`;

  a.paragraphs.forEach((p, i) => {
    html += `
        <div class="paragraph-item">
          <textarea class="form-textarea" oninput="siteData.about.paragraphs[${i}]=this.value;markDirty();autoResize(this)">${esc(p)}</textarea>
          <button class="btn btn-icon btn-danger" title="Удалить абзац" onclick="deleteParagraph(${i})">🗑</button>
        </div>`;
  });

  html += `
        <button class="btn btn-ghost btn-sm mt-sm" onclick="addParagraph()">+ Добавить абзац</button>
      </div>

      <div class="form-group">
        <label>Текст футера</label>
        <input class="form-input" value="${esc(a.footer)}" oninput="siteData.about.footer=this.value;markDirty()">
      </div>
      <div class="form-group">
        <label>Подзаголовок футера</label>
        <input class="form-input" value="${esc(a.footerSub)}" oninput="siteData.about.footerSub=this.value;markDirty()">
      </div>
    </div>`;

  c.innerHTML = html;
  autoResizeAll(c);
}

function addParagraph() {
  siteData.about.paragraphs.push('');
  markDirty();
  renderAboutTab();
}

function deleteParagraph(i) {
  siteData.about.paragraphs.splice(i, 1);
  markDirty();
  renderAboutTab();
}

/* ══════════════════════════════════════════════════════════════
   SETTINGS TAB
   ══════════════════════════════════════════════════════════════ */

function renderSettingsTab() {
  const c = document.getElementById('tab-settings');
  c.innerHTML = `
    <h2 class="section-title"><span class="icon">⚙️</span> Настройки</h2>

    <div class="card settings-section">
      <h3 class="card-title">Сменить пароль</h3>
      <div class="form-group mt-md">
        <label>Текущий пароль</label>
        <input type="password" class="form-input" id="settCurrentPass">
      </div>
      <div class="form-group">
        <label>Новый пароль</label>
        <input type="password" class="form-input" id="settNewPass">
      </div>
      <div class="form-group">
        <label>Подтвердите новый пароль</label>
        <input type="password" class="form-input" id="settConfirmPass">
      </div>
      <button class="btn btn-primary btn-sm" onclick="changePassword()">
        <span class="spinner"></span>
        <span class="btn-text">Сменить пароль</span>
      </button>
    </div>

    <div class="card settings-section" style="margin-top:32px">
      <h3 class="card-title">Обновить GitHub токен</h3>
      <div class="form-group mt-md">
        <label>Новый токен</label>
        <input type="text" class="form-input" id="settNewToken" placeholder="ghp_xxxxxxxxxxxx" spellcheck="false" autocomplete="off">
      </div>
      <button class="btn btn-primary btn-sm" onclick="updateToken()">
        <span class="spinner"></span>
        <span class="btn-text">Обновить токен</span>
      </button>
    </div>
  `;
}

async function changePassword() {
  const curr = document.getElementById('settCurrentPass').value;
  const newP = document.getElementById('settNewPass').value;
  const conf = document.getElementById('settConfirmPass').value;

  if (!curr || !newP) { showToast('Заполните все поля', 'error'); return; }
  if (newP !== conf) { showToast('Пароли не совпадают', 'error'); return; }
  if (newP.length < 4) { showToast('Пароль слишком короткий', 'error'); return; }

  const currHash = await sha256(curr);
  if (currHash !== siteData.password_hash) { showToast('Неверный текущий пароль', 'error'); return; }

  try {
    const newHash = await sha256(newP);
    siteData.password_hash = newHash;

    // Re-encrypt token with new password and store in data.json
    const key = await deriveKey(newP);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(ghToken);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    siteData.encrypted_token = { iv: Array.from(iv), ct: Array.from(new Uint8Array(ciphertext)) };

    sessionStorage.setItem('iy_password', newP);
    markDirty();
    showToast('Пароль изменён. Не забудьте сохранить!', 'success');
    document.getElementById('settCurrentPass').value = '';
    document.getElementById('settNewPass').value = '';
    document.getElementById('settConfirmPass').value = '';
  } catch (err) {
    showToast('Ошибка: ' + err.message, 'error');
  }
}

async function updateToken() {
  const newToken = document.getElementById('settNewToken').value.trim();
  if (!newToken) { showToast('Введите токен', 'error'); return; }

  try {
    const password = sessionStorage.getItem('iy_password');
    if (!password) { showToast('Сессия истекла. Войдите заново.', 'error'); return; }

    // Encrypt new token and store in data.json
    const key = await deriveKey(password);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(newToken);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    siteData.encrypted_token = { iv: Array.from(iv), ct: Array.from(new Uint8Array(ciphertext)) };

    ghToken = newToken;
    markDirty();
    showToast('Токен обновлён. Не забудьте сохранить!', 'success');
    document.getElementById('settNewToken').value = '';
  } catch (err) {
    showToast('Ошибка: ' + err.message, 'error');
  }
}

/* ══════════════════════════════════════════════════════════════
   FILE UPLOAD
   ══════════════════════════════════════════════════════════════ */

async function uploadMediaFile(file, directory, onProgress) {
  const safeName = sanitizeFilename(file.name);
  const path = `${directory}/${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(arrayBuffer);
  if (onProgress) onProgress(50);

  // Check if file exists to get sha
  let existingSha = null;
  try {
    const existing = await fetch(`${API_BASE}/${path}`, {
      headers: { Authorization: `token ${ghToken}`, Accept: 'application/vnd.github.v3+json' }
    });
    if (existing.ok) {
      const data = await existing.json();
      existingSha = data.sha;
    }
  } catch { /* file doesn't exist, ok */ }

  if (onProgress) onProgress(70);
  await ghPutBinaryFile(path, base64, existingSha, `Загрузка ${safeName}`);
  if (onProgress) onProgress(100);

  return path;
}

function sanitizeFilename(name) {
  const translitMap = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z',
    'и':'i','й':'j','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r',
    'с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch',
    'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
    'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'Yo','Ж':'Zh','З':'Z',
    'И':'I','Й':'J','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R',
    'С':'S','Т':'T','У':'U','Ф':'F','Х':'Kh','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Shch',
    'Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'Yu','Я':'Ya'
  };
  let result = '';
  for (const ch of name) {
    result += translitMap[ch] || ch;
  }
  return result
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.\-]/g, '')
    .replace(/_+/g, '_');
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function detectVideoOrientation(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.videoWidth >= video.videoHeight ? 'landscape' : 'portrait');
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve('portrait');
    };
    video.src = url;
  });
}

/* ══════════════════════════════════════════════════════════════
   YOUTUBE URL PARSER
   ══════════════════════════════════════════════════════════════ */

function parseYouTubeUrl(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
  ];
  for (const regex of patterns) {
    const match = url.match(regex);
    if (match) {
      const videoId = match[1];
      return {
        videoId,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
      };
    }
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════
   DRAG & DROP SORTING
   ══════════════════════════════════════════════════════════════ */

let dragState = { type: null, fromIndex: null };

function dsDragStart(e, type, index) {
  dragState = { type, fromIndex: index };
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', ''); // Required for Firefox
}

function dsDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const item = e.currentTarget;
  item.classList.add('drag-over');
}

function dsDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function dsDrop(e, type, toIndex) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  if (dragState.type !== type || dragState.fromIndex === null) return;
  const from = dragState.fromIndex;
  if (from === toIndex) return;

  let arr;
  if (type === 'sections') {
    arr = siteData.poemSections;
  } else if (type === 'videos') {
    arr = siteData.videos;
  } else if (type === 'tracks') {
    arr = siteData.tracks;
  } else if (type.startsWith('poems-')) {
    const si = parseInt(type.split('-')[1]);
    arr = siteData.poemSections[si].poems;
  } else {
    return;
  }

  // Move item
  const [item] = arr.splice(from, 1);
  arr.splice(toIndex, 0, item);
  markDirty();

  // Re-render
  if (type === 'sections' || type.startsWith('poems-')) renderPoemsTab();
  else if (type === 'videos') renderVideosTab();
  else if (type === 'tracks') renderTracksTab();
}

function dsDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  dragState = { type: null, fromIndex: null };
}

/* ══════════════════════════════════════════════════════════════
   ADD MODE TOGGLE (video/track: file vs link)
   ══════════════════════════════════════════════════════════════ */

function switchAddMode(entity, mode, btn) {
  // Toggle buttons
  btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  // Toggle panels
  const prefix = entity === 'video' ? 'video' : 'track';
  document.getElementById(`${prefix}-mode-file`).classList.toggle('active', mode === 'file');
  document.getElementById(`${prefix}-mode-link`).classList.toggle('active', mode === 'link');
}

function selectOrientation(btn, orient) {
  btn.parentElement.querySelectorAll('button').forEach(b => {
    b.classList.remove('active');
    delete b.dataset.orient;
  });
  btn.classList.add('active');
  btn.dataset.orient = orient;
}

/* ══════════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ══════════════════════════════════════════════════════════════ */

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = { success: '✓', error: '✗', info: 'ℹ' };
  toast.innerHTML = `<span>${icons[type] || '•'}</span> ${esc(message)}`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ══════════════════════════════════════════════════════════════
   UTILITIES
   ══════════════════════════════════════════════════════════════ */

function esc(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function updCC(id, input) {
  const el = document.getElementById(id);
  if (el) el.textContent = input.value.length;
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

function autoResizeAll(container) {
  setTimeout(() => {
    container.querySelectorAll('.form-textarea').forEach(autoResize);
  }, 0);
}
