const { Client, Storage, Account, ID } = Appwrite;
const client = new Client().setEndpoint('https://nyc.cloud.appwrite.io/v1').setProject('69b8d66a0037b414c51d');
const storage = new Storage(client);
const account = new Account(client);
const BUCKET_ID = '69b8d6e500188b62e88b';

let allFiles = [];
let filteredFiles = []; // BUG FIX: ใช้ filteredFiles สำหรับ navigation แทน allFiles
let currentIndex = -1;

async function init() {
    try {
        await account.createAnonymousSession();
    } catch (e) { /* session อาจมีอยู่แล้ว */ }
    loadFiles();
}
init();

async function loadFiles() {
    const gallery = document.getElementById('gallery');
    gallery.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>กำลังโหลด...</span></div>`;
    try {
        const response = await storage.listFiles(BUCKET_ID);
        allFiles = response.files;

        const filter = document.getElementById('filterType').value;
        const sort = document.getElementById('sortOrder').value;

        // BUG FIX: กรองและเรียงข้อมูลก่อนแสดงผล และเก็บลง filteredFiles
        filteredFiles = filter === 'all' ? [...allFiles] : allFiles.filter(f => f.mimeType.includes(filter));

        if (sort === 'largest') {
            filteredFiles.sort((a, b) => b.sizeOriginal - a.sizeOriginal);
        } else {
            filteredFiles.sort((a, b) => new Date(b.$createdAt) - new Date(a.$createdAt));
        }

        if (filteredFiles.length === 0) {
            gallery.innerHTML = `<div class="empty-state"><p>ยังไม่มีไฟล์ในที่นี้</p></div>`;
            return;
        }

        gallery.innerHTML = "";
        filteredFiles.forEach((file, index) => {
            const fileUrl = storage.getFileView(BUCKET_ID, file.$id);
            const isImage = file.mimeType.includes('image');
            const card = document.createElement('div');
            card.className = 'file-card';
            card.style.animationDelay = `${index * 40}ms`;
            card.innerHTML = `
                <div class="media-container" onclick="openFullView(${index})">
                    ${isImage
                        ? `<img src="${fileUrl}" loading="lazy" alt="${file.name}">`
                        : `<video src="${fileUrl}" preload="metadata"></video>`
                    }
                    <div class="card-overlay">
                        <span class="file-type-badge">${file.name.split('.').pop().toUpperCase()}</span>
                    </div>
                </div>
            `;
            gallery.appendChild(card);
        });
    } catch (e) {
        gallery.innerHTML = `<div class="empty-state"><p>โหลดไม่ได้ กรุณาลองใหม่</p></div>`;
        console.error(e);
    }
}

function openFullView(index) {
    // BUG FIX: ใช้ filteredFiles แทน allFiles เพื่อให้ navigation ตรงกับที่แสดงใน gallery
    if (index < 0 || index >= filteredFiles.length) return;
    currentIndex = index;
    const file = filteredFiles[currentIndex];
    const fileUrl = storage.getFileView(BUCKET_ID, file.$id);

    const modal = document.getElementById('fileModal');
    const body = document.getElementById('modalBody');
    const details = document.getElementById('fileDetails');
    const delBtn = document.getElementById('modalDeleteBtn');

    const size = file.sizeOriginal < 1024 * 1024
        ? (file.sizeOriginal / 1024).toFixed(1) + ' KB'
        : (file.sizeOriginal / (1024 * 1024)).toFixed(2) + ' MB';
    const date = new Date(file.$createdAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
    const ext = file.name.split('.').pop().toUpperCase();

    details.innerHTML = `
        <div class="detail-name">${file.name}</div>
        <div class="detail-meta">
            <span>${ext}</span>
            <span>·</span>
            <span>${size}</span>
        </div>
        <div class="detail-date">${date}</div>
    `;

    // BUG FIX: clear innerHTML ก่อนใส่ใหม่เพื่อกัน memory leak จาก video element
    body.innerHTML = '';
    if (file.mimeType.includes('image')) {
        const img = document.createElement('img');
        img.src = fileUrl;
        img.className = 'modal-content';
        img.alt = file.name;
        body.appendChild(img);
    } else {
        const video = document.createElement('video');
        video.src = fileUrl;
        video.controls = true;
        video.className = 'modal-content';
        video.autoplay = false;
        body.appendChild(video);
    }

    // อัปเดต counter
    document.getElementById('fileCounter').textContent = `${currentIndex + 1} / ${filteredFiles.length}`;

    delBtn.onclick = () => deleteFile(file.$id);
    modal.style.display = "flex";
    document.body.style.overflow = 'hidden';
}

// BUG FIX: navigation ใช้ filteredFiles และหยุด video เมื่อเปลี่ยนไฟล์
function stopCurrentMedia() {
    const body = document.getElementById('modalBody');
    const video = body.querySelector('video');
    if (video) video.pause();
}

function nextFile(e) {
    if (e) e.stopPropagation();
    stopCurrentMedia();
    let nextIdx = (currentIndex + 1) % filteredFiles.length;
    openFullView(nextIdx);
}

function prevFile(e) {
    if (e) e.stopPropagation();
    stopCurrentMedia();
    let prevIdx = (currentIndex - 1 + filteredFiles.length) % filteredFiles.length;
    openFullView(prevIdx);
}

function closeModal() {
    stopCurrentMedia();
    document.getElementById('fileModal').style.display = "none";
    document.body.style.overflow = '';
}

function closeModalOutside(e) {
    if (e.target.id === 'fileModal') closeModal();
}

// BUG FIX: เพิ่ม keyboard navigation
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('fileModal');
    if (modal.style.display === 'none' || !modal.style.display) return;
    if (e.key === 'ArrowRight') nextFile(null);
    if (e.key === 'ArrowLeft') prevFile(null);
    if (e.key === 'Escape') closeModal();
});

async function deleteFile(id) {
    if (!confirm("ลบไฟล์นี้?")) return;
    try {
        await storage.deleteFile(BUCKET_ID, id);
        closeModal();
        loadFiles();
    } catch (e) { alert("Error: " + e.message); }
}

async function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    const statusEl = document.getElementById('status');
    if (!fileInput.files.length) return alert("เลือกไฟล์ก่อนจ้า");
    statusEl.innerHTML = `<span class="status-uploading">⏳ กำลังอัปโหลด...</span>`;
    try {
        await storage.createFile(BUCKET_ID, ID.unique(), fileInput.files[0]);
        statusEl.innerHTML = `<span class="status-success">✓ อัปโหลดสำเร็จ!</span>`;
        fileInput.value = "";
        document.getElementById('fileLabelBtn').innerText = "📁 เลือกไฟล์";
        setTimeout(() => statusEl.innerHTML = '', 3000);
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

function openAlbumManager() { document.getElementById('albumOverlay').style.display = "flex"; }
function closeAlbumManager() { document.getElementById('albumOverlay').style.display = "none"; }