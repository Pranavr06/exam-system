let examId = null;
let questions = [];
let currentQuestionIndex = 0;
let answers = {}; // Map questionId -> optionId
let timerInterval;
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
    setupSecurity();
});

async function initializeExam() {
    try {
        // Fetch Questions (Attempt is already created on the previous screen)
        const data = await apiRequest(`/student/exams/questions?exam_id=${examId}`);
        
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

        // Set Timer & Title from Server Data
        document.getElementById('exam-title').textContent = data.exam_name;
        remainingTime = Math.floor(data.remaining_seconds);
        startTimer();

        renderPalette();
        loadQuestion(0);

    } catch (error) {
        console.error("Exam init error", error);
        alert("Failed to start exam: " + error.message);
        window.location.href = 'student-dashboard.html';
    }
}

function renderPalette() {
    const palette = document.getElementById('question-palette');
    palette.innerHTML = questions.map((q, index) => `
        <button class="q-btn" id="q-btn-${index}" onclick="loadQuestion(${index})">
            ${index + 1}
        </button>
    `).join('');
}

function loadQuestion(index) {
    if (index < 0 || index >= questions.length) return;
    
    currentQuestionIndex = index;
    const q = questions[index];
    const container = document.getElementById('question-container');

    // Update Palette Active State
    document.querySelectorAll('.q-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`q-btn-${index}`).classList.add('active');

    // Render Question
    container.innerHTML = `
        <div class="question-text">
            <strong>Q${index + 1}.</strong> ${q.question_text}
            <div style="font-size: 0.9rem; color: #718096; margin-top: 5px;">(Marks: ${q.marks})</div>
        </div>
        <div class="options-grid">
            ${q.options.map(opt => `
                <div class="option-card ${answers[q.question_id] == opt.option_id ? 'selected' : ''}" 
                     onclick="selectOption(${q.question_id}, ${opt.option_id}, this)">
                    <div class="option-radio" style="border: 2px solid ${answers[q.question_id] == opt.option_id ? '#3182ce' : '#cbd5e0'}; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        ${answers[q.question_id] == opt.option_id ? '<div style="width: 10px; height: 10px; background: #3182ce; border-radius: 50%;"></div>' : ''}
                    </div>
                    <span>${opt.option_text}</span>
                </div>
            `).join('')}
        </div>
    `;

    // Update Buttons
    document.getElementById('btn-prev').disabled = index === 0;
    document.getElementById('btn-next').textContent = index === questions.length - 1 ? 'Finish' : 'Next';
}

async function selectOption(questionId, optionId, cardElement) {
    // UI Update
    const cards = cardElement.parentElement.querySelectorAll('.option-card');
    cards.forEach(c => {
        c.classList.remove('selected');
        c.querySelector('.option-radio').innerHTML = '';
        c.querySelector('.option-radio').style.borderColor = '#cbd5e0';
    });
    
    cardElement.classList.add('selected');
    cardElement.querySelector('.option-radio').style.borderColor = '#3182ce';
    cardElement.querySelector('.option-radio').innerHTML = '<div style="width: 10px; height: 10px; background: #3182ce; border-radius: 50%;"></div>';

    // State Update
    answers[questionId] = optionId;
    document.getElementById(`q-btn-${currentQuestionIndex}`).classList.add('answered');

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

        timerDisplay.textContent = 
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

async function submitExam(force = false) {
    isSubmitting = true; // Prevent violation trigger on confirm dialog
    if (!force && !confirm("Are you sure you want to submit the exam? You cannot change answers after submission.")) {
        isSubmitting = false; // Re-enable violations if cancelled
        return;
    }

    clearInterval(timerInterval);
    
    try {
        await apiRequest('/student/exams/finish', 'POST', { exam_id: parseInt(examId) });
        if (force) {
            alert("Time is up! Your exam has been submitted.");
        } else {
            alert("Exam submitted successfully!");
        }
        window.location.href = 'student-dashboard.html';
    } catch (error) {
        alert("Error submitting exam: " + error.message);
        window.location.href = 'student-dashboard.html';
    }
}

// --- Security Features ---
function setupSecurity() {
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            handleViolation("TAB_SWITCH");
        }
    });
    window.addEventListener("blur", () => handleViolation("WINDOW_BLUR"));
    document.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("copy", (e) => e.preventDefault());
    document.addEventListener("paste", (e) => e.preventDefault());
}

async function handleViolation(type) {
    if (isSubmitting) return; // Ignore violations during submission
    document.getElementById('security-overlay').style.display = 'flex';
    try {
        const currentQ = questions[currentQuestionIndex] ? questions[currentQuestionIndex].question_id : 0;
        await apiRequest('/student/violation', 'POST', {
            exam_id: parseInt(examId),
            question_id: currentQ,
            violation_type: type,
            confidence_score: 1.0
        });
    } catch (error) { console.error("Failed to log violation", error); }
}

function resumeExam() {
    document.getElementById('security-overlay').style.display = 'none';
}