document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('uploadForm');
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadStatus = document.getElementById('uploadStatus');
    const chatSection = document.getElementById('chatSection');
    const chatContainer = document.getElementById('chatContainer');
    const chatForm = document.getElementById('chatForm');
    const questionInput = document.getElementById('question');
    const sendBtn = document.getElementById('sendBtn');

    let sessionId = null;

    // Handle File Upload
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const fileInput = document.getElementById('document');
        if (!fileInput.files || fileInput.files.length === 0) {
            return;
        }

        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('document', file);

        // Update UI state
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Processing Document... (Chunking & Embedding)';
        uploadStatus.className = 'status-msg hidden';

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to upload document');
            }

            // Success
            sessionId = data.sessionId;
            
            uploadStatus.textContent = 'Document successfully indexed! You can now start chatting.';
            uploadStatus.className = 'status-msg success';
            
            // Enable chat section
            chatSection.classList.remove('disabled');
            sendBtn.disabled = false;
            
            // Add system message
            chatContainer.innerHTML = '';
            addMessage(`I've read and indexed "${file.name}". What would you like to know about it?`, 'bot-msg');

        } catch (error) {
            uploadStatus.textContent = error.message;
            uploadStatus.className = 'status-msg error';
        } finally {
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Process Document';
        }
    });

    // Handle Chat Submission
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const question = questionInput.value.trim();
        if (!question || !sessionId) return;

        // Add user message
        addMessage(question, 'user-msg');
        
        // Clear input
        questionInput.value = '';
        
        // Add loading indicator
        const loadingId = addLoadingIndicator();
        
        // Disable input while processing
        questionInput.disabled = true;
        sendBtn.disabled = true;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: sessionId,
                    question: question
                })
            });

            const data = await response.json();

            // Remove loading indicator
            removeElement(loadingId);

            if (!response.ok) {
                throw new Error(data.error || 'Failed to get answer');
            }

            // Add bot response
            addMessage(data.answer, 'bot-msg');

        } catch (error) {
            removeElement(loadingId);
            addMessage(`Error: ${error.message}`, 'system-msg');
        } finally {
            // Re-enable input
            questionInput.disabled = false;
            sendBtn.disabled = false;
            questionInput.focus();
            
            // Scroll to bottom
            scrollToBottom();
        }
    });

    // Helper functions
    function parseMarkdown(text) {
        // Replace **text** with <strong>text</strong>
        let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Replace *text* with <em>text</em>
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        // Replace newlines with <br>
        html = html.replace(/\n/g, '<br>');
        return html;
    }

    function addMessage(text, className) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${className}`;
        msgDiv.innerHTML = parseMarkdown(text);
        chatContainer.appendChild(msgDiv);
        scrollToBottom();
    }

    function addLoadingIndicator() {
        const id = 'loading-' + Date.now();
        const msgDiv = document.createElement('div');
        msgDiv.id = id;
        msgDiv.className = 'message bot-msg';
        msgDiv.innerHTML = '<div class="loading"><span></span><span></span><span></span></div>';
        chatContainer.appendChild(msgDiv);
        scrollToBottom();
        return id;
    }

    function removeElement(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
});
