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
        loadExamsForViolationFilter();
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
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

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
    const numericFields = ['department_id', 'subject_id', 'duration', 'exam_id', 'section_id', 'semester', 'total_marks', 'batch_year'];
    for (let key in data) {
        if (numericFields.includes(key)) {
            data[key] = parseInt(data[key]);
        }
    }

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

    if (!container) return;
    
    if (!examId) {
        container.innerHTML = '<p style="color: #666;">Select an exam to view questions.</p>';
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
    }

    container.innerHTML = '<p>Loading...</p>';

    try {
        const response = await apiRequest(`/admin/exams/${examId}/questions?page=${page}&limit=5`);
        const questions = response.questions;
        const totalPages = response.total_pages;
        
        if (questions.length === 0) {
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
        const response = await fetch('http://127.0.0.1:8000/admin/students/import', {
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
                    <button onclick="editEntity('exam', ${e.exam_id})" class="btn-edit">Edit</button>
                    <button onclick="goToAddQuestions(${e.exam_id})" class="btn-edit" style="background-color: #28a745; color: white;" title="Add/View Questions">+Q</button>
                    <button onclick="deleteEntity('exams', ${e.exam_id})" class="btn-delete">Delete</button>
                `;
            } else {
                actionsHtml = `
                    <button onclick="editEntity('exam', ${e.exam_id})" class="btn-edit">Edit</button>
                    <button onclick="publishExam(${e.exam_id})" class="btn-edit" style="background-color: #17a2b8; color: white;">Publish</button>
                    <button onclick="goToAddQuestions(${e.exam_id})" class="btn-edit" style="background-color: #28a745; color: white;" title="Add/View Questions">+Q</button>
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
                    <button onclick="editEntity('exam', ${e.exam_id})" class="btn-edit">Edit</button>
                    <button onclick="goToAddQuestions(${e.exam_id})" class="btn-edit" style="background-color: #28a745; color: white;" title="Add/View Questions">+Q</button>
                    <button onclick="deleteEntity('exams', ${e.exam_id})" class="btn-delete">Delete</button>
                `;
            } else {
                actionsHtml = `
                    <button onclick="editEntity('exam', ${e.exam_id})" class="btn-edit">Edit</button>
                    <button onclick="publishExam(${e.exam_id})" class="btn-edit" style="background-color: #17a2b8; color: white;">Publish</button>
                    <button onclick="goToAddQuestions(${e.exam_id})" class="btn-edit" style="background-color: #28a745; color: white;" title="Add/View Questions">+Q</button>
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
    document.getElementById('re-exam-modal').style.display = 'block';
    document.getElementById('re-exam-id').value = examId;
    document.getElementById('re-exam-duration').value = duration;
    
    // Load students for this exam (from results or sections)
    const studentSelect = document.getElementById('re-exam-students');
    studentSelect.innerHTML = '<option>Loading...</option>';
    
    try {
        // We can use the results endpoint to get students who took it, 
        // OR better, get all students assigned to the exam sections.
        // For now, let's use results to find absent/failed students easily, 
        // but to be comprehensive, we should fetch all eligible students.
        // Let's use a new helper or reuse existing. 
        // Since we don't have a direct "get students for exam" endpoint in admin_exam.py yet,
        // we will use the results endpoint which lists students.
        const results = await apiRequest(`/admin/exams/${examId}/results`);
        studentSelect.innerHTML = '';
        if(results.length === 0) {
             studentSelect.innerHTML = '<option disabled>No students found in results yet.</option>';
        } else {
            results.forEach(r => {
                studentSelect.appendChild(new Option(`${r.name} (${r.usn}) - ${r.result_status || 'Absent'}`, r.student_id));
            });
        }
    } catch (e) {
        studentSelect.innerHTML = '<option disabled>Error loading students</option>';
    }
}

function closeReExamModal() {
    document.getElementById('re-exam-modal').style.display = 'none';
}

function toggleReExamType() {
    const type = document.getElementById('re-exam-type').value;
    document.getElementById('re-exam-students-container').style.display = type === 'students' ? 'block' : 'none';
}

async function submitReExam() {
    const examId = document.getElementById('re-exam-id').value;
    const type = document.getElementById('re-exam-type').value;
    const date = document.getElementById('re-exam-date').value;
    const duration = document.getElementById('re-exam-duration').value;
    
    const payload = { exam_date: date, duration: parseInt(duration) };
    let url = `/admin/exams/${examId}/re-exam/class`;

    if (type === 'students') {
        const students = Array.from(document.getElementById('re-exam-students').selectedOptions).map(o => parseInt(o.value));
        if (students.length === 0) return alert("Please select at least one student.");
        payload.student_ids = students;
        url = `/admin/exams/${examId}/re-exam/students`;
    }

    try {
        const res = await apiRequest(url, 'POST', payload);
        alert(res.message);
        closeReExamModal();
        loadAdminExams();
    } catch (e) { alert("Error: " + e.message); }
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

            toggleEditMode('exam', true);
        } else if (type === 'assignment') {
            document.querySelector('input[name="assignment_id"]').value = data.assignment_id;
            document.getElementById('assign-teacher').value = data.teacher_id;
            document.getElementById('assign-subject').value = data.subject_id;
            document.getElementById('assign-section').value = data.section_id;
            
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
    const examId = document.getElementById('violation-filter-exam').value;
    const type = document.getElementById('violation-filter-type').value;
    
    try {
        let url = '/admin/violations/stats';
        const params = new URLSearchParams();
        if (status) params.append('status', status);
        if (examId) params.append('exam_id', examId);
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

        // 4. Recent Violations Table
        const recentBody = document.getElementById('recent-violations-full-body');
        recentBody.innerHTML = stats.recent.map(v => `
            <tr>
                <td><strong>${v.name}</strong> <span style="font-size:0.8em; color:#666;">(${v.usn})</span></td>
                <td>${v.exam_name}</td>
                <td><span style="color:#DC2626; font-weight:500;">${v.violation_type}</span></td>
                <td><span class="status-badge" style="
                    background-color: ${v.review_status === 'Resolved' ? '#DCFCE7' : v.review_status === 'Dismissed' ? '#F1F5F9' : '#FEF2F2'};
                    color: ${v.review_status === 'Resolved' ? '#16A34A' : v.review_status === 'Dismissed' ? '#64748B' : '#DC2626'};
                    padding: 4px 8px; border-radius: 12px; font-size: 0.75rem;
                ">
                    ${v.review_status}
                </span></td>
                <td>${new Date(v.timestamp).toLocaleTimeString()}</td>
                <td><button class="btn-edit" onclick="viewEvidence(${v.violation_id})" style="background-color: #3182ce; color: white; padding: 6px 12px; border-radius: 6px; font-weight: 500; border: none;">Review</button></td>
            </tr>
        `).join('');

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
    const examId = document.getElementById('violation-filter-exam').value;
    const search = document.getElementById('history-filter-search').value;
    const startDate = document.getElementById('history-filter-start-date').value;
    const endDate = document.getElementById('history-filter-end-date').value;
    const type = document.getElementById('history-filter-type').value;

    try {
        const queryParams = new URLSearchParams({ page, limit: 10 });
        if (status) queryParams.append('status', status);
        if (examId) queryParams.append('exam_id', examId);
        if (search) queryParams.append('search', search);
        if (startDate) queryParams.append('start_date', startDate);
        if (endDate) queryParams.append('end_date', endDate);
        if (type) queryParams.append('violation_type', type);

        const data = await apiRequest(`/admin/violations/history?${queryParams.toString()}`);
        
        if (data.history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No history found.</td></tr>';
            pagination.innerHTML = '';
            return;
        }

        tbody.innerHTML = data.history.map(v => `
            <tr>
                <td><strong>${v.student_name}</strong> <span style="font-size:0.8em; color:#666;">(${v.usn})</span></td>
                <td>${v.exam_name}</td>
                <td><span style="color:#DC2626;">${v.violation_type}</span></td>
                <td><span class="status-badge ${v.review_status === 'Resolved' ? 'active' : 'inactive'}">${v.review_status}</span></td>
                <td>${new Date(v.timestamp).toLocaleString()}</td>
                <td><small>${v.remarks || '-'}</small></td>
                <td><button class="btn-edit" onclick="viewEvidence(${v.violation_id})" style="background-color: #3182ce; color: white; padding: 6px 12px; border-radius: 6px; font-weight: 500; border: none;">View</button></td>
            </tr>
        `).join('');

        pagination.innerHTML = `<button onclick="loadViolationHistory(${page-1})" ${page===1?'disabled':''}>&laquo;</button> <span style="padding:5px;">Page ${page}</span> <button onclick="loadViolationHistory(${page+1})" ${page===data.total_pages?'disabled':''}>&raquo;</button>`;
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

async function loadExamsForViolationFilter() {
    const select = document.getElementById('violation-filter-exam');
    if (!select || select.options.length > 1) return;
    try {
        const exams = await apiRequest('/admin/exams');
        exams.forEach(e => {
            select.appendChild(new Option(e.exam_name, e.exam_id));
        });
    } catch (error) {
        console.error("Failed to load exams for filter", error);
    }
}

let currentViolationId = null;

async function viewEvidence(id) {
    currentViolationId = id;
    const modal = document.getElementById('evidence-modal');
    const content = document.getElementById('evidence-content');
    const actions = document.getElementById('evidence-actions');
    
    modal.style.display = 'block';
    content.innerHTML = '<div class="spinner"></div>';

    try {
        const v = await apiRequest(`/admin/violations/${id}`);
        
        content.innerHTML = `
            <p><strong>Student:</strong> ${v.student_name} (${v.usn})</p>
            <p><strong>Exam:</strong> ${v.exam_name}</p>
            <p><strong>Violation Type:</strong> <span style="color:#DC2626; font-weight:bold;">${v.violation_type}</span></p>
            <p><strong>Time:</strong> ${new Date(v.timestamp).toLocaleString()}</p>
            <p><strong>Confidence Score:</strong> ${v.confidence_score}</p>
            <p><strong>Status:</strong> <span style="font-weight:bold; color:${v.review_status === 'Resolved' ? 'green' : v.review_status === 'Dismissed' ? 'gray' : 'red'}">${v.review_status}</span></p>
            
            ${v.remarks ? `
                <div style="margin-top:10px; padding:10px; background:#fff3cd; border-left: 4px solid #ffc107; border-radius:4px;">
                    <strong>Remarks:</strong><br>${v.remarks}
                </div>
            ` : ''}

            ${v.question_text ? `<div style="margin-top:10px; padding:10px; background:#f8f9fa; border-radius:4px;"><strong>Related Question:</strong><br>${v.question_text}</div>` : ''}
            
            <div style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px;">
                <h4 style="margin-top: 0; color: #2c3e50; font-size: 1rem;">Evidence</h4>
                ${v.evidence && v.evidence.length > 0 ? 
                    v.evidence.map(e => `
                        <div style="margin-bottom: 15px; background: #f8f9fa; padding: 10px; border-radius: 6px;">
                            <div style="font-size: 0.85rem; color: #666; margin-bottom: 8px;">Captured: ${new Date(e.captured_time).toLocaleTimeString()}</div>
                            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                                ${e.camera_image_path ? `
                                    <div style="flex: 1; min-width: 150px;">
                                        <div style="font-size: 0.8rem; font-weight: 600; margin-bottom: 4px;">Camera</div>
                                        <img src="${e.camera_image_path}" style="width: 100%; border-radius: 4px; border: 1px solid #ddd;" alt="Camera Evidence">
                                    </div>
                                ` : ''}
                                ${e.screenshot_path ? `
                                    <div style="flex: 1; min-width: 150px;">
                                        <div style="font-size: 0.8rem; font-weight: 600; margin-bottom: 4px;">Screenshot</div>
                                        <img src="${e.screenshot_path}" style="width: 100%; border-radius: 4px; border: 1px solid #ddd;" alt="Screenshot Evidence">
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `).join('') 
                    : '<p style="color: #666; font-style: italic;">No visual evidence available.</p>'
                }
            </div>
        `;

        // Hide actions if already processed
        if (v.review_status !== 'Pending' && v.review_status !== 'Under Review') {
            actions.style.display = 'none';
        } else {
            actions.style.display = 'flex';
        }
    } catch (error) {
        content.innerHTML = `<p style="color:red">Error loading evidence: ${error.message}</p>`;
    }
}

function closeEvidenceModal() {
    document.getElementById('evidence-modal').style.display = 'none';
    currentViolationId = null;
}

async function resolveViolation(status) {
    if (!currentViolationId) return;
    const remarks = document.getElementById('violation-remarks').value;
    
    try {
        await apiRequest(`/admin/violations/${currentViolationId}/resolve`, 'PUT', { status, remarks });
        alert(`Violation marked as ${status}`);
        closeEvidenceModal();
        loadViolationAnalytics(); // Refresh list
    } catch (error) {
        alert("Error: " + error.message);
    }
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
                <td>${log.entity_type ? `${log.entity_type} (ID: ${log.entity_id})` : 'N/A'}</td>
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
        `"${new Date(l.created_at).toLocaleString()}","${l.user_name}","${l.role}","${l.department_name || ''}","${l.action}","${l.entity_type} ${l.entity_id}","${l.ip_address || ''}"`
    )).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "system_logs.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}