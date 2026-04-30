document.addEventListener("DOMContentLoaded", () => {
    // Ensure user is logged in and is an admin
    requireAuth("admin");

    // Initialize Dashboard Data
    loadUserProfile();
    loadDashboardStats(); // Load the new dashboard stats
    loadSections();
    loadSubjects();
    loadTeachers(); // Load teachers for dropdown
    loadExams();
    populateBatchYearDropdown();
    populateExamScopeDropdowns();
    loadLabHierarchy();
    
    // Load Lists
    loadSectionsList();
    loadSubjectsList();
    loadTeachersList();
    loadStudentsList();
    loadAssignmentsList();
    loadExamsList();

    // Toggle Section Dropdown based on Scope
    const scopeSelect = document.getElementById('exam-scope');
    const sectionContainer = document.getElementById('exam-section-container');
    const batchContainer = document.getElementById('exam-batch-container');
    const sectionSelect = document.getElementById('exam-section-select');
    const batchYearSelect = document.getElementById('exam-batch-year');
    const semesterSelect = document.getElementById('exam-semester');

    if (scopeSelect) {
        scopeSelect.addEventListener('change', (e) => {
            if (e.target.value === 'SECTION') {
                sectionContainer.style.display = 'block';
                batchContainer.style.display = 'none';
                sectionSelect.required = true;
                batchYearSelect.required = false;
                semesterSelect.required = false;
            } else if (e.target.value === 'BATCH') {
                sectionContainer.style.display = 'none';
                batchContainer.style.display = 'flex';
                sectionSelect.required = false;
                batchYearSelect.required = true;
                semesterSelect.required = true;
            } else {
                sectionContainer.style.display = 'none';
                batchContainer.style.display = 'none';
                sectionSelect.required = false;
                batchYearSelect.required = false;
                semesterSelect.required = false;
            }
        });

        // Initialize state
        const initialEvent = new Event('change');
        scopeSelect.dispatchEvent(initialEvent);
    }

    // Center Exam mode listeners
    const modeSelect = document.getElementById('exam-mode');
    if (modeSelect) {
        modeSelect.addEventListener('change', toggleExamMode);
        const blockSelect = document.getElementById('exam-block');
        if (blockSelect) blockSelect.addEventListener('change', handleBlockChange);
        const floorSelect = document.getElementById('exam-floor');
        if (floorSelect) floorSelect.addEventListener('change', handleFloorChange);
    }

    // Load questions when exam is selected
    const questionExamSelect = document.getElementById('question-exam-id');
    if (questionExamSelect) {
        questionExamSelect.addEventListener('change', (e) => {
            loadQuestionsForExam(e.target.value);
        });
    }
});

// Load User Profile for Navbar
async function loadUserProfile() {
    try {
        const profile = await apiRequest('/admin/profile');
        document.getElementById('nav-user').textContent = profile.name;
        document.getElementById('nav-dept').textContent = profile.department_name;
    } catch (error) {
        console.error("Failed to load profile", error);
        document.getElementById('nav-user').textContent = "Admin";
    }
}

let navHistory = [];
let isNavigatingBack = false;

// UI Tab Switching Logic
function showSection(sectionName) {
    // Capture active section for history
    const activeSection = document.querySelector('.form-container.active');
    if (activeSection && !isNavigatingBack) {
        const activeId = activeSection.id.replace('-section', '');
        if (activeId !== sectionName) {
            navHistory.push(activeId);
        }
    }
    isNavigatingBack = false;

    // Hide all forms
    document.querySelectorAll('.form-container').forEach(div => {
        div.classList.remove('active');
    });
    
    // Remove active class from sidebar buttons
    document.querySelectorAll('.sidebar button').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected form and highlight button
    document.getElementById(`${sectionName}-section`).classList.add('active');
    document.querySelector(`.sidebar button[data-section="${sectionName}"]`).classList.add('active');

    updateBreadcrumb(sectionName);

    // Reset form to ensure clean state (clears hidden IDs from previous edits)
    if (['section', 'subject', 'teacher', 'student', 'exam'].includes(sectionName)) {
        resetForm(sectionName);
    } else if (sectionName === 'assignment') {
        resetForm('assignment');
    }
    if (sectionName === 'my-exams') {
        loadAdminExams();
    }

    if (sectionName === 'result') {
        loadResults();
    }
    if (sectionName === 'violations') {
        loadViolationAnalytics();
    }
    if (sectionName === 'logs') {
        loadSystemLogs();
    }
}

function goBack() {
    if (navHistory.length === 0) return;
    const prevSection = navHistory.pop();
    isNavigatingBack = true;
    showSection(prevSection);
}

function updateBreadcrumb(section) {
    const breadcrumb = document.getElementById('breadcrumb');
    if (!breadcrumb) return;

    const sectionNames = {
        'dashboard': 'Dashboard',
        'section': 'Add Section',
        'subject': 'Add Subject',
        'teacher': 'Add Teacher',
        'student': 'Add Student',
        'assignment': 'Assign Classes',
        'exam': 'Create Exam',
        'my-exams': 'My Exams',
        'question': 'Add Questions',
        'result': 'View Results',
        'violations': 'Violations',
        'logs': 'System Logs'
    };

    const name = sectionNames[section] || section.charAt(0).toUpperCase() + section.slice(1);
    
    const backButtonHtml = navHistory.length > 0 
        ? `<button class="back-btn" onclick="goBack()" title="Go Back"><i class="fas fa-arrow-left"></i></button>` 
        : '';

    breadcrumb.innerHTML = `
        <div class="breadcrumb-container">
            ${backButtonHtml}
            <a onclick="showSection('dashboard')">Home</a>
            <span class="separator">/</span>
            <span class="current">${name}</span>
        </div>
    `;
}

// --- Dashboard Stats Loader ---
async function loadDashboardStats() {
    try {
        const stats = await apiRequest('/admin/dashboard/stats');
        const container = document.getElementById('admin-stats-container');
        
        if (container) {
            // 1. Summary Cards
            container.innerHTML = `
                <div class="stat-card" onclick="showSection('section')">
                    <div class="stat-value">${stats.total_sections}</div>
                    <div class="stat-label">Sections</div>
                    <div class="stat-icon">🏢</div>
                </div>
                <div class="stat-card" onclick="showSection('subject')">
                    <div class="stat-value">${stats.total_subjects}</div>
                    <div class="stat-label">Subjects</div>
                    <div class="stat-icon">📚</div>
                </div>
                <div class="stat-card" onclick="showSection('teacher')">
                    <div class="stat-value">${stats.total_teachers}</div>
                    <div class="stat-label">Teachers</div>
                    <div class="stat-icon">👨‍🏫</div>
                </div>
                <div class="stat-card" onclick="showSection('student')">
                    <div class="stat-value">${stats.total_students}</div>
                    <div class="stat-label">Students</div>
                    <div class="stat-icon">🎓</div>
                </div>
                <div class="stat-card" onclick="showSection('exam')">
                    <div class="stat-value">${stats.total_exams}</div>
                    <div class="stat-label">Exams</div>
                    <div class="stat-icon">📝</div>
                </div>
            `;
        }

        // 2. Alerts
        const alertsContainer = document.getElementById('admin-alerts-container');
        if (alertsContainer) {
            if (stats.alerts.length === 0) {
                alertsContainer.innerHTML = '<div class="alert-box success">✅ System Healthy. No alerts.</div>';
            } else {
                alertsContainer.innerHTML = stats.alerts.map(a => `
                    <div class="alert-box ${a.type}" style="display: flex; justify-content: space-between; align-items: center;">
                        <span>${a.message}</span>
                        ${a.action === 'add_questions' ? `<button onclick="goToAddQuestions(${a.exam_id})" class="btn-edit" style="margin-left: 10px; font-size: 0.8rem; padding: 4px 8px;">Fix Now</button>` : ''}
                    </div>
                `).join('');
            }
        }

        // 3. Recent Exams Table
        const recentExamsTable = document.querySelector('#admin-recent-exams-table tbody');
        if (recentExamsTable) {
            if (stats.recent_exams.length === 0) {
                recentExamsTable.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">No recent exams</td></tr>';
            } else {
                recentExamsTable.innerHTML = stats.recent_exams.slice(0, 5).map(e => `
                    <tr>
                        <td><strong>${e.exam_name}</strong></td>
                        <td>${
                            e.exam_scope === 'DEPARTMENT' ? 'Entire Department' :
                            e.exam_scope === 'BATCH' ? `Batch ${e.batch_year} - Sem ${e.semester} (${e.section_details || 'All Sections'})` :
                            e.exam_scope === 'SECTION' ? `Specific: ${e.section_details || 'N/A'}`
                            : (e.section_details || 'N/A')
                        }</td>
                        <td>${new Date(e.date).toLocaleDateString()}</td>
                        <td><span class="status-badge ${e.status}">${e.status}</span></td>
                    </tr>
                `).join('');
            }
        }

        // 4. Performance Chart
        if (stats.performance_by_subject && stats.performance_by_subject.length > 0) {
            renderAdminPerformanceChart(stats.performance_by_subject);
        }

    } catch (error) {
        console.error("Dashboard stats error", error);
    }
}

let adminChart = null;

function renderAdminPerformanceChart(data) {
    const ctx = document.getElementById('adminPerformanceChart');
    if (!ctx) return;

    if (adminChart) {
        adminChart.destroy();
    }

    const labels = data.map(d => d.subject_name);
    const scores = data.map(d => d.avg_percentage);

    adminChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Average Score (%)',
                data: scores,
                backgroundColor: 'rgba(43, 108, 176, 0.6)',
                borderColor: 'rgba(43, 108, 176, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Average Percentage'
                    }
                }
            },
            plugins: {
                legend: { display: false },
                title: { display: false } // Title is in the card header
            }
        }
    });
}

function populateBatchYearDropdown() {
    const select = document.getElementById('section-batch-year');
    if (!select) return;

    const currentYear = new Date().getFullYear();
    const startYear = 2000;
    const endYear = currentYear + 5;

    select.innerHTML = '<option value="">Select Batch</option>'; // Clear existing options

    for (let year = endYear; year >= startYear; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (year === currentYear) {
            option.selected = true;
        }
        select.appendChild(option);
    }
}

function populateExamScopeDropdowns() {
    const batchSelect = document.getElementById('exam-batch-year');
    const semSelect = document.getElementById('exam-semester');
    if (!batchSelect || !semSelect) return;

    const currentYear = new Date().getFullYear();
    batchSelect.innerHTML = '<option value="">Select Batch</option>';
    for (let year = currentYear + 5; year >= 2000; year--) {
        batchSelect.appendChild(new Option(year, year));
    }

    semSelect.innerHTML = '<option value="">Select Semester</option>';
    for (let i = 1; i <= 8; i++) {
        semSelect.appendChild(new Option(i, i));
    }
}

// Generic Form Handler
async function handleFormSubmit(event, endpoint) {
    event.preventDefault();
    
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.textContent : 'Submit';
    
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // --- EXAM FORM VALIDATION ---
    if (endpoint.includes('exams')) {
        const duration = parseInt(data.duration);
        if (isNaN(duration) || duration < 5 || duration > 180) {
            return alert("Please enter a valid duration between 5 and 180 minutes.");
        }

        const examDate = new Date(data.exam_date || data.date);
        if (examDate < new Date()) {
            return alert("Cannot schedule an exam in the past.");
        }

        if (data.exam_scope === 'SECTION' && !data.section_id) {
            return alert("Please select a specific section.");
        }
        if (data.exam_scope === 'BATCH' && (!data.batch_year || !data.semester)) {
            return alert("Please select both Batch Year and Semester.");
        }
    }

    // Anti-spam Safety
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';
    }

    // Handle multiple section_ids for bulk assignments
    if (endpoint.includes('assignments')) {
        const sectionSelect = form.querySelector('#assign-section');
        if (sectionSelect && sectionSelect.multiple) {
            if (!data.assignment_id) {
                // Bulk Create
                data.section_ids = Array.from(sectionSelect.selectedOptions).map(opt => parseInt(opt.value));
                delete data.section_id;
            } else {
                // Edit Single
                data.section_id = parseInt(sectionSelect.value);
            }
        }
    }

    // Check for Edit Mode
    let finalEndpoint = endpoint;
    let method = "POST";

    if (data.teacher_id && endpoint.includes('teachers')) {
        finalEndpoint = `/admin/teachers/${data.teacher_id}`;
        method = "PUT";
    } else if (data.student_id && endpoint.includes('students')) {
        finalEndpoint = `/admin/students/${data.student_id}`;
        method = "PUT";
    } else if (data.subject_id && endpoint.includes('subjects')) {
        finalEndpoint = `/admin/subjects/${data.subject_id}`;
        method = "PUT";
    } else if (data.section_id_hidden && endpoint.includes('sections')) {
        finalEndpoint = `/admin/sections/${data.section_id_hidden}`;
        method = "PUT";
    } else if (data.exam_id_hidden && endpoint.includes('exams')) {
        finalEndpoint = `/admin/exams/${data.exam_id_hidden}`;
        method = "PUT";
    } else if (data.assignment_id && endpoint.includes('assignments')) {
        finalEndpoint = `/admin/assignments/${data.assignment_id}`;
        method = "PUT";
    }

    // Convert numeric strings to integers (Backend expects integers for IDs and duration)
    const numericFields = ['department_id', 'subject_id', 'duration', 'exam_id', 'section_id', 'semester', 'total_marks', 'batch_year', 'lab_id'];
    for (let key in data) {
        if (numericFields.includes(key)) {
            data[key] = parseInt(data[key]);
        }
    }

    // Handle boolean field for exam overrides
    if (data.override_conflicts) data.override_conflicts = (data.override_conflicts === 'true' || data.override_conflicts === 'on');

    try {
        const result = await apiRequest(finalEndpoint, method, data);

        alert("Success: " + (result.message || "Operation completed"));
        
        // Reset form based on section
        if (endpoint.includes('teachers')) resetForm('teacher');
        else if (endpoint.includes('students')) resetForm('student');
        else if (endpoint.includes('subjects')) resetForm('subject');
        else if (endpoint.includes('sections')) resetForm('section');
        else if (endpoint.includes('exams')) resetForm('exam');
        else if (endpoint.includes('assignments')) resetForm('assignment');

        // Refresh lists based on endpoint
        if (endpoint.includes('teachers')) {
            loadTeachersList();
        } else if (endpoint.includes('students')) {
            loadStudentsList();
        } else if (endpoint.includes('subjects')) {
            loadSubjectsList();
            loadSubjects(); // Refresh dropdown
        } else if (endpoint.includes('sections')) {
            loadSectionsList();
            loadSections(); // Refresh dropdown
        } else if (endpoint.includes('exams')) {
            loadExamsList();
            loadExams(); // Refresh dropdown
        } else if (endpoint.includes('assignments')) {
            loadAssignmentsList();
        }
    } catch (error) {
        console.error("API Error:", error);
        // Try to parse the error message if it's a JSON string
        try {
            const errorObj = JSON.parse(error.message);
            let msg = errorObj.detail || "Operation failed";
            if (typeof msg === 'object') {
                msg = JSON.stringify(msg);
            }
            alert("Error: " + msg);
        } catch (e) {
            alert("Error: " + error.message);
        }
    } finally {
        // Restore button state
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    }
}

// Specific Handler for Saving Questions (Add or Update)
async function handleSaveQuestion(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const questionId = formData.get("question_id");

    // 1. Basic Fields
    const payload = {
        exam_id: parseInt(formData.get("exam_id")),
        question_text: formData.get("question_text"),
        marks: parseFloat(formData.get("marks")),
        options: []
    };

    if (payload.marks > 4) {
        alert("Marks cannot exceed 4");
        return;
    }
    if (payload.marks < 0.25) {
        alert("Marks cannot be less than 0.25");
        return;
    }

    // 2. Construct Options Array
    const correctIndex = parseInt(formData.get("correct_option"));
    
    for (let i = 0; i < 4; i++) {
        const optionText = formData.get(`option_${i}`);
        if (optionText) {
            payload.options.push({
                text: optionText,
                is_correct: (i === correctIndex)
            });
        }
    }

    try {
        let result;
        if (questionId) {
            // Update existing question
            result = await apiRequest(`/admin/questions/${questionId}`, "PUT", payload);
        } else {
            // Create new question
            result = await apiRequest("/admin/exams/add-question", "POST", payload);
        }
        
        alert("Success: " + result.message);
        
        resetQuestionForm();

        // Refresh the question list
        loadQuestionsForExam(payload.exam_id);
    } catch (error) {
        alert("Error: " + error.message);
    }
}

// Load questions for selected exam
async function loadQuestionsForExam(examId, page = 1) {
    const container = document.getElementById('questions-list');
    const paginationContainer = document.getElementById('pagination-controls');
    const summaryContainer = document.getElementById('marks-summary-admin');

    if (!container) return;
    
    if (!examId) {
        container.innerHTML = '<p style="color: #666;">Select an exam to view questions.</p>';
        if (paginationContainer) paginationContainer.innerHTML = '';
        if (summaryContainer) summaryContainer.innerHTML = '';
        return;
    }

    container.innerHTML = '<p>Loading...</p>';

    try {
        const response = await apiRequest(`/admin/exams/${examId}/questions?page=${page}&limit=5`);
        const { questions, total_pages, exam_total_marks, total_marks_used } = response || {};
        
        if (typeof exam_total_marks === 'undefined' || typeof total_marks_used === 'undefined') {
            throw new Error("Incomplete marks data from server.");
        }

        if (summaryContainer) {
            const remaining = exam_total_marks - total_marks_used;
            summaryContainer.innerHTML = `Allocated: ${total_marks_used || 0} / ${exam_total_marks} | <span style="color: ${remaining < 0 ? '#e53e3e' : '#28a745'}">Remaining: ${remaining.toFixed(2)}</span>`;
            if (remaining < 0) {
                summaryContainer.style.borderColor = '#e53e3e';
                summaryContainer.style.backgroundColor = '#fee2e2';
            } else {
                summaryContainer.style.borderColor = '#bee3f8';
                summaryContainer.style.backgroundColor = '#ebf8ff';
            }
        }
        
        if (!questions || questions.length === 0) {
            container.innerHTML = '<p>No questions added yet.</p>';
            if (paginationContainer) paginationContainer.innerHTML = '';
            return;
        }

        let html = '<ul style="list-style: none; padding: 0;">';
        questions.forEach(q => {
            html += `
                <li class="question-item">
                    <div class="question-content">
                        <div class="question-text">${q.question_text}</div>
                        <small class="question-marks">Marks: ${q.marks}</small>
                    </div>
                    <div class="question-actions">
                        <button type="button" onclick="editQuestion(${q.question_id})" class="btn-edit">Edit</button>
                        <button type="button" onclick="deleteQuestion(${q.question_id})" class="btn-delete">Delete</button>
                    </div>
                </li>
            `;
        });
        html += '</ul>';
        container.innerHTML = html;

        // Render Pagination Controls
        if (paginationContainer) {
            const totalPages = total_pages || 1;
            let paginationHtml = '';
            if (totalPages > 1) {
                // Previous Button
                paginationHtml += `<button type="button" onclick="loadQuestionsForExam(${examId}, ${page - 1})" ${page === 1 ? 'disabled' : ''} style="padding: 5px 10px; cursor: pointer; border: 1px solid #dee2e6; background: ${page === 1 ? '#e9ecef' : 'white'};">&laquo;</button>`;
                
                // Page Numbers
                for (let i = 1; i <= totalPages; i++) {
                    paginationHtml += `<button type="button" onclick="loadQuestionsForExam(${examId}, ${i})" style="padding: 5px 10px; cursor: pointer; background-color: ${i === page ? '#007bff' : 'white'}; color: ${i === page ? 'white' : 'black'}; border: 1px solid #dee2e6;">${i}</button>`;
                }

                // Next Button
                paginationHtml += `<button type="button" onclick="loadQuestionsForExam(${examId}, ${page + 1})" ${page === totalPages ? 'disabled' : ''} style="padding: 5px 10px; cursor: pointer; border: 1px solid #dee2e6; background: ${page === totalPages ? '#e9ecef' : 'white'};">&raquo;</button>`;
            }
            paginationContainer.innerHTML = paginationHtml;
        }
    } catch (error) {
        console.error("Failed to load questions", error);
        container.innerHTML = '<p style="color: red;">Error loading questions.</p>';
    }
}

// Modal State
let questionIdToDelete = null;

// Open Modal
function deleteQuestion(questionId) {
    questionIdToDelete = questionId;
    document.getElementById('delete-modal').style.display = 'block';
}

// Close Modal
function closeDeleteModal() {
    document.getElementById('delete-modal').style.display = 'none';
    questionIdToDelete = null;
}

// Confirm Deletion
async function confirmDeleteQuestion() {
    if (!questionIdToDelete) return;
    
    try {
        await apiRequest(`/admin/questions/${questionIdToDelete}`, "DELETE");
        
        // Reload questions
        const examId = document.getElementById('question-exam-id').value;
        if (examId) {
            loadQuestionsForExam(examId);
        }
        closeDeleteModal();
    } catch (error) {
        alert("Failed to delete: " + error.message);
        closeDeleteModal();
    }
}

// Edit Question Handler
async function editQuestion(questionId) {
    try {
        const question = await apiRequest(`/admin/questions/${questionId}`);
        
        // Populate form
        document.getElementById('question-id-hidden').value = question.question_id;
        document.getElementById('question-text').value = question.question_text;
        document.getElementById('question-marks').value = question.marks;
        document.getElementById('question-exam-id').value = question.exam_id;

        // Populate options
        if (question.options && question.options.length > 0) {
            question.options.forEach((opt, index) => {
                if (index < 4) {
                    document.getElementsByName(`option_${index}`)[0].value = opt.option_text;
                    if (opt.is_correct) {
                        document.querySelector(`input[name="correct_option"][value="${index}"]`).checked = true;
                    }
                }
            });
        }

        // Change UI state
        document.getElementById('save-question-btn').textContent = "Update Question";
        document.getElementById('cancel-edit-btn').style.display = "inline-block";
        
        // Scroll to form
        document.getElementById('question-section').scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        alert("Failed to load question details: " + error.message);
    }
}

// Reset Form Handler
function resetQuestionForm() {
    const form = document.getElementById('question-form');
    form.reset();
    document.getElementById('question-id-hidden').value = "";
    document.getElementById('save-question-btn').textContent = "Add Question";
    document.getElementById('cancel-edit-btn').style.display = "none";
}

// Password Visibility Toggle
function togglePasswordVisibility(id, btn) {
    const input = document.getElementById(id);
    if (input.type === "password") {
        input.type = "text";
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07-2.3 2.3"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
    } else {
        input.type = "password";
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    }
}

// --- Import Students ---
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'block';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
}

function openImportModal() {
    openModal('import-modal');
}

async function handleImportStudents(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const submitBtn = form.querySelector('button[type="submit"]');
    
    submitBtn.disabled = true;
    submitBtn.textContent = "Importing...";

    try {
        // Use fetch directly for file upload to handle FormData correctly
        const token = localStorage.getItem('access_token');
        const apiUrl = window.API_BASE_URL ? `${window.API_BASE_URL}/admin/students/import` : 'http://127.0.0.1:8000/admin/students/import';
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || "Import failed");

        alert(`Import Complete!\nAdded: ${result.stats.added}\nSkipped: ${result.stats.skipped}\nErrors: ${result.stats.errors.length}`);
        closeModal('import-modal');
        loadStudentsList();
    } catch (error) {
        alert("Error: " + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Upload & Import";
    }
}

function downloadStudentTemplate() {
    // Template matching backend expectations
    const headers = ["name", "email", "usn", "semester", "section_id", "section_label", "password"];
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "student_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- Center-Based Exam UI Logic ---
let labHierarchy = [];

async function loadLabHierarchy() {
    try {
        labHierarchy = await apiRequest('/infrastructure/labs');
        populateBlockDropdown();
    } catch (error) {
        console.error("Failed to load infrastructure data", error);
    }
}

function populateBlockDropdown() {
    const blockSelect = document.getElementById('exam-block');
    if (!blockSelect) return;
    
    blockSelect.innerHTML = '<option value="">Select Block</option>';
    const uniqueBlocks = [...new Map(labHierarchy.map(item => [item.block_id, {id: item.block_id, name: item.block_name}])).values()];
    
    uniqueBlocks.forEach(block => {
        blockSelect.appendChild(new Option(block.name, block.id));
    });
}

function handleBlockChange() {
    const blockId = document.getElementById('exam-block').value;
    const floorSelect = document.getElementById('exam-floor');
    const labSelect = document.getElementById('exam-lab');
    if (!floorSelect || !labSelect) return;
    
    floorSelect.innerHTML = '<option value="">Select Floor</option>';
    labSelect.innerHTML = '<option value="">Select Lab</option>';
    if (!blockId) return;
    
    const floorsInBlock = labHierarchy.filter(item => item.block_id == blockId);
    const uniqueFloors = [...new Map(floorsInBlock.map(item => [item.floor_id, {id: item.floor_id, number: item.floor_number}])).values()];
    uniqueFloors.forEach(floor => floorSelect.appendChild(new Option(floor.number === -1 ? 'Basement' : floor.number === 0 ? 'Ground Floor' : `Floor ${floor.number}`, floor.id)));
}

function handleFloorChange() {
    const floorId = document.getElementById('exam-floor').value;
    const labSelect = document.getElementById('exam-lab');
    if (!labSelect) return;
    
    labSelect.innerHTML = '<option value="">Select Lab</option>';
    if (!floorId) return;
    
    const labsInFloor = labHierarchy.filter(item => item.floor_id == floorId);
    const uniqueLabs = [...new Map(labsInFloor.map(item => [item.lab_id, {id: item.lab_id, name: item.lab_name}])).values()];
    uniqueLabs.forEach(lab => labSelect.appendChild(new Option(lab.name, lab.id)));
}

function toggleExamMode() {
    const mode = document.getElementById('exam-mode').value;
    const centerContainer = document.getElementById('center-exam-container');
    if (!centerContainer) return;
    
    centerContainer.style.display = mode === 'CENTER' ? 'flex' : 'none';
    document.getElementById('exam-lab').required = mode === 'CENTER';
    document.getElementById('exam-password').required = mode === 'CENTER';
}

// --- PC Assignment Logic ---
let currentPCOptions = [];

async function openAssignPCModal(examId) {
    document.getElementById('assign-pc-exam-id').value = examId;
    const tbody = document.getElementById('assign-pc-tbody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>';
    document.getElementById('assign-pc-modal').style.display = 'block';

    try {
        const data = await apiRequest(`/exams/${examId}/center-details`);
        
        document.getElementById('assign-pc-student-count').textContent = data.students.length;
        document.getElementById('assign-pc-count').textContent = data.pcs.length;
        currentPCOptions = data.pcs;

        if (data.students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No students assigned to this exam sections.</td></tr>';
            return;
        }

        let optionsHtml = '<option value="">-- Select PC --</option>';
        data.pcs.forEach(pc => {
            optionsHtml += `<option value="${pc.pc_id}">${pc.pc_number} (${pc.status})</option>`;
        });

        tbody.innerHTML = data.students.map(s => `
            <tr class="pc-assignment-row" data-student-id="${s.student_id}">
                <td><strong>${s.name}</strong></td>
                <td>${s.usn}</td>
                <td>${s.section_name}</td>
                <td>
                    <select class="pc-select" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid #ccc;">
                        ${optionsHtml}
                    </select>
                </td>
            </tr>
        `).join('');

        document.querySelectorAll('.pc-assignment-row').forEach(row => {
            const studentId = row.getAttribute('data-student-id');
            if (data.assignments[studentId]) row.querySelector('.pc-select').value = data.assignments[studentId];
        });
    } catch (error) {
        closeAssignPCModal();
        alert(error.message);
    }
}

function closeAssignPCModal() { document.getElementById('assign-pc-modal').style.display = 'none'; }

function autoAssignPCs() {
    let pcIndex = 0;
    document.querySelectorAll('.pc-assignment-row .pc-select').forEach(select => {
        if (pcIndex < currentPCOptions.length) select.value = currentPCOptions[pcIndex++].pc_id;
        else select.value = "";
    });
}

async function submitPCAssignments() {
    const examId = document.getElementById('assign-pc-exam-id').value;
    const assignments = [], usedPcs = new Set();

    for (let row of document.querySelectorAll('.pc-assignment-row')) {
        const pcId = row.querySelector('.pc-select').value;
        if (pcId) {
            if (usedPcs.has(pcId)) return alert("Error: Multiple students cannot be assigned to the same PC.");
            usedPcs.add(pcId);
            assignments.push({ student_id: parseInt(row.getAttribute('data-student-id')), pc_id: parseInt(pcId) });
        }
    }
    if (assignments.length === 0 && !confirm("No PCs assigned. Save anyway and clear existing?")) return;
    try {
        alert((await apiRequest(`/exams/${examId}/assign-pc`, 'POST', assignments)).message);
        closeAssignPCModal();
    } catch (error) { alert("Error: " + error.message); }
}

// Load Teachers into Dropdown (for Assignment)
async function loadTeachers() {
    try {
        const teachers = await apiRequest('/admin/teachers');
        const select = document.getElementById('assign-teacher');
        if (select) {
            select.innerHTML = '<option value="">Select Teacher</option>';
            const filterSelect = document.getElementById('filter-teacher');
            if (filterSelect) filterSelect.innerHTML = '<option value="">All Teachers</option>';
            const assignFilterSelect = document.getElementById('assignment-filter-teacher');
            if (assignFilterSelect) assignFilterSelect.innerHTML = '<option value="">All Teachers</option>';

            teachers.forEach(t => {
                const option = document.createElement('option');
                option.value = t.teacher_id;
                option.textContent = t.name;
                select.appendChild(option);
                if (filterSelect) filterSelect.appendChild(new Option(t.name, t.teacher_id));
                if (assignFilterSelect) assignFilterSelect.appendChild(new Option(t.name, t.teacher_id));
            });
        }
    } catch (error) { console.error("Failed to load teachers for dropdown", error); }
}

// Load Subjects into Dropdown
async function loadSubjects() {
    try {
        const subjects = await apiRequest('/admin/subjects');
        const select = document.getElementById('exam-subject');
        if (select) {
            select.innerHTML = '<option value="">Select Subject</option>';
            // Also populate the assignment subject dropdown
            const assignSelect = document.getElementById('assign-subject');
            if (assignSelect) assignSelect.innerHTML = '<option value="">Select Subject</option>';
            const filterSelect = document.getElementById('filter-subject');
            if (filterSelect) filterSelect.innerHTML = '<option value="">All Subjects</option>';
            const assignFilterSelect = document.getElementById('assignment-filter-subject');
            if (assignFilterSelect) assignFilterSelect.innerHTML = '<option value="">All Subjects</option>';
            const myExamFilterSelect = document.getElementById('my-exam-filter-subject');
            if (myExamFilterSelect) myExamFilterSelect.innerHTML = '<option value="">All Subjects</option>';

            subjects.forEach(sub => {
                select.appendChild(new Option(sub.subject_name, sub.subject_id));
                if (assignSelect) assignSelect.appendChild(new Option(sub.subject_name, sub.subject_id));
                if (filterSelect) filterSelect.appendChild(new Option(sub.subject_name, sub.subject_id));
                if (assignFilterSelect) assignFilterSelect.appendChild(new Option(sub.subject_name, sub.subject_id));
                if (myExamFilterSelect) myExamFilterSelect.appendChild(new Option(sub.subject_name, sub.subject_id));
            });
        }
    } catch (error) { console.error("Failed to load subjects", error); }
}

// Load Sections into Dropdowns (Student & Exam forms)
async function loadSections() {
    try {
        const sections = await apiRequest('/admin/sections');
        
        const populateSelect = (id) => {
            const select = document.getElementById(id);
            if(select) {
                select.innerHTML = '<option value="">Select Section</option>';
                sections.forEach(sec => {
                    const option = document.createElement('option');
                    option.value = sec.section_id;
                option.textContent = `${sec.section_name} (${sec.batch_year}, Sem ${sec.semester})`;
                    select.appendChild(option);
                });
            }
        };

        populateSelect('student-section-id');
        populateSelect('exam-section-select');
        populateSelect('assign-section'); // Add to assignment dropdown
        populateSelect('filter-section'); // Add to result filter
        populateSelect('student-filter-section'); // Add to student filter
        populateSelect('assignment-filter-section'); // Add to assignment filter

    } catch (error) { console.error("Failed to load sections", error); }
}

// Load Exams into Dropdown
async function loadExams() {
    try {
        const exams = await apiRequest('/admin/exams');
        
        const populateExamSelect = (id) => {
            const select = document.getElementById(id);
            if (select) {
                select.innerHTML = '<option value="">Select Exam</option>';
                exams.forEach(exam => {
                    if (id === 'question-exam-id' && exam.status === 'completed') return;

                    const option = document.createElement('option');
                    option.value = exam.exam_id;
                    const scopeLabel = exam.exam_scope === 'DEPARTMENT' ? '(Entire Dept)' : 
                                       exam.exam_scope === 'BATCH' ? `(Batch ${exam.batch_year} - Sem ${exam.semester})` :
                                       `(${exam.section_details || 'Specific Section'})`;
                    option.textContent = `${exam.exam_name} ${scopeLabel}`;
                    select.appendChild(option);
                });
            }
        };

        populateExamSelect('question-exam-id');
    } catch (error) { console.error("Failed to load exams", error); }
}

// --- List Loading Functions ---

async function loadTeachersList() {
    const container = document.getElementById('teachers-list');
    if (!container) return;
    container.innerHTML = '<p>Loading...</p>';
    try {
        const teachers = await apiRequest('/admin/teachers');
        if (teachers.length === 0) {
            container.innerHTML = '<p>No teachers found.</p>';
            return;
        }
        const listHtml = teachers.map(t => 
            `<div class="question-item">
                <div class="question-content"><strong>${t.name}</strong> (${t.email})</div>
                <div class="question-actions">
                    <button onclick="editEntity('teacher', ${t.teacher_id})" class="btn-edit">Edit</button>
                    <button onclick="openDeleteTeacherModal(${t.teacher_id}, '${t.name}')" class="btn-edit" style="background-color: #D97706; color: white; border: none; margin-right: 5px;">Replace</button>
                    <button onclick="openDeleteTeacherModal(${t.teacher_id}, '${t.name}')" class="btn-delete">Delete</button>
                </div>
            </div>`
        ).join('');
        container.innerHTML = listHtml;
    } catch (error) {
        console.error("Failed to load teachers", error);
        container.innerHTML = '<p style="color: red;">Error loading teachers.</p>';
    }
}

async function loadStudentsList() {
    const tbody = document.getElementById('students-table-body');
    if (!tbody) return;

    const semester = document.getElementById('student-filter-semester').value;
    const sectionId = document.getElementById('student-filter-section').value;
    const search = document.getElementById('student-filter-search').value;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';

    try {
        const queryParams = new URLSearchParams();
        if (semester) queryParams.append('semester', semester);
        if (sectionId) queryParams.append('section_id', sectionId);
        if (search) queryParams.append('search', search);

        const students = await apiRequest(`/admin/students?${queryParams.toString()}`);
        
        if (students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No students found.</td></tr>';
            return;
        }

        tbody.innerHTML = students.map(s => `
            <tr>
                <td>${s.usn}</td>
                <td><strong>${s.name}</strong></td>
                <td>${s.email}</td>
                <td>${s.semester} / ${s.section_name || '-'}</td>
                <td>
                    <button onclick="editEntity('student', ${s.student_id})" class="btn-edit">Edit</button>
                    <button onclick="deleteEntity('students', ${s.student_id})" class="btn-delete">Delete</button>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error("Failed to load students", error);
        tbody.innerHTML = '<tr><td colspan="5" style="color:red; text-align:center;">Error loading students.</td></tr>';
    }
}

async function loadSubjectsList() {
    const container = document.getElementById('subjects-list');
    if (!container) return;
    container.innerHTML = '<p>Loading...</p>';
    try {
        const subjects = await apiRequest('/admin/subjects');
        if (subjects.length === 0) {
            container.innerHTML = '<p>No subjects found.</p>';
            return;
        }
        const listHtml = subjects.map(s => 
            `<div class="question-item">
                <div class="question-content">${s.subject_name}</div>
                <div class="question-actions">
                    <button onclick="editEntity('subject', ${s.subject_id})" class="btn-edit">Edit</button>
                    <button onclick="deleteEntity('subjects', ${s.subject_id})" class="btn-delete">Delete</button>
                </div>
            </div>`
        ).join('');
        container.innerHTML = listHtml;
    } catch (error) {
        console.error("Failed to load subjects", error);
        container.innerHTML = '<p style="color: red;">Error loading subjects.</p>';
    }
}

async function loadSectionsList() {
    const tbody = document.getElementById('sections-table-body');
    if (!tbody) return;
    
    const semester = document.getElementById('section-filter-semester').value;
    const search = document.getElementById('section-filter-search').value;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';
    
    try {
        const queryParams = new URLSearchParams();
        if (semester) queryParams.append('semester', semester);
        if (search) queryParams.append('search', search);

        const sections = await apiRequest(`/admin/sections?${queryParams.toString()}`);
        
        if (sections.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No sections found.</td></tr>';
            return;
        }

        tbody.innerHTML = sections.map(s => `
            <tr>
                <td><strong>${s.section_name}</strong></td>
                <td>${s.batch_year || '-'}</td>
                <td>${s.semester}</td>
                <td>${s.student_count}</td>
                <td>
                    <button onclick="editEntity('section', ${s.section_id})" class="btn-edit">Edit</button>
                    <button onclick="deleteEntity('sections', ${s.section_id})" class="btn-delete">Delete</button>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error("Failed to load sections", error);
        tbody.innerHTML = '<tr><td colspan="5" style="color:red; text-align:center;">Error loading sections.</td></tr>';
    }
}

async function loadExamsList() {
    const container = document.getElementById('exams-list');
    if (!container) return;
    container.innerHTML = '<p>Loading...</p>';
    try {
        const exams = await apiRequest('/admin/exams');
        const filteredExams = exams.filter(e => e.status !== 'completed');
        if (filteredExams.length === 0) {
            container.innerHTML = '<p>No exams found.</p>';
            return;
        }
        const listHtml = filteredExams.map(e => {
            const scopeLabel = e.exam_scope === 'DEPARTMENT' ? '(Entire Dept)' :
                               e.exam_scope === 'BATCH' ? `(Batch ${e.batch_year} - Sem ${e.semester})` :
                               `(${e.section_details || 'Specific Section'})`;
            
            let actionsHtml = '';
            if (e.status === 'completed') {
                actionsHtml = `
                    <button onclick="viewExamResults(${e.exam_id})" class="btn-edit" style="background-color: #6f42c1; color: white;">Results</button>
                    <button onclick="deleteEntity('exams', ${e.exam_id})" class="btn-delete">Delete</button>
                `;
            } else if (e.status === 'active') {
                actionsHtml = `
                    <button onclick="viewExamResults(${e.exam_id})" class="btn-edit" style="background-color: #6f42c1; color: white;">Results</button>
                    ${e.mode === 'CENTER' ? `<button onclick="openAssignPCModal(${e.exam_id})" class="btn-edit" style="background-color: #4F46E5; color: white;" title="Assign Center PCs">PCs</button>` : ''}
                    <button onclick="deleteEntity('exams', ${e.exam_id})" class="btn-delete">Delete</button>
                `;
            } else {
                actionsHtml = `
                    <button onclick="editEntity('exam', ${e.exam_id})" class="btn-edit">Edit</button>
                    <button onclick="publishExam(${e.exam_id})" class="btn-edit" style="background-color: #17a2b8; color: white;">Publish</button>
                    <button onclick="goToAddQuestions(${e.exam_id})" class="btn-edit" style="background-color: #28a745; color: white;" title="Add/View Questions">+Q</button>
                    ${e.mode === 'CENTER' ? `<button onclick="openAssignPCModal(${e.exam_id})" class="btn-edit" style="background-color: #4F46E5; color: white;" title="Assign Center PCs">PCs</button>` : ''}
                    <button onclick="deleteEntity('exams', ${e.exam_id})" class="btn-delete">Delete</button>
                `;
            }

            return `<div class="question-item" style="border-left: 4px solid ${e.status === 'active' ? '#28a745' : e.status === 'completed' ? '#6f42c1' : '#ffc107'};">
                <div class="question-content">
                    <strong>${e.exam_name} <span style="font-weight:normal; font-size:0.85em; color:#666;">${scopeLabel}</span></strong>
                    <div style="font-size: 0.85rem; color: #666; margin-top: 4px;">
                        Marks: ${e.total_marks} | Duration: ${e.duration}m | Status: <span class="status-badge ${e.status}">${e.status}</span>
                    </div>
                </div>
                <div class="question-actions">
                    ${actionsHtml}
                </div>
            </div>`;
        }).join('');
        container.innerHTML = listHtml;
    } catch (error) {
        console.error("Failed to load exams", error);
        container.innerHTML = '<p style="color: red;">Error loading exams.</p>';
    }
}

let showingArchived = false;
function toggleArchivedExams() {
    showingArchived = !showingArchived;
    const btn = document.getElementById('toggle-archived-btn');
    if (btn) btn.textContent = showingArchived ? "View Active" : "View Archived";
    loadAdminExams();
}

async function loadAdminExams() {
    const tbody = document.getElementById('my-exams-tbody');
    const deptBody = document.getElementById('dept-exams-tbody');
    if (!tbody || !deptBody) return;

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading...</td></tr>';
    deptBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading...</td></tr>';
    
    const subjectId = document.getElementById('my-exam-filter-subject').value;
    const status = document.getElementById('my-exam-filter-status').value;
    const search = document.getElementById('my-exam-filter-search').value;

    // Update Headers based on view mode
    const myHeader = document.getElementById('my-exams-header');
    const deptHeader = document.getElementById('dept-exams-header');
    if (myHeader) myHeader.textContent = showingArchived ? "My Created Exams (Archived)" : "My Created Exams";
    if (deptHeader) deptHeader.textContent = showingArchived ? "Department Exams (Archived)" : "Department Exams";

    try {
        const queryParams = new URLSearchParams();
        if (subjectId) queryParams.append('subject_id', subjectId);
        if (status) queryParams.append('status', status);
        if (search) queryParams.append('search', search);
        if (showingArchived) queryParams.append('archived', 'true');

        const allExams = await apiRequest(`/admin/exams?${queryParams.toString()}`);
        const profile = await apiRequest('/admin/profile'); // Need ID to filter
        const myId = profile.admin_id; // Assuming profile returns admin_id, if not check response

        // Filter
        const myExams = allExams.filter(e => e.created_by_admin == myId);
        const deptExams = allExams.filter(e => e.created_by_admin != myId); // Teachers or other admins
        
        const renderRow = (e, isMyExam) => {
            const scopeLabel = e.exam_scope === 'DEPARTMENT' ? '(Entire Dept)' :
                               e.exam_scope === 'BATCH' ? `(Batch ${e.batch_year} - Sem ${e.semester})` :
                               `(${e.section_details || 'Specific Section'})`;
            
            let statusBadge = `<span class="status-badge ${e.status}">${e.status}</span>`;
            if (e.exam_type === 'retake') {
                statusBadge += ` <span style="font-size:0.75em; background:#e2e8f0; padding:2px 4px; border-radius:4px;">Retake</span>`;
            }

            let actionsHtml = '';
            
            if (showingArchived) {
                actionsHtml = `
                    <button onclick="restoreExam(${e.exam_id})" class="btn-edit" style="background-color: #3182ce; color: white;">Restore</button>
                `;
            } else if (e.status === 'completed') {
                actionsHtml = `
                    <button onclick="viewExamResults(${e.exam_id})" class="btn-edit" style="background-color: #6f42c1; color: white;">Results</button>
                    <button onclick="deleteEntity('exams', ${e.exam_id})" class="btn-delete">Delete</button>
                    <button onclick="openReExamModal(${e.exam_id}, ${e.duration})" class="btn-edit" style="background-color: #ed8936; color: white;">Re-Exam</button>
                `;
            } else if (e.status === 'active') {
                actionsHtml = `
                    <button onclick="viewExamResults(${e.exam_id})" class="btn-edit" style="background-color: #6f42c1; color: white;">Results</button>
                    ${e.mode === 'CENTER' ? `<button onclick="openAssignPCModal(${e.exam_id})" class="btn-edit" style="background-color: #4F46E5; color: white;" title="Assign Center PCs">PCs</button>` : ''}
                    <button onclick="deleteEntity('exams', ${e.exam_id})" class="btn-delete">Delete</button>
                `;
            } else {
                actionsHtml = `
                    ${isMyExam ? `<button onclick="editEntity('exam', ${e.exam_id})" class="btn-edit">Edit</button>` : ''}
                    <button onclick="publishExam(${e.exam_id})" class="btn-edit" style="background-color: #17a2b8; color: white;">Publish</button>
                    <button onclick="goToAddQuestions(${e.exam_id})" class="btn-edit" style="background-color: #28a745; color: white;" title="Add/View Questions">+Q</button>
                    ${e.mode === 'CENTER' ? `<button onclick="openAssignPCModal(${e.exam_id})" class="btn-edit" style="background-color: #4F46E5; color: white;" title="Assign Center PCs">PCs</button>` : ''}
                    <button onclick="deleteEntity('exams', ${e.exam_id})" class="btn-delete">Delete</button>
                `;
            }

            return `
            <tr>
                <td><strong>${e.exam_name}</strong> <span style="font-weight:normal; font-size:0.85em; color:#666;">${scopeLabel}</span></td>
                <td>${e.subject_name}</td>
                <td>${e.total_marks}</td>
                <td>${e.section_details || (e.exam_scope === 'DEPARTMENT' ? 'All' : 'Batch')}</td>
                <td>${new Date(e.date).toLocaleString()} ${e.parent_exam_id ? '<br><small>(Retake)</small>' : ''}</td>
                <td>${statusBadge}</td>
                <td class="question-actions">
                    ${actionsHtml}
                </td>
            </tr>
            `;
        };

        if (myExams.length === 0) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No exams created by you.</td></tr>';
        else tbody.innerHTML = myExams.map(e => renderRow(e, true)).join('');

        if (deptExams.length === 0) deptBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No other department exams.</td></tr>';
        else deptBody.innerHTML = deptExams.map(e => renderRow(e, false)).join('');

    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="7" style="color:red; text-align:center;">Error: ${error.message}</td></tr>`;
        deptBody.innerHTML = '';
    }
}

async function restoreExam(examId) {
    if (!confirm("Restore this exam? It will appear in the active list.")) return;
    try {
        const result = await apiRequest(`/admin/exams/${examId}/restore`, 'PUT');
        alert(result.message);
        loadAdminExams();
    } catch (error) {
        alert("Error: " + error.message);
    }
}

function goToAddQuestions(examId) {
    showSection('question');
    resetQuestionForm();
    const select = document.getElementById('question-exam-id');
    if (select) {
        select.value = examId;
        select.dispatchEvent(new Event('change'));
    }
}

async function openReExamModal(examId, duration) {
    const modal = document.getElementById('re-exam-modal');
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';

    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.style.margin = '0';
        modalContent.style.borderRadius = '8px';
        modalContent.style.maxWidth = '500px';
        modalContent.style.width = '90%';
    }

    document.getElementById('re-exam-id').value = examId;
    document.body.style.overflow = 'hidden';
    
    const durationInput = document.getElementById('re-exam-duration');
    durationInput.value = duration;
    durationInput.min = 5;
    durationInput.max = 180;

    const dateInput = document.getElementById('re-exam-date');
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    dateInput.min = now.toISOString().slice(0, 16);
    dateInput.value = "";

    document.getElementById('re-exam-type').value = "class";
    toggleReExamType();

    const submitBtn = document.querySelector('#re-exam-modal button[onclick="submitReExam()"]');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Schedule Re-Exam';
    }

    // Load students for this exam (from results or sections)
    const studentSelect = document.getElementById('re-exam-students');
    studentSelect.innerHTML = '<option>Loading...</option>';
    
    try {
        const results = await apiRequest(`/admin/exams/${examId}/results`);
        studentSelect.innerHTML = '';
        if(results.length === 0) {
             studentSelect.innerHTML = '<option disabled value="">No students found in results yet.</option>';
        } else {
            results.forEach(r => {
                studentSelect.appendChild(new Option(`${r.name} (${r.usn}) - ${r.result_status || 'Absent'}`, r.student_id));
            });
        }
    } catch (e) {
        studentSelect.innerHTML = '<option disabled value="">Error loading students</option>';
    }
}

function closeReExamModal() {
    document.getElementById('re-exam-modal').style.display = 'none';
    document.body.style.overflow = '';
}

function toggleReExamType() {
    const type = document.getElementById('re-exam-type').value;
    document.getElementById('re-exam-students-container').style.display = type === 'students' ? 'block' : 'none';
}

async function submitReExam() {
    const examId = document.getElementById('re-exam-id').value;
    const type = document.getElementById('re-exam-type').value;
    const dateInput = document.getElementById('re-exam-date');
    const durationInput = document.getElementById('re-exam-duration');
    const overrideEl = document.getElementById('re-exam-override');
    const override = overrideEl ? overrideEl.checked : false;
    const submitBtn = document.querySelector('#re-exam-modal button[onclick="submitReExam()"]');
    
    // 1. Validate Date
    if (!dateInput.value) return alert("Please select a date and time for the re-exam.");
    if (new Date(dateInput.value) < new Date()) return alert("Cannot schedule a re-exam in the past.");

    // 2. Validate Duration
    const duration = parseInt(durationInput.value);
    if (isNaN(duration) || duration < 5 || duration > 180) {
        return alert("Please enter a valid duration between 5 and 180 minutes.");
    }
    
    const payload = { exam_date: dateInput.value, duration: duration, override_conflicts: override };
    let url = `/admin/exams/${examId}/re-exam/class`;

    // 3. Validate Students
    if (type === 'students') {
        const studentSelect = document.getElementById('re-exam-students');
        const students = Array.from(studentSelect.selectedOptions).map(o => parseInt(o.value)).filter(val => !isNaN(val));
        
        if (students.length === 0) {
            return alert("You selected 'Specific Students' but haven't chosen any. Please select at least one student.");
        }
        payload.student_ids = students;
        url = `/admin/exams/${examId}/re-exam/students`;
    }

    // 4. Disable Button & Show Loading
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';
    }

    try {
        const res = await apiRequest(url, 'POST', payload);
        alert(res.message);
        closeReExamModal();
        loadAdminExams();
    } catch (e) { 
        alert("Error: " + e.message); 
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Schedule Re-Exam';
        }
    }
}

async function publishExam(examId) {
    if (!confirm("Are you sure you want to publish this exam? This will validate that question marks match the total marks.")) return;
    try {
        const result = await apiRequest(`/admin/exams/${examId}/publish`, "POST");
        alert(result.message);
        loadExamsList();
        loadAdminExams();
        loadDashboardStats();
    } catch (error) {
        alert("Publish Failed: " + error.message);
    }
}

async function viewExamResults(examId) {
    const modal = document.getElementById('results-modal');
    const tbody = document.querySelector('#results-table tbody');
    
    modal.style.display = 'block';
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';

    try {
        const results = await apiRequest(`/admin/exams/${examId}/results`);
        
        if (results.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No results found yet.</td></tr>';
            return;
        }

        tbody.innerHTML = results.map(r => `
            <tr>
                <td>${r.usn}</td>
                <td>${r.name}</td>
                <td><strong>${r.total_marks}</strong></td>
                <td>${r.result_status}</td>
                <td>${new Date(r.generated_time).toLocaleString()}</td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Error: ${error.message}</td></tr>`;
    }
}

function closeResultsModal() {
    document.getElementById('results-modal').style.display = 'none';
}

async function loadAssignmentsList() {
    const tbody = document.getElementById('assignments-table-body');
    if (!tbody) return;

    const semester = document.getElementById('assignment-filter-semester').value;
    const sectionId = document.getElementById('assignment-filter-section').value;
    const teacherId = document.getElementById('assignment-filter-teacher').value;
    const subjectId = document.getElementById('assignment-filter-subject').value;
    const search = document.getElementById('assignment-filter-search').value;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';

    try {
        const queryParams = new URLSearchParams();
        if (semester) queryParams.append('semester', semester);
        if (sectionId) queryParams.append('section_id', sectionId);
        if (teacherId) queryParams.append('teacher_id', teacherId);
        if (subjectId) queryParams.append('subject_id', subjectId);
        if (search) queryParams.append('search', search);

        const assignments = await apiRequest(`/admin/assignments?${queryParams.toString()}`);
        
        if (assignments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No assignments found.</td></tr>';
            return;
        }

        tbody.innerHTML = assignments.map(a => `
            <tr>
                <td><strong>${a.teacher_name}</strong></td>
                <td>${a.subject_name}</td>
                <td>${a.section_name}</td>
                <td>${a.semester}</td>
                <td>
                    <button onclick="editEntity('assignment', ${a.assignment_id})" class="btn-edit">Edit</button>
                    <button onclick="deleteEntity('assignments', ${a.assignment_id})" class="btn-delete">Remove</button>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error("Failed to load assignments", error);
        tbody.innerHTML = '<tr><td colspan="5" style="color:red; text-align:center;">Error loading assignments.</td></tr>';
    }
}

// --- Teacher Deletion with Transfer ---
let teacherIdToDelete = null;

async function openDeleteTeacherModal(id, name) {
    teacherIdToDelete = id;
    document.getElementById('delete-teacher-name').textContent = name;
    
    const select = document.getElementById('transfer-teacher-select');
    select.innerHTML = '<option value="">Loading...</option>';
    
    try {
        const teachers = await apiRequest('/admin/teachers');
        select.innerHTML = '<option value="">-- Select Replacement Teacher --</option>';
        
        teachers.forEach(t => {
            if (t.teacher_id !== id) { // Don't show the teacher being deleted
                select.appendChild(new Option(t.name, t.teacher_id));
            }
        });
        
        document.getElementById('delete-teacher-modal').style.display = 'flex';
    } catch (error) {
        alert("Failed to load teachers list.");
    }
}

async function confirmDeleteTeacher() {
    if (!teacherIdToDelete) return;
    const transferTo = document.getElementById('transfer-teacher-select').value;
    
    let url = `/admin/teachers/${teacherIdToDelete}`;
    if (transferTo) url += `?transfer_to=${transferTo}`;

    try {
        const result = await apiRequest(url, "DELETE");
        alert(result.message);
        document.getElementById('delete-teacher-modal').style.display = 'none';
        loadTeachersList();
    } catch (error) {
        alert("Failed to delete: " + error.message);
    }
}

// Generic Delete Handler for Lists
async function deleteEntity(type, id) {
    if (!confirm(`Are you sure you want to delete this ${type.slice(0, -1)}?`)) return;

    try {
        const result = await apiRequest(`/admin/${type}/${id}`, "DELETE");
        alert(result.message);
        
        // Refresh specific list
        if (type === 'teachers') loadTeachersList();
        if (type === 'students') loadStudentsList();
        if (type === 'subjects') {
            loadSubjectsList();
            loadSubjects(); // Refresh dropdown
        }
        if (type === 'sections') {
            loadSectionsList();
            loadSections(); // Refresh dropdown
        }
        if (type === 'exams') {
            loadExamsList();
            loadExams(); // Refresh dropdown
        }
        if (type === 'assignments') {
            loadAssignmentsList();
        }
    } catch (error) {
        alert("Failed to delete: " + error.message);
    }
}

// Generic Edit Handler
async function editEntity(type, id) {
    try {
        const data = await apiRequest(`/admin/${type}s/${id}`);
        
        if (type === 'teacher') {
            document.querySelector('input[name="teacher_id"]').value = data.teacher_id;
            document.getElementById('teacher-name').value = data.name;
            document.getElementById('teacher-email').value = data.email;
            document.getElementById('teacher-password').required = false; // Password optional on edit
            
            toggleEditMode('teacher', true);
        } else if (type === 'student') {
            document.querySelector('input[name="student_id"]').value = data.student_id;
            document.getElementById('student-name').value = data.name;
            document.getElementById('student-email').value = data.email;
            document.getElementById('student-usn').value = data.usn;
            document.getElementById('student-semester').value = data.semester;
            document.getElementById('student-section-label').value = data.section_label;
            document.getElementById('student-section-id').value = data.section_id;
            document.getElementById('student-password').required = false;

            toggleEditMode('student', true);
        } else if (type === 'subject') {
            document.querySelector('input[name="subject_id"]').value = data.subject_id;
            document.getElementById('subject-name').value = data.subject_name;
            
            toggleEditMode('subject', true);
        } else if (type === 'section') {
            document.querySelector('input[name="section_id_hidden"]').value = data.section_id;
            document.getElementById('section-name').value = data.section_name;
            document.getElementById('section-batch-year').value = data.batch_year;
            document.getElementById('section-semester').value = data.semester;
            
            toggleEditMode('section', true);
        } else if (type === 'exam') {
            document.querySelector('input[name="exam_id_hidden"]').value = data.exam_id;
            document.getElementById('exam-name').value = data.exam_name;
            document.getElementById('exam-subject').value = data.subject_id;
            
            // Format date for datetime-local input (YYYY-MM-DDTHH:MM)
            let formattedDate = data.date.replace(" ", "T");
            if (formattedDate.length > 16) formattedDate = formattedDate.substring(0, 16);
            document.getElementById('exam-date').value = formattedDate;

            document.getElementById('exam-duration').value = data.duration;
            document.getElementById('exam-total-marks').value = data.total_marks;
            document.getElementById('exam-scope').value = data.exam_scope;
            
            // Trigger change event for scope
            const event = new Event('change');
            document.getElementById('exam-scope').dispatchEvent(event);
            
            // Populate scope-specific fields
            if (data.exam_scope === 'BATCH') {
                if (data.batch_year) document.getElementById('exam-batch-year').value = data.batch_year;
                if (data.semester) document.getElementById('exam-semester').value = data.semester;
            } else if (data.exam_scope === 'SECTION') {
                // Try to populate section if available in response
                if (data.section_id) {
                    document.getElementById('exam-section-select').value = data.section_id;
                } else if (data.section_ids && data.section_ids.length > 0) {
                    document.getElementById('exam-section-select').value = data.section_ids[0];
                }
            }

            document.getElementById('exam-mode').value = data.mode || 'ONLINE';
            toggleExamMode();
            if (data.mode === 'CENTER') {
                const lab = labHierarchy.find(l => l.lab_id == data.lab_id);
                if (lab) {
                    document.getElementById('exam-block').value = lab.block_id;
                    handleBlockChange();
                    document.getElementById('exam-floor').value = lab.floor_id;
                    handleFloorChange();
                    document.getElementById('exam-lab').value = lab.lab_id;
                }
                document.getElementById('exam-password').value = data.password_hash || '';
            }

            toggleEditMode('exam', true);
        } else if (type === 'assignment') {
            document.querySelector('input[name="assignment_id"]').value = data.assignment_id;
            document.getElementById('assign-teacher').value = data.teacher_id;
            document.getElementById('assign-subject').value = data.subject_id;
            
            const sectionSelect = document.getElementById('assign-section');
            if (sectionSelect) {
                if (sectionSelect.multiple) {
                    Array.from(sectionSelect.options).forEach(opt => {
                        opt.selected = (parseInt(opt.value) === data.section_id);
                    });
                } else {
                    sectionSelect.value = data.section_id;
                }
            }
            
            toggleEditMode('assignment', true);
        }
        
        // Scroll to form
        document.getElementById(`${type}-section`).scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        alert("Failed to load details: " + error.message);
    }
}

function toggleEditMode(type, isEdit) {
    const form = document.querySelector(`#${type}-section form`);
    const submitBtn = form.querySelector('button[type="submit"]');
    const cancelBtn = form.querySelector('.btn-secondary');
    
    submitBtn.textContent = isEdit ? `Update ${type.charAt(0).toUpperCase() + type.slice(1)}` : `Create ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    cancelBtn.style.display = isEdit ? 'inline-block' : 'none';
}

function resetForm(type) {
    const form = document.querySelector(`#${type}-section form`);
    form.reset();
    // Clear hidden IDs
    form.querySelectorAll('input[type="hidden"]').forEach(input => input.value = "");
    if (type === 'teacher' || type === 'student') document.getElementById(`${type}-password`).required = true;
    // Set dynamic min date for exam scheduling
    if (type === 'exam') {
        const dateInput = document.getElementById('exam-date');
        if (dateInput) {
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            dateInput.min = now.toISOString().slice(0, 16);
        }
    }
    toggleEditMode(type, false);
}

// --- Result Management ---

let currentResultsData = [];
let resultsChart = null;

async function loadResults() {
    const tbody = document.getElementById('all-results-body');
    if (!tbody) return;

    const semester = document.getElementById('filter-semester').value;
    const sectionId = document.getElementById('filter-section').value;
    const subjectId = document.getElementById('filter-subject').value;
    const teacherId = document.getElementById('filter-teacher').value;
    const search = document.getElementById('filter-search').value;

    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading...</td></tr>';

    try {
        const queryParams = new URLSearchParams();
        if (semester) queryParams.append('semester', semester);
        if (sectionId) queryParams.append('section_id', sectionId);
        if (subjectId) queryParams.append('subject_id', subjectId);
        if (teacherId) queryParams.append('teacher_id', teacherId);
        if (search) queryParams.append('search', search);

        const results = await apiRequest(`/admin/results/filter?${queryParams.toString()}`);
        currentResultsData = results;

        if (results.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No results found matching criteria.</td></tr>';
            if (resultsChart) { resultsChart.destroy(); resultsChart = null; }
            return;
        }

        let passCount = 0;
        let failCount = 0;

        tbody.innerHTML = results.map(r => {
            const percentage = ((r.obtained_marks / r.max_marks) * 100).toFixed(1);
            if (percentage >= 40) passCount++;
            else failCount++;

            return `<tr>
                <td>${r.usn}</td>
                <td>${r.student_name}</td>
                <td>${r.semester} / ${r.section_name || '-'}</td>
                <td>${r.exam_name}</td>
                <td>${r.subject_name}</td>
                <td>${r.obtained_marks} / ${r.max_marks}</td>
                <td>${percentage}%</td>
                <td><span style="color:${r.result_status === 'Finalized' ? 'green' : 'orange'}">${r.result_status}</span></td>
            </tr>`;
        }).join('');

        renderResultsChart(passCount, failCount);

    } catch (error) {
        console.error("Failed to load results", error);
        tbody.innerHTML = `<tr><td colspan="8" style="color:red; text-align:center;">Error: ${error.message}</td></tr>`;
    }
}

function renderResultsChart(pass, fail) {
    const ctx = document.getElementById('resultsChart');
    if (!ctx) return;

    if (resultsChart) {
        resultsChart.destroy();
    }

    resultsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Pass (>40%)', 'Fail (<40%)'],
            datasets: [{
                data: [pass, fail],
                backgroundColor: ['#28a745', '#dc3545'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom' },
                title: { display: true, text: 'Pass/Fail Distribution' }
            }
        }
    });
}

async function exportResultsPDF() {
    if (!currentResultsData || currentResultsData.length === 0) {
        alert("No data to export");
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.text("Exam Results Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);

    const tableColumn = ["USN", "Name", "Sem/Sec", "Exam", "Subject", "Score", "Status"];
    const tableRows = currentResultsData.map(r => [
        r.usn,
        r.student_name,
        `${r.semester} / ${r.section_name || '-'}`,
        r.exam_name,
        r.subject_name,
        `${r.obtained_marks} / ${r.max_marks}`,
        r.result_status
    ]);

    doc.autoTable({ head: [tableColumn], body: tableRows, startY: 30 });
    doc.save("exam_results.pdf");
}

function exportResults() {
    if (!currentResultsData || currentResultsData.length === 0) {
        alert("No data to export");
        return;
    }
    const headers = ["USN", "Student Name", "Semester", "Section", "Exam", "Subject", "Teacher", "Obtained Marks", "Max Marks", "Status"];
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(",")].concat(currentResultsData.map(r => 
        `"${r.usn}","${r.student_name}",${r.semester},"${r.section_name || ''}","${r.exam_name}","${r.subject_name}","${r.teacher_name || 'Admin'}","${r.obtained_marks}","${r.max_marks}","${r.result_status}"`
    )).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "exam_results.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- Violation Analytics ---
async function loadViolationAnalytics() {
    const container = document.getElementById('violation-summary-cards');
    container.innerHTML = '<div class="spinner"></div>';
    loadViolationHistory();
    const status = document.getElementById('violation-filter-status').value;
    const examSearch = document.getElementById('violation-filter-exam').value;
    const type = document.getElementById('violation-filter-type').value;
    
    try {
        let url = '/admin/violations/stats';
        const params = new URLSearchParams();
        if (status) params.append('status', status);
        if (examSearch) params.append('exam_search', examSearch);
        if (type) params.append('violation_type', type);
        if ([...params].length > 0) url += `?${params.toString()}`;

        const stats = await apiRequest(url);
        
        // 1. Summary Cards
        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-value" style="color: #DC2626;">${stats.today}</div>
                <div class="stat-label">Violations Today</div>
                <div class="stat-icon">⚠️</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: #D97706;">${stats.week}</div>
                <div class="stat-label">This Week</div>
                <div class="stat-icon">📅</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: #4F46E5;">${stats.students_flagged}</div>
                <div class="stat-label">Students Flagged</div>
                <div class="stat-icon">🎓</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: #4B5563;">${stats.exams_affected}</div>
                <div class="stat-label">Exams Affected</div>
                <div class="stat-icon">📝</div>
            </div>
        `;

        // 2. Charts
        renderViolationTrendChart(stats.trend);
        renderViolationTypeChart(stats.by_type);
        renderViolationByExamChart(stats.by_exam);

        // 3. Alerts
        const alertsContainer = document.getElementById('violation-alerts-container');
        const dismissed = JSON.parse(localStorage.getItem('dismissed_alerts') || '[]');
        const activeAlerts = stats.alerts.filter(a => !dismissed.includes(a.message));

        if (activeAlerts.length === 0) {
            alertsContainer.innerHTML = '<div class="alert-box success">✅ No active alerts.</div>';
        } else {
            alertsContainer.innerHTML = activeAlerts.map(a => `
                <div class="activity-item violation" style="justify-content: space-between; align-items: flex-start;">
                    <div style="display:flex; gap:12px;">
                        <div class="act-icon"><i class="fas fa-exclamation-triangle"></i></div>
                        <div class="act-content"><strong>Alert</strong><br>${a.message}</div>
                    </div>
                    <button onclick="dismissAlert('${a.message.replace(/'/g, "\\'")}')" style="background:none; border:none; color:#999; cursor:pointer; font-size:1.2rem; line-height:1;">&times;</button>
                </div>
            `).join('');
        }

        // Rename table heading dynamically back to Recent
        document.querySelectorAll('h2, h3').forEach(h => {
            if (h.textContent.includes('Pending Violations')) h.textContent = 'Recent Violations';
        });

        // 4. Recent Violations Table
        const recentBody = document.getElementById('recent-violations-full-body');
        if (stats.recent.length === 0) {
            recentBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#666;">No recent violations.</td></tr>';
        } else {
            const groupedRecent = {};
            stats.recent.forEach(v => {
                const key = `recent_${v.usn}_${v.exam_name}`.replace(/\W/g, '_');
                if (!groupedRecent[key]) {
                    groupedRecent[key] = { name: v.name || v.student_name, usn: v.usn, exam_name: v.exam_name, violations: [] };
                }
                groupedRecent[key].violations.push(v);
            });

            recentBody.innerHTML = Object.keys(groupedRecent).map(key => {
                const g = groupedRecent[key];
                return `
                    <tr style="cursor: pointer; background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;" onclick="toggleViolationDetails('recent-details-${key}', 'recent-icon-${key}')">
                        <td>
                            <i class="fas fa-chevron-down" id="recent-icon-${key}" style="margin-right: 8px; transition: transform 0.2s;"></i>
                            <strong>${g.name}</strong> <span style="font-size:0.8em; color:#666;">(${g.usn})</span>
                        </td>
                        <td>${g.exam_name}</td>
                        <td colspan="4">
                            <span style="background:#FEE2E2; color:#DC2626; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">
                                ${g.violations.length} Violation(s)
                            </span>
                        </td>
                    </tr>
                    <tr id="recent-details-${key}" style="display: none;">
                        <td colspan="6" style="padding: 0; background-color: #f1f5f9;">
                            <table style="width: 100%; margin: 0; background: transparent; border-collapse: collapse;">
                                <tbody>
                                    ${g.violations.map(v => `
                                        <tr style="border-bottom: 1px solid #e2e8f0;">
                                            <td style="width: 30%; padding-left: 40px;"><span style="color:#DC2626; font-weight:500;">${v.violation_type}</span></td>
                                            <td style="width: 20%;"><span class="status-badge" style="background-color: ${v.review_status === 'Resolved' ? '#DCFCE7' : v.review_status === 'Dismissed' ? '#F1F5F9' : '#FEF2F2'}; color: ${v.review_status === 'Resolved' ? '#16A34A' : v.review_status === 'Dismissed' ? '#64748B' : '#DC2626'}; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem;">${v.review_status}</span></td>
                                            <td style="width: 25%;">${new Date(v.timestamp).toLocaleTimeString()}</td>
                                            <td style="width: 25%; text-align: right; padding-right: 20px;"><button class="btn-edit" onclick="viewEvidence(${v.violation_id})" style="background-color: #3182ce; color: white; padding: 4px 8px; border-radius: 6px; font-weight: 500; border: none;">Review Evidence</button></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        // 5. High Risk Students
        const riskBody = document.getElementById('high-risk-students-body');
        riskBody.innerHTML = stats.high_risk.map(s => `
            <tr>
                <td><strong>${s.name}</strong> <br><span style="font-size:0.8em; color:#666;">${s.usn}</span></td>
                <td><span class="status-badge" style="background:#FEE2E2; color:#DC2626; padding: 4px 8px; border-radius: 4px;">${s.violation_count} Violations</span></td>
            </tr>
        `).join('');

    } catch (error) {
        console.error("Failed to load violation stats", error);
        container.innerHTML = '<p style="color:red">Error loading data.</p>';
    }
}

async function loadViolationHistory(page = 1) {
    const tbody = document.getElementById('violation-history-body');
    const pagination = document.getElementById('history-pagination');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading...</td></tr>';
    const status = document.getElementById('history-filter-status').value;
    const examSearch = document.getElementById('violation-filter-exam').value;
    const search = document.getElementById('history-filter-search').value;
    const startDate = document.getElementById('history-filter-start-date').value;
    const endDate = document.getElementById('history-filter-end-date').value;
    const type = document.getElementById('history-filter-type').value;

    try {
        const queryParams = new URLSearchParams({ page, limit: 10 });
        if (status) queryParams.append('status', status);
        if (examSearch) queryParams.append('exam_search', examSearch);
        if (search) queryParams.append('search', search);
        if (startDate) queryParams.append('start_date', startDate);
        if (endDate) queryParams.append('end_date', endDate);
        if (type) queryParams.append('violation_type', type);

        const data = await apiRequest(`/admin/violations/history?${queryParams.toString()}`);
        const totalPages = data.total_pages || 1;
        
        if (data.history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No history found.</td></tr>';
            pagination.innerHTML = '';
            return;
        }

        const grouped = {};
        data.history.forEach(v => {
            const key = `history_${v.usn}_${v.exam_name}`.replace(/\W/g, '_');
            if (!grouped[key]) {
                grouped[key] = { student_name: v.student_name || v.name, usn: v.usn, exam_name: v.exam_name, violations: [] };
            }
            grouped[key].violations.push(v);
        });

        tbody.innerHTML = Object.keys(grouped).map(key => {
            const g = grouped[key];
            return `
                <tr style="cursor: pointer; background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;" onclick="toggleViolationDetails('details-${key}', 'icon-${key}')">
                    <td>
                        <i class="fas fa-chevron-down" id="icon-${key}" style="margin-right: 8px; transition: transform 0.2s;"></i>
                        <strong>${g.student_name}</strong> <span style="font-size:0.8em; color:#666;">(${g.usn})</span>
                    </td>
                    <td>${g.exam_name}</td>
                    <td colspan="5">
                        <span style="background:#FEE2E2; color:#DC2626; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">
                            ${g.violations.length} Violation(s)
                        </span>
                    </td>
                </tr>
                <tr id="details-${key}" style="display: none;">
                    <td colspan="7" style="padding: 0; background-color: #f1f5f9;">
                        <table style="width: 100%; margin: 0; background: transparent; border-collapse: collapse;">
                            <tbody>
                                ${g.violations.map(v => `
                                    <tr style="border-bottom: 1px solid #e2e8f0;">
                                        <td style="width: 25%; padding-left: 40px;"><span style="color:#DC2626; font-weight:500;">${v.violation_type}</span></td>
                                        <td style="width: 15%;"><span class="status-badge ${v.review_status === 'Resolved' ? 'active' : 'inactive'}">${v.review_status}</span></td>
                                        <td style="width: 20%;">${new Date(v.timestamp).toLocaleString()}</td>
                                        <td style="width: 20%;"><small>${v.remarks || '-'}</small></td>
                                        <td style="width: 20%; text-align: right; padding-right: 20px;"><button class="btn-edit" onclick="viewEvidence(${v.violation_id})" style="background-color: #3182ce; color: white; padding: 4px 8px; border-radius: 6px; font-weight: 500; border: none;">Review Evidence</button></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </td>
                </tr>
            `;
        }).join('');

        if (pagination) {
            let paginationHtml = '';
            if (totalPages > 1) {
                paginationHtml += `<button type="button" onclick="loadViolationHistory(${page - 1})" ${page === 1 ? 'disabled' : ''}>&laquo;</button>`;
                for (let i = 1; i <= totalPages; i++) {
                    paginationHtml += `<button type="button" onclick="loadViolationHistory(${i})" class="${i === page ? 'active' : ''}">${i}</button>`;
                }
                paginationHtml += `<button type="button" onclick="loadViolationHistory(${page + 1})" ${page === totalPages ? 'disabled' : ''}>&raquo;</button>`;
            }
            pagination.innerHTML = paginationHtml;
        }
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="7" style="color:red; text-align:center;">Error: ${error.message}</td></tr>`;
    }
}

function dismissAlert(message) {
    const dismissed = JSON.parse(localStorage.getItem('dismissed_alerts') || '[]');
    if (!dismissed.includes(message)) {
        dismissed.push(message);
        localStorage.setItem('dismissed_alerts', JSON.stringify(dismissed));
    }
    loadViolationAnalytics(); // Refresh to hide
}

let vTrendChart = null;
function renderViolationTrendChart(data) {
    const ctx = document.getElementById('violationTrendChart');
    if (!ctx) return;
    if (vTrendChart) vTrendChart.destroy();

    vTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => new Date(d.date).toLocaleDateString(undefined, {weekday:'short'})),
            datasets: [{
                label: 'Violations',
                data: data.map(d => d.count),
                borderColor: '#DC2626',
                backgroundColor: 'rgba(220, 38, 38, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
}

let vTypeChart = null;
function renderViolationTypeChart(data) {
    const ctx = document.getElementById('violationTypeChart');
    if (!ctx) return;
    if (vTypeChart) vTypeChart.destroy();

    vTypeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.violation_type),
            datasets: [{
                data: data.map(d => d.count),
                backgroundColor: ['#EF4444', '#F59E0B', '#3B82F6', '#10B981', '#6366F1']
            }]
        },
        options: { responsive: true, plugins: { legend: { position: 'right' } } }
    });
}

let vExamChart = null;
function renderViolationByExamChart(data) {
    const ctx = document.getElementById('violationByExamChart');
    if (!ctx) return;
    if (vExamChart) vExamChart.destroy();

    vExamChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.exam_name),
            datasets: [{
                label: 'Violations',
                data: data.map(d => d.count),
                backgroundColor: '#8B5CF6'
            }]
        },
        options: {
            responsive: true,
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });
}

let currentViolationId = null;

async function viewEvidence(id) {
    currentViolationId = id;
    const modal = document.getElementById('evidence-modal');
    const content = document.getElementById('evidence-content');

    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    document.body.style.overflow = 'hidden';

    const modalContent = content.closest('.modal-content');
    if (modalContent) {
        modalContent.style.maxWidth = '800px';
        modalContent.style.width = '90%';
        modalContent.style.maxHeight = '90vh';
        modalContent.style.overflowY = 'auto';
        content.style.padding = '24px';
        
        // Hide hardcoded HTML footer to prevent duplicate resolve options
        const oldFooter = modalContent.querySelector('.modal-footer');
        if (oldFooter) oldFooter.style.display = 'none';
    }

    content.innerHTML = '<div class="spinner"></div>';

    try {
        const v = await apiRequest(`/admin/violations/${id}`);

        const getStatusBadge = (status) => {
            let color, bgColor;
            switch (status) {
                case 'Resolved':
                    color = '#16A34A'; bgColor = '#DCFCE7'; break;
                case 'Dismissed':
                    color = '#64748B'; bgColor = '#F1F5F9'; break;
                case 'Pending':
                case 'Under Review':
                default:
                    color = '#B45309'; bgColor = '#FEF3C7'; break;
            }
            return `<span style="color: ${color}; background-color: ${bgColor}; padding: 4px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${status}</span>`;
        };

        let contentHtml = `
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px 24px; margin-bottom: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 24px;">
                <div><label style="font-size: 0.8rem; color: #6b7280; display: block; margin-bottom: 4px;">Student</label><div style="font-weight: 600; color: #111827;">${v.student_name} (${v.usn})</div></div>
                <div><label style="font-size: 0.8rem; color: #6b7280; display: block; margin-bottom: 4px;">Exam</label><div style="font-weight: 600; color: #111827;">${v.exam_name} <span style="font-size: 0.7rem; background: ${v.mode === 'CENTER' ? '#E0E7FF' : '#F3F4F6'}; color: ${v.mode === 'CENTER' ? '#3730A3' : '#4B5563'}; padding: 2px 6px; border-radius: 4px; margin-left: 4px; vertical-align: middle;">${v.mode || 'ONLINE'}</span></div></div>
                <div><label style="font-size: 0.8rem; color: #6b7280; display: block; margin-bottom: 4px;">Violation Type</label><div><span style="color: #991B1B; background-color: #FEE2E2; padding: 4px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${v.violation_type}</span></div></div>
                <div><label style="font-size: 0.8rem; color: #6b7280; display: block; margin-bottom: 4px;">Status</label><div>${getStatusBadge(v.review_status)}</div></div>
                <div><label style="font-size: 0.8rem; color: #6b7280; display: block; margin-bottom: 4px;">Time</label><div style="font-size: 0.9rem; color: #374151;">${new Date(v.timestamp).toLocaleString()}</div></div>
                <div><label style="font-size: 0.8rem; color: #6b7280; display: block; margin-bottom: 4px;">Confidence</label><div style="font-size: 0.9rem; color: #374151;">${v.confidence_score || 'N/A'}</div></div>
            </div>

            ${v.question_text ? `<div style="margin-bottom: 24px;"><h4 style="font-size: 1rem; font-weight: 600; color: #1f2937; margin-top: 0; margin-bottom: 8px;">Related Question</h4><p style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 12px; border-radius: 6px; margin: 0; font-size: 0.9rem; color: #374151;">${v.question_text}</p></div>` : ''}

            <div style="margin-bottom: 24px;">
                <h4 style="font-size: 1rem; font-weight: 600; color: #1f2937; margin-top: 0; margin-bottom: 12px;">Evidence</h4>
                ${v.evidence && v.evidence.length > 0 ? 
                    v.evidence.map(e => `
                        <div style="border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 16px; overflow: hidden;">
                            <div style="background-color: #f9fafb; padding: 8px 12px; font-size: 0.8rem; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Captured: ${new Date(e.captured_time).toLocaleTimeString()}</div>
                            <div style="display: flex; gap: 16px; padding: 16px; flex-wrap: wrap; justify-content: space-around;">
                                ${e.camera_image_path ? `
                                    <div style="flex: 1; min-width: 300px; text-align: center;">
                                        <h5 style="margin-top:0; margin-bottom:8px; font-size:0.9rem; color:#4b5563;">Webcam View</h5>
                                        <img src="${e.camera_image_path}" onclick="openFullScreenImage(this.src)" style="max-width: 100%; height: auto; border-radius: 6px; border: 1px solid #d1d5db; cursor: pointer;" alt="Webcam Evidence">
                                    </div>
                                ` : ''}
                                ${e.screenshot_path ? `
                                    <div style="flex: 1; min-width: 300px; text-align: center;">
                                        <h5 style="margin-top:0; margin-bottom:8px; font-size:0.9rem; color:#4b5563;">Screen Share View</h5>
                                        <img src="${e.screenshot_path}" onclick="openFullScreenImage(this.src)" style="max-width: 100%; height: auto; border-radius: 6px; border: 1px solid #d1d5db; cursor: pointer;" alt="Evidence Screenshot">
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `).join('') 
                    : `<div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px;"><i class="fas fa-image" style="font-size: 1.75rem; color: #9ca3af;"></i><span style="font-size: 0.9rem; color: #4b5563;">No visual evidence was captured for this violation.</span></div>`
                }
            </div>

            ${v.remarks ? `<div style="margin-bottom: 24px;"><h4 style="font-size: 1rem; font-weight: 600; color: #1f2937; margin-top: 0; margin-bottom: 8px;">Previous Remarks</h4><p style="background-color: #FEFCE8; border: 1px solid #FDE68A; padding: 12px; border-radius: 6px; margin: 0; font-size: 0.9rem; color: #713F12;">${v.remarks}</p></div>` : ''}
        `;

        const actionLabel = (v.review_status === 'Pending' || v.review_status === 'Under Review') ? 'Add Remarks & Resolve' : 'Override Decision (Admin Only)';
        contentHtml += `
            <div style="border-top: 1px solid #e5e7eb; padding: 16px 24px; background-color: #f9fafb; margin: 24px -24px -24px -24px; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                <label for="dynamic-violation-remarks" style="font-size: 0.9rem; font-weight: 600; color: #374151; display: block; margin-bottom: 8px;">${actionLabel}</label>
                <textarea id="dynamic-violation-remarks" placeholder="Add optional remarks to justify your decision..." style="width: 100%; min-height: 60px; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.9rem; margin-bottom: 12px; box-sizing: border-box; resize: vertical;"></textarea>
                <div style="display: flex; justify-content: flex-end; gap: 12px;">
                    <button onclick="resolveViolation('Dismissed')" style="background-color: #6b7280; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.9rem;">${v.review_status === 'Dismissed' ? 'Already Dismissed' : 'Override to Dismiss'}</button>
                    <button onclick="resolveViolation('Resolved')" style="background-color: #16A34A; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.9rem;">${v.review_status === 'Resolved' ? 'Already Resolved' : 'Override to Resolved'}</button>
                </div>
            </div>
        `;

        content.innerHTML = contentHtml;
    } catch (error) {
        content.innerHTML = `<p style="color:red">Error loading evidence: ${error.message}</p>`;
    }
}

function closeEvidenceModal() {
    document.getElementById('evidence-modal').style.display = 'none';
    document.body.style.overflow = '';
    currentViolationId = null;
}

async function resolveViolation(status) {
    if (!currentViolationId) return;
    const remarksEl = document.getElementById('dynamic-violation-remarks');
    const remarks = remarksEl ? remarksEl.value : '';
    
    try {
        await apiRequest(`/admin/violations/${currentViolationId}/resolve`, 'PUT', { status, remarks });
        alert(`Violation marked as ${status}`);
        closeEvidenceModal();
        loadViolationAnalytics(); // Refresh list
    } catch (error) {
        alert("Error: " + error.message);
    }
}

function openFullScreenImage(src) {
    let overlay = document.getElementById('fullscreen-image-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'fullscreen-image-overlay';
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.9); z-index: 100000; display: flex; align-items: center; justify-content: center; cursor: zoom-out;';
        
        const img = document.createElement('img');
        img.id = 'fullscreen-image';
        img.style.cssText = 'max-width: 90%; max-height: 90%; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);';
        
        overlay.appendChild(img);
        document.body.appendChild(overlay);
        
        overlay.onclick = function() { this.style.display = 'none'; };
    }
    document.getElementById('fullscreen-image').src = src;
    overlay.style.display = 'flex';
}

// --- System Logs ---
async function loadSystemLogs(page = 1) {
    const tbody = document.getElementById('system-logs-body');
    const paginationContainer = document.getElementById('logs-pagination-controls');
    if (!tbody) return;

    const startDate = document.getElementById('log-start-date').value;
    const endDate = document.getElementById('log-end-date').value;
    const actionType = document.getElementById('log-action-type').value;
    const search = document.getElementById('log-search').value;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';

    try {
        const queryParams = new URLSearchParams({ page, limit: 20 });
        if (startDate) queryParams.append('start_date', startDate);
        if (endDate) queryParams.append('end_date', endDate);
        if (actionType) queryParams.append('action_type', actionType);
        if (search) queryParams.append('search', search);

        const response = await apiRequest(`/admin/dashboard/logs?${queryParams.toString()}`);
        const { logs, total_pages } = response;
        currentLogsData = logs;

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No logs found for the selected criteria.</td></tr>';
            paginationContainer.innerHTML = '';
            return;
        }

        tbody.innerHTML = logs.map(log => `
            <tr>
                <td>${new Date(log.created_at).toLocaleString()}</td>
                <td>
                    <strong>${log.user_name}</strong><br>
                    <span class="role-badge" style="text-transform: capitalize; font-size: 0.75rem; padding: 2px 6px;">${log.role}</span>
                    ${log.department_name ? `<br><span style="font-size: 0.75rem; color: #666;">${log.department_name}</span>` : ''}
                </td>
                <td>${log.action}</td>
                    <td>${log.entity_type ? (log.exam_name ? `${log.entity_type} (${log.exam_name})` : `${log.entity_type} (ID: ${log.entity_id})`) : 'N/A'}</td>
                <td>${log.ip_address || 'N/A'}</td>
            </tr>
        `).join('');

        // Render Pagination
        let paginationHtml = '';
        if (total_pages > 1) {
            paginationHtml += `<button type="button" onclick="loadSystemLogs(${page - 1})" ${page === 1 ? 'disabled' : ''}>&laquo;</button>`;
            for (let i = 1; i <= total_pages; i++) {
                paginationHtml += `<button type="button" onclick="loadSystemLogs(${i})" class="${i === page ? 'active' : ''}">${i}</button>`;
            }
            paginationHtml += `<button type="button" onclick="loadSystemLogs(${page + 1})" ${page === total_pages ? 'disabled' : ''}>&raquo;</button>`;
        }
        paginationContainer.innerHTML = paginationHtml;

    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Error loading logs: ${error.message}</td></tr>`;
    }
}

function exportLogsCSV() {
    if (!currentLogsData || currentLogsData.length === 0) {
        alert("No logs to export");
        return;
    }
    const headers = ["Timestamp", "User", "Role", "Department", "Action", "Entity", "IP Address"];
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(",")].concat(currentLogsData.map(l => 
        `"${new Date(l.created_at).toLocaleString()}","${l.user_name}","${l.role}","${l.department_name || ''}","${l.action}","${l.entity_type || ''} ${l.exam_name ? `(${l.exam_name})` : (l.entity_id || '')}","${l.ip_address || ''}"`
    )).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "system_logs.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Global UI helper for grouped tables
window.toggleViolationDetails = function(detailsId, iconId) {
    const detailsRow = document.getElementById(detailsId);
    const icon = document.getElementById(iconId);
    if (detailsRow) {
        if (detailsRow.style.display === 'none') {
            detailsRow.style.display = 'table-row';
            if (icon) icon.style.transform = 'rotate(180deg)';
        } else {
            detailsRow.style.display = 'none';
            if (icon) icon.style.transform = 'rotate(0deg)';
        }
    }
};