document.addEventListener("DOMContentLoaded", () => {
    requireAuth("teacher");
    loadUserProfile();
    loadDashboardStats();
    loadAssignedSubjects(); // For dropdowns and list
    loadAssignedSections(); // For dropdowns and list
    loadMyExams();
});

async function loadUserProfile() {
    try {
        const profile = await apiRequest('/teacher/profile');
        document.getElementById('nav-user').textContent = profile.name;
        document.getElementById('nav-dept').textContent = profile.department_name;
    } catch (error) {
        console.error("Failed to load profile", error);
    }
}

async function showSection(sectionName) {
    document.querySelectorAll('.form-container').forEach(div => div.classList.remove('active'));
    document.querySelectorAll('.sidebar button').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(`${sectionName}-section`).classList.add('active');
    document.querySelector(`.sidebar button[data-section="${sectionName}"]`).classList.add('active');

    if (sectionName === 'my-exams') await loadMyExams();
    if (sectionName === 'questions') await loadMyExamsForDropdown();
    if (sectionName === 'create-exam') await loadExistingExamsForCreatePage();
    if (sectionName === 'results') await loadTeacherResults();
    if (sectionName === 'activity-logs') await initTeacherActivityLogs();
}

async function loadDashboardStats() {
    try {
        const stats = await apiRequest('/teacher/dashboard/stats');
        const container = document.getElementById('stats-container');
        
        // 1. Cards
        container.innerHTML = `
            <div class="stat-card" onclick="showSection('subjects')">
                <div class="stat-value">${stats.subjects_count}</div>
                <div class="stat-label">Subjects</div>
                <div class="stat-icon">📚</div>
            </div>
            <div class="stat-card" onclick="showSection('sections')">
                <div class="stat-value">${stats.sections_count}</div>
                <div class="stat-label">Sections</div>
                <div class="stat-icon">👥</div>
            </div>
            <div class="stat-card" onclick="filterAndShowExams('active')">
                <div class="stat-value" style="color: #28a745;">${stats.active_exams}</div>
                <div class="stat-label">Active Exams</div>
                <div class="stat-icon">🟢</div>
            </div>
            <div class="stat-card" onclick="filterAndShowExams('scheduled')">
                <div class="stat-value" style="color: #ffc107;">${stats.upcoming_exams}</div>
                <div class="stat-label">Upcoming</div>
                <div class="stat-icon">⏳</div>
            </div>
        `;

        // 2. Recent Activity
        const recentTable = document.querySelector('#recent-activity-table tbody');
        if (stats.recent_exams.length === 0) {
            recentTable.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#666;">No recent activity</td></tr>';
        } else {
            recentTable.innerHTML = stats.recent_exams.map(e => `
                <tr class="clickable-row" onclick="addQuestionsRedirect(${e.exam_id})" title="Click to view details">
                    <td><strong>${e.exam_name}</strong></td>
                    <td>${e.subject_name}</td>
                    <td>${e.sections || '<span style="color:#999">N/A</span>'}</td>
                    <td><span style="padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; background: ${e.status === 'active' ? '#d4edda' : '#fff3cd'}; color: ${e.status === 'active' ? '#155724' : '#856404'};">${e.status}</span></td>
                    <td>${formatDate(e.date)}</td>
                </tr>
            `).join('');
        }

        // 3. Upcoming This Week
        const upcomingList = document.getElementById('upcoming-list');
        if (stats.upcoming_week_exams.length === 0) {
            upcomingList.innerHTML = '<li style="color:#666; font-style:italic;">No exams scheduled this week</li>';
        } else {
            upcomingList.innerHTML = stats.upcoming_week_exams.map(e => `
                <li style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between;">
                    <span style="font-weight: 500;">${e.exam_name}</span>
                    <span style="color: #666; font-size: 0.9rem;">${new Date(e.date).toLocaleDateString()}</span>
                </li>
            `).join('');
        }

        // 4. Recent Results Summary
        const resultsDiv = document.getElementById('results-summary');
        if (!stats.result_summary) {
            resultsDiv.innerHTML = '<p style="color:#666; font-style:italic;">No results available yet</p>';
        } else {
            const r = stats.result_summary;
            resultsDiv.innerHTML = `
                <div style="margin-bottom: 10px; font-weight: bold; color: #2b6cb0;">${r.exam_name}</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div style="background: #f8fafc; padding: 8px; border-radius: 4px; text-align: center;">
                        <div style="font-size: 0.8rem; color: #666;">Avg Score</div>
                        <div style="font-weight: bold; color: #2d3748;">${parseFloat(r.avg_score).toFixed(1)}</div>
                    </div>
                    <div style="background: #f8fafc; padding: 8px; border-radius: 4px; text-align: center;">
                        <div style="font-size: 0.8rem; color: #666;">Attempts</div>
                        <div style="font-weight: bold; color: #2d3748;">${r.total_attempts}</div>
                    </div>
                    <div style="background: #f0fff4; padding: 8px; border-radius: 4px; text-align: center;">
                        <div style="font-size: 0.8rem; color: #276749;">Highest</div>
                        <div style="font-weight: bold; color: #22543d;">${r.max_score}</div>
                    </div>
                    <div style="background: #fff5f5; padding: 8px; border-radius: 4px; text-align: center;">
                        <div style="font-size: 0.8rem; color: #c53030;">Lowest</div>
                        <div style="font-weight: bold; color: #9b2c2c;">${r.min_score}</div>
                    </div>
                </div>
            `;
        }

        // 5. Performance Chart
        if (stats.pass_fail_distribution) {
            renderTeacherPerformanceChart(stats.pass_fail_distribution);
        }

    } catch (error) { console.error("Stats error", error); }
}

let teacherChart = null;

function renderTeacherPerformanceChart(data) {
    const ctx = document.getElementById('teacherPerformanceChart');
    if (!ctx) return;

    if (teacherChart) {
        teacherChart.destroy();
    }

    const passCount = data.pass_count || 0;
    const failCount = data.fail_count || 0;

    if (passCount === 0 && failCount === 0) {
        ctx.style.display = 'none';
        return;
    } else {
        ctx.style.display = 'block';
    }

    teacherChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Pass (>=40%)', 'Fail (<40%)'],
            datasets: [{
                data: [passCount, failCount],
                backgroundColor: ['#28a745', '#dc3545'],
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'Latest Exam Pass/Fail Distribution'
                }
            }
        }
    });
}

async function loadAssignedSubjects() {
    try {
        const subjects = await apiRequest('/teacher/subjects');
        const tbody = document.getElementById('subjects-table-body');
        const select = document.getElementById('exam-subject');
        const filterSelect = document.getElementById('exam-filter-subject');
        const search = document.getElementById('subject-filter-search') ? document.getElementById('subject-filter-search').value.toLowerCase() : '';

        if (subjects.length === 0) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color: #666;">No subjects assigned. Please contact your administrator.</td></tr>';
            if (select) select.innerHTML = '<option value="">No subjects assigned</option>';
            return;
        }

        // Group by Subject
        const grouped = {};
        subjects.forEach(row => {
            if (!grouped[row.subject_id]) {
                grouped[row.subject_id] = {
                    subject_name: row.subject_name,
                    subject_id: row.subject_id,
                    sections: []
                };
            }
            grouped[row.subject_id].sections.push({
                name: row.section_name,
                semester: row.semester,
                    batch: row.batch_year,
                count: row.student_count
            });
        });

        const groupedArray = Object.values(grouped).filter(s => s.subject_name.toLowerCase().includes(search));

        // Populate Table
        if (tbody) {
            tbody.innerHTML = groupedArray.map(s => `
                <tr>
                    <td class="subject-name-cell">${s.subject_name}</td>
                    <td>
                        <div class="section-list">
                            ${s.sections.map(sec => `
                                <div class="section-tag">
                                    <span>${sec.name}</span>
                                    <span class="semester-badge">${sec.batch || ''} - Sem ${sec.semester}</span>
                                    <span class="student-count-badge" title="Students">${sec.count} 👤</span>
                                </div>
                            `).join('')}
                        </div>
                    </td>
                    <td>
                        <button onclick="prefillCreateExam(${s.subject_id})" class="btn-edit" style="background-color: #3182ce; color: white;">Create Exam</button>
                    </td>
                </tr>
            `).join('');
        }

        // Populate Dropdown
        if (select) {
            select.innerHTML = '<option value="">Select Subject</option>';
            // Use the grouped array to avoid duplicates in dropdown
            Object.values(grouped).forEach(s => select.appendChild(new Option(s.subject_name, s.subject_id)));
        }

        if (filterSelect) {
            filterSelect.innerHTML = '<option value="">All Subjects</option>';
            Object.values(grouped).forEach(s => filterSelect.appendChild(new Option(s.subject_name, s.subject_id)));
        }
    } catch (error) { 
        console.error("Subjects error", error);
        const tbody = document.getElementById('subjects-table-body');
        if (tbody) tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color: red;">Error loading subjects: ${error.message}</td></tr>`;
    }
}

async function loadAssignedSections() {
    try {
        const sections = await apiRequest('/teacher/sections');
        const tbody = document.getElementById('sections-table-body');
        const select = document.getElementById('exam-section');
        const summary = document.getElementById('sections-summary');
        const resultSelect = document.getElementById('result-filter-section');
        
        // Filters
        const semesterFilter = document.getElementById('section-filter-semester') ? document.getElementById('section-filter-semester').value : '';
        const searchFilter = document.getElementById('section-filter-search') ? document.getElementById('section-filter-search').value.toLowerCase() : '';

        if (sections.length === 0) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: #666;">No sections assigned.</td></tr>';
            if (select) select.innerHTML = '<option value="">No sections assigned</option>';
            if (summary) summary.innerHTML = 'No sections assigned.';
            return;
        }

        // Filter Logic
        const filteredSections = sections.filter(s => {
            const matchSem = semesterFilter ? s.semester.toString() === semesterFilter : true;
            const matchSearch = s.section_name.toLowerCase().includes(searchFilter);
            return matchSem && matchSearch;
        });

        // Calculate Stats
        const totalSections = filteredSections.length;
        const totalStudents = filteredSections.reduce((sum, s) => sum + s.student_count, 0);

        if (summary) {
            summary.innerHTML = `Total Sections: <strong>${totalSections}</strong> | Total Students Across Sections: <strong>${totalStudents}</strong>`;
        }

        // Populate Table
        if (tbody) {
            if (filteredSections.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: #666;">No sections match filters.</td></tr>';
            } else {
                tbody.innerHTML = filteredSections.map(s => `
                    <tr>
                        <td><strong>${s.section_name}</strong></td>
                        <td><span class="semester-badge">${s.batch_year || ''} - Sem ${s.semester}</span></td>
                        <td>
                            <span class="student-count-badge" style="cursor:pointer;" onclick="viewSectionStudents(${s.section_id})">
                                ${s.student_count} 👤
                            </span>
                        </td>
                        <td>
                            <button onclick="viewSectionStudents(${s.section_id})" class="btn-edit" style="background-color: #17a2b8; color: white; margin-right: 5px;">View Students</button>
                            <button onclick="prefillCreateExamForSection(${s.section_id})" class="btn-edit" style="background-color: #3182ce; color: white;">Create Exam</button>
                        </td>
                    </tr>
                `).join('');
            }
        }

        // Populate Dropdown
        if (select) {
            select.innerHTML = '';
            sections.forEach(s => select.appendChild(new Option(`${s.section_name} (${s.batch_year}, Sem ${s.semester})`, s.section_id)));
        }

        if (resultSelect) {
            resultSelect.innerHTML = '<option value="">All Sections</option>';
            sections.forEach(s => resultSelect.appendChild(new Option(`${s.section_name} (${s.batch_year}, Sem ${s.semester})`, s.section_id)));
        }
    } catch (error) { 
        console.error("Sections error", error);
        const tbody = document.getElementById('sections-table-body');
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: red;">Error loading sections: ${error.message}</td></tr>`;
    }
}

async function handleCreateExam(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const examId = formData.get("exam_id");
    
    // Handle multi-select for sections
    const sectionSelect = document.getElementById('exam-section');
    const selectedSections = Array.from(sectionSelect.selectedOptions).map(opt => parseInt(opt.value));

    const data = {
        exam_name: formData.get("exam_name"),
        subject_id: parseInt(formData.get("subject_id")),
        duration: parseInt(formData.get("duration")),
        total_marks: parseInt(formData.get("total_marks")),
        exam_date: formData.get("exam_date"),
        section_ids: selectedSections
    };

    try {
        let result;
        if (examId) {
             result = await apiRequest(`/teacher/exams/${examId}`, "PUT", data);
        } else {
             result = await apiRequest("/teacher/exams/create", "POST", data);
        }

        alert("Success: " + (result.message || "Operation successful"));
        resetExamForm();
        loadMyExams();
        showSection('my-exams');
    } catch (error) {
        alert("Error: " + error.message);
    }
}

function resetExamForm() {
    const form = document.querySelector('#create-exam-section form');
    form.reset();
    document.getElementById('exam_id_hidden').value = "";
    document.getElementById('create-exam-btn').textContent = "Create Exam";
    document.getElementById('cancel-exam-edit-btn').style.display = "none";
    document.querySelector('#create-exam-section .section-title').textContent = "Create New Exam";
}

function filterAndShowExams(status) {
    const statusSelect = document.getElementById('exam-filter-status');
    if (statusSelect) statusSelect.value = status;
    showSection('my-exams');
}

function resetFilterAndShowExams() {
    const statusSelect = document.getElementById('exam-filter-status');
    if (statusSelect) statusSelect.value = "";
    showSection('my-exams');
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
    });
}

async function loadMyExams() {
    try {
        const tbody = document.querySelector('#my-exams-table tbody');
        const subjectId = document.getElementById('exam-filter-subject').value;
        const status = document.getElementById('exam-filter-status').value;
        const search = document.getElementById('exam-filter-search').value;

        const queryParams = new URLSearchParams();
        if (subjectId) queryParams.append('subject_id', subjectId);
        if (status) queryParams.append('status', status);
        if (search) queryParams.append('search', search);

        const exams = await apiRequest(`/teacher/exams?${queryParams.toString()}`);
        
        if (exams.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">No exams found.</td></tr>';
            return;
        }

        tbody.innerHTML = exams.map(e => `
            <tr class="clickable-row" onclick="addQuestionsRedirect(${e.exam_id})">
                <td>${e.exam_name}</td>
                <td>${e.subject_name}</td>
                <td>${e.total_marks}</td>
                <td>${e.sections ? e.sections : '<span style="color:#999">N/A</span>'}</td>
                <td>${formatDate(e.date)}</td>
                <td>${e.status}</td>
                <td onclick="event.stopPropagation();">
                    ${e.status === 'scheduled' ? `
                        <button onclick="publishExam(${e.exam_id})" class="btn-edit" style="background:#28a745;color:white">Publish</button>
                        <button onclick="editExam(${e.exam_id})" class="btn-edit">Edit</button>
                        <button onclick="deleteExam(${e.exam_id})" class="btn-delete">Delete</button>
                        <button onclick="addQuestionsRedirect(${e.exam_id})" class="btn-edit" style="background:#6f42c1;color:white">+ Q</button>
                    ` : ''}
                    ${e.status === 'active' ? `<span style="color:green; font-weight:bold;">Live</span>` : ''}
                    <button onclick="viewAttempts(${e.exam_id})" class="btn-edit">Attempts</button>
                </td>
            </tr>
        `).join('');
    } catch (error) { 
        console.error("Exams error", error);
        const tbody = document.querySelector('#my-exams-table tbody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: red;">Error loading exams: ${error.message}</td></tr>`;
    }
}

async function loadExistingExamsForCreatePage() {
    const tbody = document.getElementById('existing-exams-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';

    try {
        const exams = await apiRequest(`/teacher/exams`);
        
        if (exams.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No exams created yet.</td></tr>';
            return;
        }

        tbody.innerHTML = exams.map(e => `
            <tr>
                <td>${e.exam_name}</td>
                <td>${e.total_marks}</td>
                <td>${e.sections ? e.sections.substring(0, 50) + '...' : '<span style="color:#999">N/A</span>'}</td>
                <td>${formatDate(e.date)}</td>
                <td>
                    <button onclick="editExam(${e.exam_id})" class="btn-edit">Edit</button>
                    <button onclick="deleteExam(${e.exam_id})" class="btn-delete">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch (error) { 
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: red;">Error loading exams: ${error.message}</td></tr>`;
    }
}

async function loadMyExamsForDropdown() {
    try {
        const exams = await apiRequest('/teacher/exams');
        // Filter: Only draft (scheduled) exams that haven't started yet
        // Note: 'scheduled' in DB maps to draft/published-future logic here.
        // Ideally backend should filter, but for now we filter here or backend returns all 'scheduled'.
        // Let's assume 'scheduled' means editable until start time.
        const editableExams = exams.filter(e => e.status === 'scheduled');

        const select = document.getElementById('question-exam');
        select.innerHTML = '<option value="">Select Exam</option>';
        editableExams.forEach(e => select.appendChild(new Option(e.exam_name, e.exam_id)));
        
        if (editableExams.length === 0) {
            select.innerHTML = '<option value="">No editable exams available</option>';
        }
    } catch (error) { console.error("Dropdown error", error); }
}

async function handleAddQuestion(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    
    // Frontend Validation
    const examId = formData.get("exam_id");
    if (!examId) { alert("Please select an exam"); return; }

    if (!formData.get("question_text").trim()) { alert("Question text is required"); return; }
    
    const correctOptionVal = formData.get("correct_option");
    if (correctOptionVal === null) { alert("Please select a correct option"); return; }
    
    if (parseFloat(formData.get("marks")) <= 0) { alert("Marks must be greater than 0"); return; }

    const payload = {
        exam_id: parseInt(examId),
        question_text: formData.get("question_text"),
        marks: parseFloat(formData.get("marks")),
        options: []
    };

    const correctIndex = parseInt(correctOptionVal);

    // Collect non-empty options
    for (let i = 0; i < 4; i++) {
        const text = formData.get(`option_${i}`);
        if (text && text.trim() !== "") {
            payload.options.push({
                text: text.trim(),
                is_correct: (i === correctIndex)
            });
        }
    }

    if (payload.options.length < 2) {
        alert("Please provide at least 2 options.");
        return;
    }

    // Ensure the selected correct option is among the provided options
    const hasCorrect = payload.options.some(o => o.is_correct);
    if (!hasCorrect) {
        alert("The selected correct option cannot be empty.");
        return;
    }

    const questionId = formData.get("question_id");

    try {
        if (questionId) {
            await apiRequest(`/teacher/questions/${questionId}`, "PUT", payload);
            alert("Question updated successfully!");
            resetQuestionForm();
        } else {
            await apiRequest("/teacher/exams/add-question", "POST", payload);
            alert("Question added successfully!");
            form.reset();
            document.getElementById('question-exam').value = payload.exam_id;
        }
        // Reload questions list
        loadExamQuestions(payload.exam_id);
    } catch (error) { alert("Error: " + error.message); }
}

async function loadExamQuestions(examId) {
    const container = document.getElementById('questions-list-container');
    const tbody = document.querySelector('#questions-table tbody');
    const summary = document.getElementById('marks-summary');

    if (!examId) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    tbody.innerHTML = '<tr><td colspan="4">Loading questions...</td></tr>';

    try {
        const data = await apiRequest(`/teacher/exams/${examId}/questions`);
        
        summary.textContent = `Total Marks Used: ${data.total_marks_used} / ${data.exam_total_marks}`;
        if (data.total_marks_used > data.exam_total_marks) {
            summary.style.color = '#c53030';
            summary.style.backgroundColor = '#fff5f5';
            summary.textContent += ' (Exceeded!)';
        } else if (data.total_marks_used === data.exam_total_marks) {
            summary.style.color = '#276749';
            summary.style.backgroundColor = '#f0fff4';
            summary.textContent += ' (Complete)';
        }

        if (data.questions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">No questions added yet.</td></tr>';
            return;
        }

        tbody.innerHTML = data.questions.map((q, index) => `
            <tr>
                <td><strong>Q${index+1}.</strong> ${q.question_text}</td>
                <td>${q.correct_option || '-'}</td>
                <td>${q.marks}</td>
                <td>
                    <button type="button" onclick="editQuestion(${q.question_id})" class="btn-edit">Edit</button>
                    <button type="button" onclick="deleteQuestion(${q.question_id}, ${examId})" class="btn-delete">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch (error) { console.error("Load questions error", error); }
}

async function publishExam(examId) {
    if (!confirm("Publishing will make the exam visible to students. Continue?")) return;
    try {
        await apiRequest(`/teacher/exams/${examId}/publish`, "POST");
        alert("Exam Published!");
        loadMyExams();
    } catch (error) { alert("Error: " + error.message); }
}

async function deleteExam(examId) {
    if (!confirm("Are you sure you want to delete this exam? This will delete all associated questions and cannot be undone.")) return;
    try {
        const result = await apiRequest(`/teacher/exams/${examId}`, "DELETE");
        alert(result.message || "Exam deleted successfully!");
        loadMyExams();
        loadMyExamsForDropdown(); // Refresh dropdown in case it was there
    } catch (error) {
        alert("Error deleting exam: " + error.message);
    }
}

async function deleteQuestion(questionId, examId) {
    if (!confirm("Delete this question?")) return;
    try {
        await apiRequest(`/teacher/questions/${questionId}`, "DELETE");
        // Reload questions list
        loadExamQuestions(examId);
    } catch (error) { alert("Error: " + error.message); }
}

async function editExam(examId) {
    // Note: This reuses the create form. For a real edit, we might want a PUT endpoint.
    // For now, we'll just pre-fill the create form to allow "re-creating" or editing if we add PUT support.
    // Since we don't have a PUT endpoint for teacher exams yet, this is a placeholder for future logic or
    // we can implement a basic "delete and re-create" flow if the exam hasn't started.
    // Ideally, we should fetch details and populate the form.
    try {
        const exam = await apiRequest(`/teacher/exams/${examId}`);
        showSection('create-exam');
        
        // Update UI for Edit Mode
        document.getElementById('exam_id_hidden').value = exam.exam_id;
        document.getElementById('create-exam-btn').textContent = "Update Exam";
        document.getElementById('cancel-exam-edit-btn').style.display = "inline-block";
        document.querySelector('#create-exam-section .section-title').textContent = "Edit Exam";
        
        document.getElementById('exam-name').value = exam.exam_name;
        document.getElementById('exam-subject').value = exam.subject_id;
        document.getElementById('exam-duration').value = exam.duration;
        document.getElementById('exam-total-marks').value = exam.total_marks;
        document.getElementById('exam-date').value = exam.date.replace(" ", "T");
        
        const sectionSelect = document.getElementById('exam-section');
        Array.from(sectionSelect.options).forEach(opt => {
            opt.selected = exam.section_ids.includes(parseInt(opt.value));
        });
        
    } catch (error) { alert("Error loading exam details: " + error.message); }
}

async function addQuestionsRedirect(examId) {
    await showSection('questions');
    const select = document.getElementById('question-exam');
    if (select) { select.value = examId; loadExamQuestions(examId); }
}

async function viewAttempts(examId) {
    const modal = document.getElementById('attempts-modal');
    const tbody = document.querySelector('#attempts-table tbody');
    modal.style.display = 'block';
    tbody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';

    try {
        const attempts = await apiRequest(`/teacher/exams/${examId}/attempts`);
        if (attempts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">No attempts yet.</td></tr>';
            return;
        }
        tbody.innerHTML = attempts.map(a => `<tr><td>${a.student_name}</td><td>${a.usn}</td><td>${a.section_name}</td><td>${a.total_marks}</td><td>${a.result_status}</td></tr>`).join('');
    } catch (error) { tbody.innerHTML = `<tr><td colspan="5">Error: ${error.message}</td></tr>`; }
}

function prefillCreateExam(subjectId) {
    showSection('create-exam');
    const select = document.getElementById('exam-subject');
    if (select) select.value = subjectId;
}

async function viewSectionStudents(sectionId) {
    const modal = document.getElementById('section-students-modal');
    const tbody = document.querySelector('#section-students-table tbody');
    modal.style.display = 'block';
    tbody.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';

    try {
        const students = await apiRequest(`/teacher/sections/${sectionId}/students`);
        if (students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3">No students in this section.</td></tr>';
            return;
        }
        tbody.innerHTML = students.map(s => `
            <tr>
                <td>${s.usn}</td>
                <td><strong>${s.name}</strong></td>
                <td>${s.email}</td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="3" style="color:red;">Error: ${error.message}</td></tr>`;
    }
}

function prefillCreateExamForSection(sectionId) {
    showSection('create-exam');
    const sectionSelect = document.getElementById('exam-section');
    
    if (sectionSelect) {
        // Deselect all
        Array.from(sectionSelect.options).forEach(opt => opt.selected = false);
        // Select specific
        const option = sectionSelect.querySelector(`option[value="${sectionId}"]`);
        if (option) option.selected = true;
    }
}

async function editQuestion(questionId) {
    try {
        const question = await apiRequest(`/teacher/questions/${questionId}`);
        
        document.getElementById('question_id_hidden_q').value = question.question_id;
        document.getElementById('question-exam').value = question.exam_id;
        document.getElementById('question-text').value = question.question_text;
        document.getElementById('question-marks').value = question.marks;

        // Reset options
        document.querySelectorAll('input[name^="option_"]').forEach(i => i.value = '');
        document.querySelectorAll('input[name="correct_option"]').forEach(i => i.checked = false);

        // Populate options
        if (question.options) {
            question.options.forEach((opt, index) => {
                if (index < 4) {
                    document.getElementsByName(`option_${index}`)[0].value = opt.option_text;
                    if (opt.is_correct) {
                        document.querySelector(`input[name="correct_option"][value="${index}"]`).checked = true;
                    }
                }
            });
        }

        const submitBtn = document.getElementById('add-update-question-btn');
        if (submitBtn) submitBtn.textContent = "Update Question";
        
        const cancelBtn = document.getElementById('cancel-question-edit-btn');
        if (cancelBtn) cancelBtn.style.display = "inline-block";
        
        // Scroll to top of form
        document.getElementById('questions-section').scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        alert("Error loading question: " + error.message);
    }
}

function resetQuestionForm() {
    const form = document.querySelector('#questions-section form');
    const examId = document.getElementById('question-exam').value;
    form.reset();
    document.getElementById('question-exam').value = examId;
    
    document.getElementById('question_id_hidden_q').value = "";
    const submitBtn = document.getElementById('add-update-question-btn');
    if (submitBtn) submitBtn.textContent = "Add Question";
    const cancelBtn = document.getElementById('cancel-question-edit-btn');
    if (cancelBtn) cancelBtn.style.display = "none";
}

async function loadTeacherResults() {
    const tbody = document.getElementById('teacher-results-body');
    if (!tbody) return;

    const semester = document.getElementById('result-filter-semester').value;
    const sectionId = document.getElementById('result-filter-section').value;
    const search = document.getElementById('result-filter-search').value;

    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading...</td></tr>';

    try {
        const queryParams = new URLSearchParams();
        if (semester) queryParams.append('semester', semester);
        if (sectionId) queryParams.append('section_id', sectionId);
        if (search) queryParams.append('search', search);

        const results = await apiRequest(`/teacher/results?${queryParams.toString()}`);
        
        if (results.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No results found.</td></tr>';
            return;
        }

        tbody.innerHTML = results.map(r => {
            const percentage = ((r.obtained_marks / r.max_marks) * 100).toFixed(1);
            return `<tr>
                <td>${r.usn}</td>
                <td>${r.student_name}</td>
                <td>${r.section_name} (Sem ${r.semester})</td>
                <td>${r.exam_name}</td>
                <td>${r.subject_name}</td>
                <td>${r.obtained_marks} / ${r.max_marks}</td>
                <td>${percentage}%</td>
                <td><span style="color:${r.result_status === 'Finalized' ? 'green' : 'orange'}">${r.result_status}</span></td>
            </tr>`;
        }).join('');
    } catch (error) {
        console.error("Results error", error);
        tbody.innerHTML = `<tr><td colspan="8" style="color:red; text-align:center;">Error: ${error.message}</td></tr>`;
    }
}

// --- Teacher Activity Logs ---
async function initTeacherActivityLogs() {
    // Load dropdowns
    await loadMyExamsForLogs();
    await loadSectionsForLogs();
    // Load logs
    loadTeacherActivityLogs();
}

async function loadMyExamsForLogs() {
    try {
        const exams = await apiRequest('/teacher/exams');
        const select = document.getElementById('activity-log-exam-filter');
        select.innerHTML = '<option value="">All Exams</option>';
        exams.forEach(e => select.appendChild(new Option(e.exam_name, e.exam_id)));
    } catch (error) { console.error("Logs exam dropdown error", error); }
}

async function loadSectionsForLogs() {
    try {
        const sections = await apiRequest('/teacher/sections');
        const select = document.getElementById('activity-log-section-filter');
        select.innerHTML = '<option value="">All Sections</option>';
        sections.forEach(s => select.appendChild(new Option(`${s.section_name} (${s.batch_year}, Sem ${s.semester})`, s.section_id)));
    } catch (error) { console.error("Logs section dropdown error", error); }
}

async function loadTeacherActivityLogs(page = 1) {
    const tbody = document.getElementById('teacher-activity-logs-body');
    const paginationContainer = document.getElementById('teacher-activity-logs-pagination');
    if (!tbody) return;

    const startDate = document.getElementById('activity-log-start-date').value;
    const endDate = document.getElementById('activity-log-end-date').value;
    const examId = document.getElementById('activity-log-exam-filter').value;
    const sectionId = document.getElementById('activity-log-section-filter').value;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';

    try {
        const queryParams = new URLSearchParams({ page, limit: 20 });
        if (startDate) queryParams.append('start_date', startDate);
        if (endDate) queryParams.append('end_date', endDate);
        if (examId) queryParams.append('exam_id', examId);
        if (sectionId) queryParams.append('section_id', sectionId);

        const response = await apiRequest(`/teacher/activity-logs?${queryParams.toString()}`);
        const { logs, total_pages } = response;

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No activity found.</td></tr>';
            paginationContainer.innerHTML = '';
            return;
        }

        tbody.innerHTML = logs.map(log => `
            <tr>
                <td>${new Date(log.created_at).toLocaleString()}</td>
                <td>${log.action}</td>
                <td>${log.student_name || '-'}</td>
                <td>${log.exam_name || '-'}</td>
                <td>${log.section_name || '-'}</td>
                <td>${log.ip_address || '-'}</td>
            </tr>
        `).join('');

        // Pagination
        let paginationHtml = '';
        if (total_pages > 1) {
            paginationHtml += `<button type="button" onclick="loadTeacherActivityLogs(${page - 1})" ${page === 1 ? 'disabled' : ''}>&laquo;</button>`;
            for (let i = 1; i <= total_pages; i++) {
                paginationHtml += `<button type="button" onclick="loadTeacherActivityLogs(${i})" class="${i === page ? 'active' : ''}">${i}</button>`;
            }
            paginationHtml += `<button type="button" onclick="loadTeacherActivityLogs(${page + 1})" ${page === total_pages ? 'disabled' : ''}>&raquo;</button>`;
        }
        paginationContainer.innerHTML = paginationHtml;

    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center;">Error: ${error.message}</td></tr>`;
    }
}