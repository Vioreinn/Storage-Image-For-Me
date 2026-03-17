const { Client, Storage, Account, ID } = Appwrite;
const client = new Client().setEndpoint('https://nyc.cloud.appwrite.io/v1').setProject('69b8d66a0037b414c51d');
const storage = new Storage(client);
const account = new Account(client);
const BUCKET_ID = '69b8d6e500188b62e88b';

let allFiles = [];
let filteredFiles = [];
let currentIndex = -1;
let isZoomed = false;

// ─── Touch swipe ──────────────────────────────────────
let touchStartX = 0;
let touchStartY = 0;
const SWIPE_THRESHOLD = 50;

// ─── Date formatter: "Jan/15/25 :14.30" ──────────────
function formatDate(isoStr) {
    const d = new Date(isoStr);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const mon = months[d.getMonth()];
    const dd  = String(d.getDate()).padStart(2, '0');
    const yy  = String(d.getFullYear()).slice(-2);
    const hh  = String(d.getHours()).padStart(2, '0');
    const mm  = String(d.getMinutes()).padStart(2, '0');
    return `${mon}/${dd}/${yy} :${hh}.${mm}`;
}

// ─── URL helpers ──────────────────────────────────────
// thumbnail ขนาดเล็กสำหรับ gallery → โหลดไว
function getThumbnailUrl(fileId) {
    return storage.getFilePreview(BUCKET_ID, fileId, 400, 400, 'center', 70);
}
// full-res ต้นฉบับสำหรับ modal
function getFullUrl(fileId) {
    return storage.getFileDownload(BUCKET_ID, fileId);
}

// ─── Init ─────────────────────────────────────────────
async function init() {
    try { await account.createAnonymousSession(); } catch (e) {}
    loadFiles();
}
init();

// ─── Gallery ──────────────────────────────────────────
async function loadFiles() {
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>กำลังโหลด...</span></div>`;
    try {
        const response = await storage.listFiles(BUCKET_ID);
        allFiles = response.files;

        const filter = document.getElementById('filterType').value;
        const sort   = document.getElementById('sortOrder').value;

        filteredFiles = filter === 'all' ? [...allFiles] : allFiles.filter(f => f.mimeType.includes(filter));
        if (sort === 'largest') filteredFiles.sort((a, b) => b.sizeOriginal - a.sizeOriginal);
        else filteredFiles.sort((a, b) => new Date(b.$createdAt) - new Date(a.$createdAt));

        if (filteredFiles.length === 0) {
            gallery.innerHTML = `<div class="empty-state"><p>ยังไม่มีไฟล์ในที่นี้</p></div>`;
            return;
        }

        gallery.innerHTML = '';
        filteredFiles.forEach((file, index) => {
            const isImage = file.mimeType.includes('image');
            const thumbUrl = isImage ? getThumbnailUrl(file.$id) : getFullUrl(file.$id);
            const card = document.createElement('div');
            card.className = 'file-card';
            card.style.animationDelay = `${index * 40}ms`;
            card.innerHTML = `
                <div class="media-container" onclick="openFullView(${index})">
                    ${isImage
                        ? `<img src="${thumbUrl}" loading="lazy" alt="${file.name}">`
                        : `<video src="${thumbUrl}" preload="metadata"></video>`}
                    <div class="card-overlay">
                        <span class="file-type-badge">${file.name.split('.').pop().toUpperCase()}</span>
                    </div>
                </div>`;
            gallery.appendChild(card);
        });
    } catch (e) {
        gallery.innerHTML = `<div class="empty-state"><p>โหลดไม่ได้ กรุณาลองใหม่</p></div>`;
        console.error(e);
    }
}

// ─── Open Modal ───────────────────────────────────────
function openFullView(index) {
    if (index < 0 || index >= filteredFiles.length) return;
    currentIndex = index;
    isZoomed = false;
    closeInfoPanel();

    const file    = filteredFiles[currentIndex];
    const isImage = file.mimeType.includes('image');
    const fullUrl = getFullUrl(file.$id);

    const modal   = document.getElementById('fileModal');
    const body    = document.getElementById('modalBody');
    const details = document.getElementById('fileDetails');

    const size = file.sizeOriginal < 1024 * 1024
        ? (file.sizeOriginal / 1024).toFixed(1) + ' KB'
        : (file.sizeOriginal / (1024 * 1024)).toFixed(2) + ' MB';
    const dateStr = formatDate(file.$createdAt);
    const ext = file.name.split('.').pop().toUpperCase();

    details.innerHTML = `
        <div class="detail-name" title="${file.name}">${file.name}</div>
        <div class="detail-meta">
            <span>${ext}</span><span>·</span><span>${size}</span>
        </div>
        <div class="detail-date">${dateStr}</div>`;

    // สร้าง media
    body.innerHTML = '';
    if (isImage) {
        const img = document.createElement('img');
        img.src = fullUrl;
        img.className = 'modal-content';
        img.alt = file.name;
        img.addEventListener('dblclick', toggleZoom);
        body.appendChild(img);
    } else {
        const video = document.createElement('video');
        video.src = fullUrl;
        video.controls = true;
        video.className = 'modal-content';
        body.appendChild(video);
    }

    // hamburger actions
    document.getElementById('menuDeleteBtn').onclick   = () => { closeMenu(); deleteFile(file.$id); };
    document.getElementById('menuDownloadBtn').onclick = () => { closeMenu(); downloadFile(file.$id, file.name); };
    document.getElementById('menuInfoBtn').onclick     = () => { closeMenu(); showFileInfo(file, size, dateStr, ext); };

    document.getElementById('fileCounter').textContent = `${currentIndex + 1} / ${filteredFiles.length}`;

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // touch swipe
    body.addEventListener('touchstart', onTouchStart, { passive: true });
    body.addEventListener('touchend',   onTouchEnd,   { passive: true });
}

// ─── Zoom ─────────────────────────────────────────────
function toggleZoom(e) {
    const img = e.currentTarget;
    isZoomed = !isZoomed;
    img.classList.toggle('zoomed', isZoomed);
    document.getElementById('modalBody').classList.toggle('zoomed-body', isZoomed);
}

// ─── Swipe ────────────────────────────────────────────
function onTouchStart(e) {
    touchStartX = e.changedTouches[0].clientX;
    touchStartY = e.changedTouches[0].clientY;
}
function onTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
        if (dx < 0) nextFile(null);
        else         prevFile(null);
    }
}

// ─── Navigation ───────────────────────────────────────
function stopCurrentMedia() {
    const video = document.querySelector('#modalBody video');
    if (video) video.pause();
    const body = document.getElementById('modalBody');
    body.removeEventListener('touchstart', onTouchStart);
    body.removeEventListener('touchend',   onTouchEnd);
}

function nextFile(e) {
    if (e) e.stopPropagation();
    stopCurrentMedia();
    openFullView((currentIndex + 1) % filteredFiles.length);
}
function prevFile(e) {
    if (e) e.stopPropagation();
    stopCurrentMedia();
    openFullView((currentIndex - 1 + filteredFiles.length) % filteredFiles.length);
}

function closeModal() {
    stopCurrentMedia();
    closeMenu();
    closeInfoPanel();
    document.getElementById('fileModal').style.display = 'none';
    document.body.style.overflow = '';
    isZoomed = false;
}
function closeModalOutside(e) {
    if (e.target.id === 'fileModal') closeModal();
}

document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('fileModal');
    if (!modal.style.display || modal.style.display === 'none') return;
    if (e.key === 'ArrowRight') nextFile(null);
    if (e.key === 'ArrowLeft')  prevFile(null);
    if (e.key === 'Escape')     closeModal();
});

// ─── Hamburger Menu ───────────────────────────────────
function toggleMenu(e) {
    e.stopPropagation();
    document.getElementById('dropdownMenu').classList.toggle('open');
}
function closeMenu() {
    document.getElementById('dropdownMenu').classList.remove('open');
}
document.addEventListener('click', (e) => {
    const menu = document.getElementById('dropdownMenu');
    const btn  = document.getElementById('menuToggleBtn');
    if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
        menu.classList.remove('open');
    }
});

// ─── Info Panel ───────────────────────────────────────
function showFileInfo(file, size, dateStr, ext) {
    document.getElementById('infoPanelContent').innerHTML = `
        <div class="info-row"><span class="info-label">ชื่อ</span><span class="info-val">${file.name}</span></div>
        <div class="info-row"><span class="info-label">ประเภท</span><span class="info-val">${ext}</span></div>
        <div class="info-row"><span class="info-label">ขนาด</span><span class="info-val">${size}</span></div>
        <div class="info-row"><span class="info-label">เพิ่มเมื่อ</span><span class="info-val">${dateStr}</span></div>
        <div class="info-row"><span class="info-label">ID</span><span class="info-val mono">${file.$id}</span></div>`;
    document.getElementById('infoPanel').classList.add('open');
}
function closeInfoPanel() {
    const p = document.getElementById('infoPanel');
    if (p) p.classList.remove('open');
}

// ─── Delete ───────────────────────────────────────────
async function deleteFile(id) {
    if (!confirm("ลบไฟล์นี้?")) return;
    try {
        await storage.deleteFile(BUCKET_ID, id);
        closeModal();
        loadFiles();
    } catch (e) { alert("Error: " + e.message); }
}

// ─── Download ─────────────────────────────────────────
function downloadFile(fileId, fileName) {
    const url = getFullUrl(fileId);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ─── Upload ───────────────────────────────────────────
async function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    const statusEl  = document.getElementById('status');
    if (!fileInput.files.length) return alert("เลือกไฟล์ก่อนจ้า");
    statusEl.innerHTML = `<span class="status-uploading">⏳ กำลังอัปโหลด...</span>`;
    try {
        await storage.createFile(BUCKET_ID, ID.unique(), fileInput.files[0]);
        statusEl.innerHTML = `<span class="status-success">✓ อัปโหลดสำเร็จ!</span>`;
        fileInput.value = '';
        document.getElementById('fileLabelBtn').innerText = "📁 เลือกไฟล์";
        setTimeout(() => { statusEl.innerHTML = ''; }, 3000);
        loadFiles();
    } catch (e) {
        statusEl.innerHTML = `<span class="status-error">✗ ${e.message}</span>`;
    }
}

function updateFileName() {
    const input = document.getElementById('fileInput');
    const label = document.getElementById('fileLabelBtn');
    if (input.files.length > 0) {
        const name = input.files[0].name;
        label.innerText = "📄 " + (name.length > 12 ? name.substring(0, 12) + "…" : name);
    }
}

function openAlbumManager()  { document.getElementById('albumOverlay').style.display = "flex"; }
function closeAlbumManager() { document.getElementById('albumOverlay').style.display = "none"; }