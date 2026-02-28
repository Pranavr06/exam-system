document.addEventListener("DOMContentLoaded", () => {
    // Ensure user is logged in and is an admin
    requireAuth("admin");

    // Initialize Dashboard Data
    loadSubjects();
    loadSections();
    loadExams();
    
    // Load Lists
    loadTeachersList();
    loadStudentsList();
    loadSubjectsList();
    loadSectionsList();
    loadExamsList();

    // Toggle Section Dropdown based on Scope
    const scopeSelect = document.getElementById('exam-scope');
    const sectionContainer = document.getElementById('exam-section-container');
    const sectionSelect = document.getElementById('exam-section-select');

    if (scopeSelect && sectionContainer) {
        scopeSelect.addEventListener('change', (e) => {
            if (e.target.value === 'SECTION') {
                sectionContainer.style.display = 'block';
                sectionSelect.required = true;
            } else {
                sectionContainer.style.display = 'none';
                sectionSelect.required = false;
                sectionSelect.value = "";
            }
        });
    }
    
    // Initialize state based on current value (handles page reloads)
    if (scopeSelect && scopeSelect.value === 'SECTION') {
         sectionContainer.style.display = 'block';
         sectionSelect.required = true;
    } else if (scopeSelect) {
         sectionContainer.style.display = 'none';
         sectionSelect.required = false;
    }

    // Load questions when exam is selected
    const questionExamSelect = document.getElementById('question-exam-id');
    if (questionExamSelect) {
        questionExamSelect.addEventListener('change', (e) => {
            loadQuestionsForExam(e.target.value);
        });
    }
});

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
    }

    // Convert numeric strings to integers (Backend expects integers for IDs and duration)
    const numericFields = ['department_id', 'subject_id', 'duration', 'exam_id', 'section_id', 'semester'];
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
        marks: parseInt(formData.get("marks")),
        options: []
    };

    if (payload.marks > 4) {
        alert("Marks cannot exceed 4");
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

// Load Subjects into Dropdown
async function loadSubjects() {
    try {
        const subjects = await apiRequest('/admin/subjects');
        const select = document.getElementById('exam-subject');
        if (select) {
            select.innerHTML = '<option value="">Select Subject</option>';
            subjects.forEach(sub => {
                const option = document.createElement('option');
                option.value = sub.subject_id;
                option.textContent = sub.subject_name;
                select.appendChild(option);
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
                    option.textContent = `${sec.section_name} (Sem ${sec.semester})`;
                    select.appendChild(option);
                });
            }
        };

        populateSelect('student-section-id');
        populateSelect('exam-section-select');

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
                    option.textContent = exam.exam_name;
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
    const container = document.getElementById('students-list');
    if (!container) return;
    container.innerHTML = '<p>Loading...</p>';
    try {
        const students = await apiRequest('/admin/students');
        if (students.length === 0) {
            container.innerHTML = '<p>No students found.</p>';
            return;
        }
        const listHtml = students.map(s => 
            `<div class="question-item">
                <div class="question-content"><strong>${s.name}</strong> (${s.usn}) - Sem ${s.semester} ${s.section_label}</div>
                <div class="question-actions">
                    <button onclick="editEntity('student', ${s.student_id})" class="btn-edit">Edit</button>
                    <button onclick="deleteEntity('students', ${s.student_id})" class="btn-delete">Delete</button>
                </div>
            </div>`
        ).join('');
        container.innerHTML = listHtml;
    } catch (error) {
        console.error("Failed to load students", error);
        container.innerHTML = '<p style="color: red;">Error loading students.</p>';
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
    const container = document.getElementById('sections-list');
    if (!container) return;
    container.innerHTML = '<p>Loading...</p>';
    try {
        const sections = await apiRequest('/admin/sections');
        if (sections.length === 0) {
            container.innerHTML = '<p>No sections found.</p>';
            return;
        }
        const listHtml = sections.map(s => 
            `<div class="question-item">
                <div class="question-content">Section ${s.section_name} (Sem ${s.semester})</div>
                <div class="question-actions">
                    <button onclick="editEntity('section', ${s.section_id})" class="btn-edit">Edit</button>
                    <button onclick="deleteEntity('sections', ${s.section_id})" class="btn-delete">Delete</button>
                </div>
            </div>`
        ).join('');
        container.innerHTML = listHtml;
    } catch (error) {
        console.error("Failed to load sections", error);
        container.innerHTML = '<p style="color: red;">Error loading sections.</p>';
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
        const listHtml = exams.map(e => 
            `<div class="question-item">
                <div class="question-content"><strong>${e.exam_name}</strong></div>
                <div class="question-actions">
                    <button onclick="editEntity('exam', ${e.exam_id})" class="btn-edit">Edit</button>
                    <button onclick="deleteEntity('exams', ${e.exam_id})" class="btn-delete">Delete</button>
                </div>
            </div>`
        ).join('');
        container.innerHTML = listHtml;
    } catch (error) {
        console.error("Failed to load exams", error);
        container.innerHTML = '<p style="color: red;">Error loading exams.</p>';
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
            document.getElementById('section-semester').value = data.semester;
            
            toggleEditMode('section', true);
        } else if (type === 'exam') {
            document.querySelector('input[name="exam_id_hidden"]').value = data.exam_id;
            document.getElementById('exam-name').value = data.exam_name;
            document.getElementById('exam-subject').value = data.subject_id;
            document.getElementById('exam-date').value = data.date.replace(" ", "T");
            document.getElementById('exam-duration').value = data.duration;
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