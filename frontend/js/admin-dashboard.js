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

// UI Tab Switching Logic
function showSection(sectionName) {
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

    // Reset form to ensure clean state (clears hidden IDs from previous edits)
    if (['section', 'subject', 'teacher', 'student', 'exam'].includes(sectionName)) {
        resetForm(sectionName);
    } else if (sectionName === 'assignment') {
        resetForm('assignment');
    }

    if (sectionName === 'result') {
        loadResults();
    }
    if (sectionName === 'logs') {
        loadSystemLogs();
    }
}

// --- Dashboard Stats Loader ---
async function loadDashboardStats() {
    try {
        const stats = await apiRequest('/admin/dashboard/stats');
        const container = document.getElementById('admin-stats-container');
        
        if (container) {
            // 1. Summary Cards
            container.innerHTML = `
                <div class="stat-card" onclick="showSection('student')">
                    <div class="stat-value">${stats.total_students}</div>
                    <div class="stat-label">Students</div>
                    <div class="stat-icon">🎓</div>
                </div>
                <div class="stat-card" onclick="showSection('teacher')">
                    <div class="stat-value">${stats.total_teachers}</div>
                    <div class="stat-label">Teachers</div>
                    <div class="stat-icon">👨‍🏫</div>
                </div>
                <div class="stat-card" onclick="showSection('subject')">
                    <div class="stat-value">${stats.total_subjects}</div>
                    <div class="stat-label">Subjects</div>
                    <div class="stat-icon">📚</div>
                </div>
                <div class="stat-card" onclick="showSection('exam')">
                    <div class="stat-value">${stats.total_exams}</div>
                    <div class="stat-label">Exams</div>
                    <div class="stat-icon">📝</div>
                </div>
                <div class="stat-card" style="border-bottom: 4px solid #28a745;">
                    <div class="stat-value" style="color: #28a745;">${stats.active_exams}</div>
                    <div class="stat-label">Active</div>
                    <div class="stat-icon">🟢</div>
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
                    <div class="alert-box ${a.type}">${a.message}</div>
                `).join('');
            }
        }

        // 3. Recent Exams Table
        const recentExamsTable = document.querySelector('#admin-recent-exams-table tbody');
        if (recentExamsTable) {
            if (stats.recent_exams.length === 0) {
                recentExamsTable.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">No recent exams</td></tr>';
            } else {
                recentExamsTable.innerHTML = stats.recent_exams.map(e => `
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

            subjects.forEach(sub => {
                select.appendChild(new Option(sub.subject_name, sub.subject_id));
                if (assignSelect) assignSelect.appendChild(new Option(sub.subject_name, sub.subject_id));
                if (filterSelect) filterSelect.appendChild(new Option(sub.subject_name, sub.subject_id));
                if (assignFilterSelect) assignFilterSelect.appendChild(new Option(sub.subject_name, sub.subject_id));
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
                    <button onclick="deleteEntity('teachers', ${t.teacher_id})" class="btn-delete">Delete</button>
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
        if (exams.length === 0) {
            container.innerHTML = '<p>No exams found.</p>';
            return;
        }
        const listHtml = exams.map(e => {
            const scopeLabel = e.exam_scope === 'DEPARTMENT' ? '(Entire Dept)' :
                               e.exam_scope === 'BATCH' ? `(Batch ${e.batch_year} - Sem ${e.semester})` :
                               `(${e.section_details || 'Specific Section'})`;
            return `<div class="question-item" style="border-left: 4px solid ${e.status === 'active' ? '#28a745' : '#ffc107'};">
                <div class="question-content">
                    <strong>${e.exam_name} <span style="font-weight:normal; font-size:0.85em; color:#666;">${scopeLabel}</span></strong>
                    <div style="font-size: 0.85rem; color: #666; margin-top: 4px;">
                        Marks: ${e.total_marks} | Duration: ${e.duration}m | Status: <span style="text-transform: capitalize;">${e.status}</span>
                    </div>
                </div>
                <div class="question-actions">
                    ${e.status !== 'active' ? 
                        `<button onclick="publishExam(${e.exam_id})" class="btn-edit" style="background-color: #17a2b8; color: white;">Publish</button>` : ''
                    }
                    <button onclick="viewExamResults(${e.exam_id})" class="btn-edit" style="background-color: #6f42c1; color: white;">Results</button>
                    <button onclick="editEntity('exam', ${e.exam_id})" class="btn-edit">Edit</button>
                    <button onclick="deleteEntity('exams', ${e.exam_id})" class="btn-delete">Delete</button>
                </div>
            </div>`;
        }).join('');
        container.innerHTML = listHtml;
    } catch (error) {
        console.error("Failed to load exams", error);
        container.innerHTML = '<p style="color: red;">Error loading exams.</p>';
    }
}

async function publishExam(examId) {
    if (!confirm("Are you sure you want to publish this exam? This will validate that question marks match the total marks.")) return;
    try {
        const result = await apiRequest(`/admin/exams/${examId}/publish`, "POST");
        alert(result.message);
        loadExamsList();
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
            document.getElementById('exam-date').value = data.date.replace(" ", "T");
            document.getElementById('exam-duration').value = data.duration;
            document.getElementById('exam-total-marks').value = data.total_marks;
            document.getElementById('exam-scope').value = data.exam_scope;
            
            // Trigger change event for scope
            const event = new Event('change');
            document.getElementById('exam-scope').dispatchEvent(event);
            
            // Wait for UI update then set section if needed
            if (data.exam_scope === 'SECTION') {
                // We need to fetch assigned section. For simplicity, we might need another call or just assume single section logic for now.
                // Since create exam only allows one section initially, we can try to set it if available.
                // Note: The current GET /admin/exams/{id} doesn't return assigned section. 
                // For full edit support of section assignment, we'd need to fetch that too.
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