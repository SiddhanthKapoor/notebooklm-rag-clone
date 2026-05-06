document.addEventListener('DOMContentLoaded', () => {

    // ── Elements ─────────────────────────────────────────────────────────────
    const uploadCard    = document.getElementById('uploadCard');
    const chatCard      = document.getElementById('chatCard');

    const uploadForm    = document.getElementById('uploadForm');
    const fileInput     = document.getElementById('fileInput');
    const dropzone      = document.getElementById('dropzone');
    const dzDefault     = document.getElementById('dzDefault');
    const dzSelected    = document.getElementById('dzSelected');
    const dzFileName    = document.getElementById('dzFileName');
    const dzFileSize    = document.getElementById('dzFileSize');
    const dzClear       = document.getElementById('dzClear');
    const uploadBtn     = document.getElementById('uploadBtn');
    const uploadBtnLabel = document.getElementById('uploadBtnLabel');
    const uploadLoader  = document.getElementById('uploadLoader');
    const uploadError   = document.getElementById('uploadError');

    const chatDocName   = document.getElementById('chatDocName');
    const chatMessages  = document.getElementById('chatMessages');
    const chatForm      = document.getElementById('chatForm');
    const chatInput     = document.getElementById('chatInput');
    const sendBtn       = document.getElementById('sendBtn');
    const newDocBtn     = document.getElementById('newDocBtn');

    let sessionId   = null;
    let currentFile = null;

    // ── Drag & Drop ──────────────────────────────────────────────────────────

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('over');
    });
    ['dragleave', 'dragend'].forEach(ev =>
        dropzone.addEventListener(ev, () => dropzone.classList.remove('over'))
    );
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('over');
        const file = e.dataTransfer.files[0];
        if (file) pickFile(file);
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files[0]) pickFile(fileInput.files[0]);
    });

    dzClear.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        resetFile();
    });

    function pickFile(file) {
        currentFile = file;
        dzFileName.textContent = file.name;
        dzFileSize.textContent = fmtBytes(file.size);
        dzDefault.classList.add('hidden');
        dzSelected.classList.remove('hidden');
        uploadBtn.disabled = false;
        uploadBtnLabel.textContent = 'Process Document';
        uploadError.classList.add('hidden');
    }

    function resetFile() {
        currentFile = null;
        fileInput.value = '';
        dzDefault.classList.remove('hidden');
        dzSelected.classList.add('hidden');
        uploadBtn.disabled = true;
        uploadBtnLabel.textContent = 'Select a file to continue';
    }

    function fmtBytes(b) {
        if (b < 1024) return b + ' B';
        if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
        return (b / 1048576).toFixed(2) + ' MB';
    }

    // ── Upload ───────────────────────────────────────────────────────────────

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentFile) return;

        setUploading(true);
        uploadError.classList.add('hidden');

        const fd = new FormData();
        fd.append('document', currentFile);

        try {
            const res  = await fetch('/api/upload', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed. Please try again.');

            sessionId = data.sessionId;
            goToChat(currentFile.name);

        } catch (err) {
            uploadError.textContent = err.message;
            uploadError.classList.remove('hidden');
        } finally {
            setUploading(false);
        }
    });

    function setUploading(on) {
        uploadBtn.disabled = on;
        uploadBtnLabel.textContent = on ? 'Processing…' : 'Process Document';
        uploadLoader.classList.toggle('hidden', !on);
        fileInput.disabled = on;
    }

    // ── Screen Transitions ───────────────────────────────────────────────────

    function goToChat(filename) {
        chatDocName.textContent = filename;
        uploadCard.classList.add('hidden');
        chatCard.classList.remove('hidden');
        chatMessages.innerHTML = '';
        addBotMsg(`I've read and indexed **${filename}**. Ask me anything about it!`);
        chatInput.focus();
        sendBtn.disabled = false;
    }

    function goToUpload() {
        chatCard.classList.add('hidden');
        uploadCard.classList.remove('hidden');
        sessionId = null;
        sendBtn.disabled = true;
        resetFile();
    }

    newDocBtn.addEventListener('click', goToUpload);

    // ── Chat ─────────────────────────────────────────────────────────────────

    // Auto-grow textarea
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    });

    // Enter to send
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn.disabled) chatForm.requestSubmit();
        }
    });

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const q = chatInput.value.trim();
        if (!q || !sessionId) return;

        addUserMsg(q);
        chatInput.value = '';
        chatInput.style.height = 'auto';
        sendBtn.disabled = true;
        chatInput.disabled = true;

        const lid = addTyping();
        scrollDown();

        try {
            const res  = await fetch('/api/chat', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ sessionId, question: q })
            });
            const data = await res.json();
            removeEl(lid);
            if (!res.ok) throw new Error(data.error || 'Something went wrong.');
            addBotMsg(data.answer);

        } catch (err) {
            removeEl(lid);
            addNote('Error: ' + err.message);
        } finally {
            sendBtn.disabled = false;
            chatInput.disabled = false;
            chatInput.focus();
            scrollDown();
        }
    });

    // ── Message helpers ───────────────────────────────────────────────────────

    function md(text) {
        return text
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    }

    const SPARKLE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z"/><path d="M19 15l.94 2.06L22 18l-2.06.94L19 21l-.94-2.06L16 18l2.06-.94L19 15z" opacity="0.5"/></svg>`;

    function addUserMsg(text) {
        const row = document.createElement('div');
        row.className = 'msg-row user';
        row.innerHTML = `
            <div class="msg-avatar you">You</div>
            <div class="bubble user-bubble">${esc(text)}</div>`;
        chatMessages.appendChild(row);
        scrollDown();
    }

    function addBotMsg(text) {
        const row = document.createElement('div');
        row.className = 'msg-row';
        row.innerHTML = `
            <div class="msg-avatar ai">${SPARKLE}</div>
            <div class="bubble ai-bubble">${md(text)}</div>`;
        chatMessages.appendChild(row);
        scrollDown();
    }

    function addNote(text) {
        const p = document.createElement('p');
        p.className = 'system-note';
        p.textContent = text;
        chatMessages.appendChild(p);
        scrollDown();
    }

    function addTyping() {
        const id  = 'typing-' + Date.now();
        const row = document.createElement('div');
        row.id = id;
        row.className = 'msg-row';
        row.innerHTML = `
            <div class="msg-avatar ai">${SPARKLE}</div>
            <div class="bubble ai-bubble">
                <div class="typing"><span></span><span></span><span></span></div>
            </div>`;
        chatMessages.appendChild(row);
        return id;
    }

    function removeEl(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function esc(t) {
        return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function scrollDown() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});
