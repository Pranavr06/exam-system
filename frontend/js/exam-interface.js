let examId = null;
let questions = [];
let currentQuestionIndex = 0;
let answers = {}; // Map questionId -> optionId
let visited = new Set();
let markedForReview = new Set();
let timerInterval;
let proctoringSystem = null;
let remainingTime = 0;
let isSubmitting = false;

document.addEventListener("DOMContentLoaded", () => {
    requireAuth("student");
    
    const urlParams = new URLSearchParams(window.location.search);
    examId = urlParams.get('exam_id');

    if (!examId) {
        alert("No exam specified.");
        window.location.href = 'student-dashboard.html';
        return;
    }

    initializeExam();
    
    // Basic security is still useful
    document.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("copy", (e) => e.preventDefault());
    document.addEventListener("paste", (e) => e.preventDefault());
    
    // Prevent accidental refresh/back navigation
    window.addEventListener('beforeunload', (e) => {
        if (!isSubmitting) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
});

function injectLayoutStyles() {
    const style = document.createElement('style');
    style.textContent = `
        :root {
            --primary: #4F46E5; --primary-hover: #4338CA;
            --success: #10B981; --warning: #F59E0B; --danger: #EF4444;
            --gray-100: #F3F4F6; --gray-200: #E5E7EB; --gray-700: #374151; --gray-900: #111827;
        }
        body { font-family: 'Inter', 'Poppins', sans-serif; background: var(--gray-100); margin: 0; color: var(--gray-900); }
        
        /* 3-Column Layout */
        .exam-layout { display: grid; grid-template-columns: 280px 1fr 320px; height: 100vh; overflow: hidden; }
        .panel-left { background: white; border-right: 1px solid var(--gray-200); padding: 20px; display: flex; flex-direction: column; z-index: 5; }
        .panel-center { display: flex; flex-direction: column; position: relative; overflow-y: auto; }
        .panel-right { background: white; border-left: 1px solid var(--gray-200); padding: 20px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto; z-index: 5; }

        /* Header & Timer */
        .exam-header { padding: 15px 30px; background: white; border-bottom: 1px solid var(--gray-200); display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 10; }
        .timer-badge { background: var(--gray-100); padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 1.25rem; font-variant-numeric: tabular-nums; transition: all 0.3s; }
        .timer-badge.danger { background: #FEE2E2; color: var(--danger); animation: pulse 1s infinite; }

        /* Question Card */
        .question-wrapper { padding: 30px; flex: 1; max-width: 900px; margin: 0 auto; width: 100%; box-sizing: border-box;}
        .question-card { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); margin-bottom: 24px; position: relative; }
        .question-badge { position: absolute; top: 24px; right: 24px; background: #EEF2FF; color: var(--primary); padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 0.85rem; }
        .question-text { font-size: 1.15rem; font-weight: 500; margin-bottom: 24px; padding-right: 80px; line-height: 1.6; }

        /* Options */
        .options-grid { display: flex; flex-direction: column; gap: 12px; }
        .option-item { display: flex; align-items: center; gap: 16px; padding: 16px; border: 2px solid var(--gray-200); border-radius: 8px; cursor: pointer; transition: all 0.2s; background: white; font-size: 1rem;}
        .option-item:hover { border-color: var(--primary); background: #EEF2FF; }
        .option-item.selected { border-color: var(--primary); background: #EEF2FF; }
        .option-radio { width: 20px; height: 20px; border: 2px solid var(--gray-200); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;}
        .option-item.selected .option-radio { border-color: var(--primary); }
        .option-radio-inner { width: 10px; height: 10px; background: var(--primary); border-radius: 50%; opacity: 0; transition: opacity 0.2s; }
        .option-item.selected .option-radio-inner { opacity: 1; }

        /* Palette */
        .palette-legend { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; font-size: 0.8rem; font-weight: 500; }
        .legend-item { display: flex; align-items: center; gap: 6px; }
        .legend-dot { width: 12px; height: 12px; border-radius: 4px; }
        .palette-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; overflow-y: auto; padding-right: 5px;}
        .palette-item { aspect-ratio: 1; border-radius: 6px; border: 1px solid var(--gray-200); background: white; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; font-size: 0.9rem;}
        .palette-item:hover { transform: translateY(-2px); box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .palette-item.active { border-color: var(--primary); border-width: 2px; }
        .palette-item.answered { background: var(--success); color: white; border-color: var(--success); }
        .palette-item.review { background: var(--warning); color: white; border-color: var(--warning); }
        .palette-item.visited { background: var(--gray-200); border-color: var(--gray-200); color: var(--gray-700); }

        /* Footer */
        .exam-footer { background: white; border-top: 1px solid var(--gray-200); padding: 16px 30px; display: flex; justify-content: space-between; align-items: center; position: sticky; bottom: 0; z-index: 10;}
        .btn { padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; border: none; transition: all 0.2s; font-family: inherit; font-size: 0.95rem;}
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-outline { border: 1px solid var(--gray-200); background: white; color: var(--gray-700); }
        .btn-outline:hover:not(:disabled) { background: var(--gray-100); }
        .btn-primary { background: var(--primary); color: white; }
        .btn-primary:hover:not(:disabled) { background: var(--primary-hover); }
        .btn-danger { background: var(--danger); color: white; }
        .btn-warning { background: var(--warning); color: white; }

        /* Proctoring */
        .webcam-card { background: var(--gray-900); border-radius: 12px; overflow: hidden; position: relative; aspect-ratio: 4/3; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        .webcam-card video { width: 100%; height: 100%; object-fit: cover; }
        .recording-status { position: absolute; top: 12px; left: 12px; background: rgba(0,0,0,0.6); color: white; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; display: flex; align-items: center; gap: 6px; letter-spacing: 0.5px;}
        .pulse-dot { width: 8px; height: 8px; background: var(--success); border-radius: 50%; animation: pulse 2s infinite; }
        
        .proctoring-alert { background: white; border: 1px solid var(--gray-200); border-left: 4px solid var(--danger); padding: 12px; border-radius: 8px; margin-bottom: 10px; font-size: 0.85rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); animation: slideIn 0.3s ease-out; line-height: 1.4;}
        .proctoring-alert.warning { border-left-color: var(--warning); }
        
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
        @keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    `;
    document.head.appendChild(style);
}

function injectLayoutDOM(exam_mode) {
    const videoEl = document.getElementById('proctor-video');
    
    document.body.innerHTML = `
        <div class="exam-layout">
            <aside class="panel-left">
                <h3 style="margin-top: 0; margin-bottom: 16px; font-size: 1.1rem;">Question Palette</h3>
                <div class="palette-legend">
                    <div class="legend-item"><div class="legend-dot" style="background:var(--success)"></div> Answered</div>
                    <div class="legend-item"><div class="legend-dot" style="background:var(--warning)"></div> Review</div>
                    <div class="legend-item"><div class="legend-dot" style="background:var(--gray-200)"></div> Visited</div>
                    <div class="legend-item"><div class="legend-dot" style="border:1px solid var(--gray-200)"></div> Not Visited</div>
                </div>
                <div id="question-palette" class="palette-grid"></div>
            </aside>
            <main class="panel-center">
                <header class="exam-header">
                    <div>
                        <h2 id="exam-title" style="margin:0; font-size:1.25rem;">Loading Exam...</h2>
                        <div id="exam-subtitle" style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;"></div>
                    </div>
                    <div id="exam-timer" class="timer-badge">--:--:--</div>
                </header>
                <div id="question-container" class="question-wrapper"></div>
                <footer class="exam-footer">
                    <button id="btn-prev" onclick="prevQuestion()" class="btn btn-outline">Previous</button>
                    <div style="display:flex; gap:12px;">
                        <button id="btn-review" onclick="toggleReview()" class="btn btn-outline">Mark for Review</button>
                        <button id="btn-next" onclick="nextQuestion()" class="btn btn-primary">Save & Next</button>
                        <button onclick="submitExam()" class="btn btn-danger">Finish Exam</button>
                    </div>
                </footer>
            </main>
            <aside class="panel-right">
                <div>
                            <h3 style="margin-top:0; margin-bottom:12px; font-size: 1.1rem;">${exam_mode === 'CENTER' ? 'Screen Monitoring' : 'Live Monitoring'}</h3>
                            <div id="webcam-container" class="webcam-card" style="${exam_mode === 'CENTER' ? 'display:flex; align-items:center; justify-content:center; background:#1f2937;' : ''}">
                                ${exam_mode === 'CENTER' ? '<i class="fas fa-desktop" style="font-size: 3rem; color: #4b5563;"></i>' : ''}
                                <div class="recording-status"><span class="pulse-dot"></span> ${exam_mode === 'CENTER' ? 'Screen Recording' : 'Active'}</div>
                    </div>
                </div>
                        <div style="flex:1; overflow-y:auto; margin-top: 20px;">
                    <h4 style="margin-top:0; margin-bottom: 12px; font-size: 1rem; border-bottom:1px solid var(--gray-200); padding-bottom:8px;">Proctoring Logs</h4>
                    <div id="alerts-list"></div>
                </div>
            </aside>
        </div>
    `;

    if (videoEl && exam_mode === "ONLINE") {
        videoEl.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
        document.getElementById('webcam-container').appendChild(videoEl);
    } else if (videoEl) {
        videoEl.style.display = 'none';
    }
}

async function initializeExam() {
    try {
        // Fetch Questions (Attempt is already created on the previous screen)
        const data = await apiRequest(`/student/exams/questions?exam_id=${examId}`);
        
        // IMPORTANT: The backend endpoint `/student/exams/questions` must be modified 
        // to return `exam_mode` and `student_id` in its response.
        const exam_mode = data.exam_mode;
        const student_id = data.student_id;
        
        if (data.message && data.auto_submitted) {
             alert("Exam time has expired. It has been auto-submitted.");
             window.location.href = 'student-dashboard.html';
             return;
        }

        questions = data.questions;
        
        if (!questions || questions.length === 0) {
            alert("No questions found for this exam.");
            window.location.href = 'student-dashboard.html';
            return;
        }
        
        // Setup modern layout DOM
        injectLayoutStyles();
        injectLayoutDOM(exam_mode);

        // Set Timer & Title from Server Data
        document.getElementById('exam-title').textContent = data.exam_name;
        document.getElementById('exam-subtitle').textContent = `Mode: ${exam_mode} | Total Questions: ${questions.length}`;
        remainingTime = Math.floor(data.remaining_seconds);

        renderPalette();
        loadQuestion(0);

        // Initialize the proctoring system
        if (exam_mode && student_id) {
            proctoringSystem = new ProctoringSystem(examId, student_id, exam_mode);
        }

        // Pre-Exam Screen Share Overlay
        const overlay = document.createElement('div');
        overlay.id = 'exam-start-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(255,255,255,0.95); z-index: 100000;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            backdrop-filter: blur(10px);
        `;
        
        const reqText = `<p style="color:var(--danger); font-weight:600; margin-bottom: 24px; font-size:1.1rem;">You MUST share your ENTIRE SCREEN to proceed. Tabs or Windows will be rejected.</p>`;

        overlay.innerHTML = `
            <h1 style="font-size: 2.5rem; margin-bottom: 10px; color: var(--gray-900);">Ready to Begin</h1>
            ${reqText}
            <button id="btn-start-exam-overlay" class="btn btn-primary" style="font-size: 1.25rem; padding: 16px 32px; box-shadow: 0 4px 6px rgba(79, 70, 229, 0.3);">
                Share Screen & Start Exam
            </button>
        `;
        document.body.appendChild(overlay);

        document.getElementById('btn-start-exam-overlay').addEventListener('click', async () => {
            try {
                if (!document.fullscreenElement) {
                    await document.documentElement.requestFullscreen().catch(() => {});
                }
                
                if (proctoringSystem) {
                    await proctoringSystem.start();
                }
                
                overlay.style.display = 'none';
                startTimer(); // Start timer ONLY after screen share is accepted
            } catch (err) {
                alert("Failed to start proctoring: " + err.message);
                window.location.href = 'student-dashboard.html';
            }
        });

    } catch (error) {
        console.error("Exam init error", error);
        alert("Failed to start exam: " + error.message);
        window.location.href = 'student-dashboard.html';
    }
}

function renderPalette() {
    const palette = document.getElementById('question-palette');
    if (!palette) return;
    
    palette.innerHTML = questions.map((q, index) => {
        let classes = ['palette-item'];
        if (currentQuestionIndex === index) classes.push('active');
        
        if (answers[q.question_id]) {
            classes.push('answered');
        } else if (markedForReview.has(q.question_id)) {
            classes.push('review');
        } else if (visited.has(q.question_id)) {
            classes.push('visited');
        }
        
        return `<button class="${classes.join(' ')}" id="q-btn-${index}" onclick="loadQuestion(${index})">${index + 1}</button>`;
    }).join('');
}

function toggleReview() {
    const qId = questions[currentQuestionIndex].question_id;
    if (markedForReview.has(qId)) markedForReview.delete(qId);
    else markedForReview.add(qId);
    
    renderPalette();
    loadQuestion(currentQuestionIndex); // Refresh buttons
}

function loadQuestion(index) {
    if (index < 0 || index >= questions.length) return;
    
    currentQuestionIndex = index;
    const q = questions[index];
    const container = document.getElementById('question-container');
    visited.add(q.question_id);
    
    if (proctoringSystem) {
        proctoringSystem.currentQuestionId = q.question_id;
    }

    // Render Question
    container.innerHTML = `
        <div class="question-card">
            <div class="question-badge">${q.marks} Marks</div>
            <div class="question-text">
                <strong>Q${index + 1}.</strong> ${q.question_text}
            </div>
            <div class="options-grid">
                ${q.options.map(opt => `
                    <div class="option-item ${answers[q.question_id] == opt.option_id ? 'selected' : ''}" 
                         onclick="selectOption(${q.question_id}, ${opt.option_id}, this)">
                        <div class="option-radio">
                            <div class="option-radio-inner"></div>
                        </div>
                        <span>${opt.option_text}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // Update Buttons
    document.getElementById('btn-prev').disabled = index === 0;
    document.getElementById('btn-next').textContent = index === questions.length - 1 ? 'Save & Finish' : 'Save & Next';
    
    const reviewBtn = document.getElementById('btn-review');
    if (markedForReview.has(q.question_id)) {
        reviewBtn.textContent = "Unmark Review";
        reviewBtn.className = "btn btn-outline";
    } else {
        reviewBtn.textContent = "Mark for Review";
        reviewBtn.className = "btn btn-warning";
    }

    renderPalette();
}

async function selectOption(questionId, optionId, cardElement) {
    // UI Update
    const cards = cardElement.parentElement.querySelectorAll('.option-item');
    cards.forEach(c => c.classList.remove('selected'));
    cardElement.classList.add('selected');

    // State Update
    answers[questionId] = optionId;
    if (markedForReview.has(questionId)) {
        markedForReview.delete(questionId);
        loadQuestion(currentQuestionIndex); // update buttons
    } else {
        renderPalette();
    }

    // Backend Save (Silent)
    try {
        await apiRequest('/student/exams/submit-answer', 'POST', {
            exam_id: parseInt(examId),
            question_id: questionId,
            selected_option_id: optionId
        });
    } catch (error) {
        console.error("Failed to save answer", error);
    }
}

function nextQuestion() {
    if (currentQuestionIndex < questions.length - 1) {
        loadQuestion(currentQuestionIndex + 1);
    } else {
        submitExam();
    }
}

function prevQuestion() {
    if (currentQuestionIndex > 0) {
        loadQuestion(currentQuestionIndex - 1);
    }
}

function startTimer() {
    const timerDisplay = document.getElementById('exam-timer');
    
    timerInterval = setInterval(() => {
        remainingTime--;
        
        if (remainingTime <= 0) {
            clearInterval(timerInterval);
            isSubmitting = true; // Prevent violation trigger on alert
            submitExam(true); // Force submit
            return;
        }

        const hours = Math.floor(remainingTime / 3600);
        const minutes = Math.floor((remainingTime % 3600) / 60);
        const seconds = remainingTime % 60;

        if (remainingTime <= 300) {
            timerDisplay.classList.add('danger');
        } else {
            timerDisplay.classList.remove('danger');
        }

        timerDisplay.textContent = 
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

async function submitExam(force = false, message = null) {
    isSubmitting = true; // Prevent violation trigger on confirm dialog

    // Stop proctoring before showing any dialogs or navigating away
    if (proctoringSystem) {
        proctoringSystem.stop();
    }

    const answeredCount = Object.keys(answers).length;
    const totalCount = questions.length;
    const unansweredCount = totalCount - answeredCount;

    const confirmMsg = `Are you sure you want to submit?\n\nAnswered: ${answeredCount}\nUnanswered: ${unansweredCount}\n\nYou cannot change answers after submission.`;

    if (!force && !confirm(confirmMsg)) {
        isSubmitting = false; // Re-enable violations if cancelled
        if (proctoringSystem) proctoringSystem.start(); // Restart proctoring
        return;
    }

    // Automatically exit fullscreen when exam ends
    if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
    }

    clearInterval(timerInterval);
    
    try {
        await apiRequest('/student/exams/finish', 'POST', { exam_id: parseInt(examId) });
        alert(message || (force ? "Time is up! Your exam has been submitted." : "Exam submitted successfully!"));
        window.location.href = 'student-dashboard.html';
    } catch (error) {
        alert("Error submitting exam: " + error.message);
        window.location.href = 'student-dashboard.html';
    }
}