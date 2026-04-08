let subjectSectionsMap = {};
let subjectsDataPromise = null;
let currentResultsData = [];
let currentLogsData = [];
let navHistory = [];
let showingArchived = false;
let isNavigatingBack = false;

document.addEventListener("DOMContentLoaded", () => {
    requireAuth("teacher");
    loadUserProfile();
    showSection('dashboard');
    
    // Load initial data for dropdowns
    subjectsDataPromise = loadSubjectsAndSectionsData();
    loadDepartmentSectionsForFilter();
    loadLabHierarchy();
    
    const modeSelect = document.getElementById('exam-mode');
    if (modeSelect) {
        modeSelect.addEventListener('change', toggleExamMode);
        const blockSelect = document.getElementById('exam-block');
        if (blockSelect) blockSelect.addEventListener('change', handleBlockChange);
        const floorSelect = document.getElementById('exam-floor');
        if (floorSelect) floorSelect.addEventListener('change', handleFloorChange);
    }
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
    const section = document.getElementById(`${sectionName}-section`);
    if (section) section.classList.add('active');
    
    const btn = document.querySelector(`.sidebar button[data-section="${sectionName}"]`);
    if (btn) btn.classList.add('active');

    updateBreadcrumb(sectionName);

    // Load data for the section
    if (sectionName === 'dashboard') return loadDashboardStats();
    if (sectionName === 'subjects') return loadAssignedSubjects();
    if (sectionName === 'sections') return loadAssignedSections();
    if (sectionName === 'create-exam') return loadExistingExams();
    if (sectionName === 'questions') return loadExamsForQuestions();
    if (sectionName === 'my-exams') return loadMyExams();
    if (sectionName === 'results') return loadTeacherResults();
    if (sectionName === 'activity-logs') return loadTeacherActivityLogs();
    if (sectionName === 'violations') {
        loadTeacherViolationAnalytics();
        return;
    }
    if (sectionName === 'monitor') return; // Data loaded by function call
    if (sectionName === 'analytics') return; // Data loaded by function call
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
        'subjects': 'My Subjects',
        'sections': 'My Sections',
        'create-exam': 'Create Exam',
        'questions': 'Add Questions',
        'my-exams': 'My Exams',
        'results': 'View Results',
        'violations': 'Violations',
        'activity-logs': 'Activity Logs',
        'monitor': 'Live Monitor',
        'analytics': 'Analytics'
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

function resetFilterAndShowExams() {
    const statusSelect = document.getElementById('exam-filter-status');
    if(statusSelect) statusSelect.value = "";
    showSection('my-exams');
}

function toggleArchivedExams() {
    showingArchived = !showingArchived;
    const btn = document.getElementById('toggle-archived-btn');
    if (btn) btn.textContent = showingArchived ? "View Active" : "View Archived";
    loadMyExams();
}

// --- Dashboard Stats ---
async function loadDashboardStats() {
    const container = document.getElementById('stats-container');
    const alertsContainer = document.getElementById('teacher-alerts-container');
    container.innerHTML = '<div class="spinner"></div>';
    
    try {
        const stats = await apiRequest('/teacher/dashboard/stats');
        
        // Render Alerts
        if (alertsContainer) {
            if (stats.alerts && stats.alerts.length > 0) {
                alertsContainer.innerHTML = stats.alerts.map(a => `
                    <div class="alert-box ${a.type}" style="background-color: #fff3cd; color: #856404; padding: 12px; margin-bottom: 10px; border: 1px solid #ffeeba; border-radius: 6px; display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center;">
                            <i class="fas fa-exclamation-triangle" style="margin-right: 10px;"></i>
                            <span>${a.message}</span>
                        </div>
                        ${a.action === 'add_questions' ? `<button onclick="goToAddQuestions(${a.exam_id})" class="btn-edit" style="background-color: #ffc107; color: #000; border: 1px solid #e0a800; font-size: 0.8rem; padding: 4px 8px;">Fix Now</button>` : ''}
                    </div>
                `).join('');
            } else {
                alertsContainer.innerHTML = '';
            }
        }
        
        // Cards
        container.innerHTML = `
            <div class="stat-card" onclick="showSection('subjects')">
                <div class="stat-value">${stats.subjects_count}</div>
                <div class="stat-label">My Subjects</div>
                <div class="stat-icon">📚</div>
            </div>
            <div class="stat-card" onclick="showSection('sections')">
                <div class="stat-value">${stats.sections_count}</div>
                <div class="stat-label">My Sections</div>
                <div class="stat-icon">👥</div>
            </div>
            <div class="stat-card" onclick="showSection('my-exams')">
                <div class="stat-value">${stats.total_exams_created}</div>
                <div class="stat-label">Total Exams Created</div>
                <div class="stat-icon">📝</div>
            </div>
            <div class="stat-card" onclick="showSection('my-exams')">
                <div class="stat-value">${stats.active_exams}</div>
                <div class="stat-label">Active Exams</div>
                <div class="stat-icon">🟢</div>
            </div>
            <div class="stat-card" onclick="showSection('my-exams')">
                <div class="stat-value">${stats.upcoming_exams}</div>
                <div class="stat-label">Upcoming Exams</div>
                <div class="stat-icon">📅</div>
            </div>
        `;

        // Recent Activity Table
        const recentTable = document.querySelector('#recent-activity-table tbody');
        if (recentTable) {
            if (stats.recent_exams.length === 0) {
                recentTable.innerHTML = '<tr><td colspan="5" style="text-align:center">No recent activity</td></tr>';
            } else {
                recentTable.innerHTML = stats.recent_exams.slice(0, 5).map(e => `
                    <tr>
                        <td><strong>${e.exam_name}</strong></td>
                        <td>${e.subject_name}</td>
                        <td>${e.sections || 'N/A'}</td>
                        <td><span class="status-badge ${e.status}">${e.status}</span></td>
                        <td>${new Date(e.date).toLocaleDateString()}</td>
                    </tr>
                `).join('');
            }
        }

        // Upcoming List
        const upcomingList = document.getElementById('upcoming-list');
        if (upcomingList) {
            if (stats.upcoming_week_exams.length === 0) {
                upcomingList.innerHTML = '<li style="color:#666; text-align:center;">No exams this week</li>';
            } else {
                upcomingList.innerHTML = stats.upcoming_week_exams.slice(0, 5).map(e => `
                    <li style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
                        <strong>${e.exam_name}</strong><br>
                        <span style="font-size: 0.85rem; color: #666;">${new Date(e.date).toLocaleString()}</span>
                    </li>
                `).join('');
            }
        }

        // Results Summary
        const resultsSummary = document.getElementById('results-summary');
        if (resultsSummary && stats.result_summary) {
            resultsSummary.innerHTML = `
                <div style="font-weight:bold; margin-bottom:5px;">${stats.result_summary.exam_name}</div>
                <div style="display:flex; justify-content:space-between; font-size:0.9rem;">
                    <span>Avg: ${parseFloat(stats.result_summary.avg_score).toFixed(1)}</span>
                    <span>Max: ${stats.result_summary.max_score}</span>
                </div>
            `;
            
            // Render Chart if data exists
            if (stats.pass_fail_distribution) {
                renderPerformanceChart(stats.pass_fail_distribution);
            }
        } else if (resultsSummary) {
            resultsSummary.innerHTML = '<p style="color:#666; text-align:center;">No results yet.</p>';
        }

    } catch (error) {
        console.error(error);
        container.innerHTML = '<p style="color:red">Failed to load stats</p>';
    }
}

let perfChart = null;
function renderPerformanceChart(data) {
    const ctx = document.getElementById('teacherPerformanceChart');
    if (!ctx) return;

    if (perfChart) perfChart.destroy();

    perfChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Pass', 'Fail'],
            datasets: [{
                data: [data.pass_count, data.fail_count],
                backgroundColor: ['#48bb78', '#f56565'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

// --- Subjects & Sections Data (Dropdowns) ---
async function loadSubjectsAndSectionsData() {
    try {
        const data = await apiRequest('/teacher/subjects');
        subjectSectionsMap = {};
        
        data.forEach(row => {
            if (!subjectSectionsMap[row.subject_id]) {
                subjectSectionsMap[row.subject_id] = {
                    name: row.subject_name,
                    sections: []
                };
            }
            subjectSectionsMap[row.subject_id].sections.push({
                id: row.section_id,
                name: `${row.section_name} (${row.batch_year}, Sem ${row.semester})`
            });
        });

        populateSubjectDropdowns();
    } catch (error) {
        console.error("Failed to load subjects data", error);
    }
}

function populateSubjectDropdowns() {
    const createExamSubjectSelect = document.getElementById('exam-subject');
    const filterSubjectSelect = document.getElementById('exam-filter-subject');
    
    // Clear
    if (createExamSubjectSelect) createExamSubjectSelect.innerHTML = '<option value="">Select Subject</option>';
    if (filterSubjectSelect) filterSubjectSelect.innerHTML = '<option value="">All Subjects</option>';

    for (const [id, info] of Object.entries(subjectSectionsMap)) {
        if (createExamSubjectSelect) createExamSubjectSelect.appendChild(new Option(info.name, id));
        if (filterSubjectSelect) filterSubjectSelect.appendChild(new Option(info.name, id));
    }
    
    // Add listener for Create Exam subject change
    if (createExamSubjectSelect) {
        createExamSubjectSelect.addEventListener('change', function() {
            const sectionSelect = document.getElementById('exam-section');
            sectionSelect.innerHTML = ''; // Clear
            
            const subjectId = this.value;
            if (subjectId && subjectSectionsMap[subjectId]) {
                subjectSectionsMap[subjectId].sections.forEach(sec => {
                    sectionSelect.appendChild(new Option(sec.name, sec.id));
                });
            }
        });
    }
}

async function loadDepartmentSectionsForFilter() {
    const select = document.getElementById('result-filter-section');
    if (!select) return;
    
    try {
        const sections = await apiRequest('/teacher/department/sections');
        select.innerHTML = '<option value="">All Sections</option>';
        sections.forEach(s => {
            select.appendChild(new Option(`${s.section_name} (Sem ${s.semester})`, s.section_id));
        });
    } catch (error) {
        console.error("Failed to load department sections", error);
    }
}

// --- Create Exam ---
async function handleCreateExam(event) {
    event.preventDefault();
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]') || document.getElementById('create-exam-btn');
    const originalBtnText = submitBtn ? submitBtn.textContent : 'Create Exam';
    
    const formData = new FormData(form);
    
    // Handle multiple select for sections
    const sectionSelect = document.getElementById('exam-section');
    const selectedSections = Array.from(sectionSelect.selectedOptions).map(option => parseInt(option.value));

    // 1. Validate Date
    const examDate = formData.get('exam_date');
    if (!examDate) return alert("Please select a date and time for the exam.");
    if (new Date(examDate) < new Date()) {
        return alert("Cannot schedule an exam in the past.");
    }

    // 2. Validate Duration
    const duration = parseInt(formData.get('duration'));
    if (isNaN(duration) || duration < 5 || duration > 180) {
        return alert("Please enter a valid duration between 5 and 180 minutes.");
    }

    // 3. Validate Selection
    if (selectedSections.length === 0) {
        return alert("Please select at least one section for this exam.");
    }

    const payload = {
        exam_name: formData.get('exam_name'),
        subject_id: parseInt(formData.get('subject_id')),
        duration: duration,
        total_marks: parseInt(formData.get('total_marks')),
        exam_date: examDate,
        section_ids: selectedSections,
        mode: formData.get('mode') || 'ONLINE'
    };

    // 4. Disable Button & Show Loading
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';
    }

    // Only include center data if mode is CENTER
    if (payload.mode === 'CENTER') {
        payload.lab_id = parseInt(formData.get('lab_id'));
        payload.password = formData.get('password');
    }

    const examId = formData.get('exam_id');
    const method = examId ? 'PUT' : 'POST';
    const url = examId ? `/teacher/exams/${examId}` : '/teacher/exams/create';

    try {
        const result = await apiRequest(url, method, payload);
        alert(result.message);
        resetExamForm();
        loadExistingExams();
    } catch (error) {
        alert("Error: " + error.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    }
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

function resetExamForm() {
    document.getElementById('create-exam-section').querySelector('form').reset();
    document.getElementById('exam_id_hidden').value = '';
    document.getElementById('create-exam-btn').textContent = 'Create Exam';
    document.getElementById('cancel-exam-edit-btn').style.display = 'none';

    // Set dynamic min date
    const dateInput = document.getElementById('exam-date');
    if (dateInput) {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        dateInput.min = now.toISOString().slice(0, 16);
    }
}

async function loadExistingExams() {
    const tbody = document.getElementById('existing-exams-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';

    try {
        const exams = await apiRequest('/teacher/exams');
        const filteredExams = exams.filter(e => e.status !== 'completed');
        if (filteredExams.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No exams found.</td></tr>';
            return;
        }

        tbody.innerHTML = filteredExams.map(e => `
            <tr>
                <td><strong>${e.exam_name}</strong></td>
                <td>${e.total_marks}</td>
                <td>${e.sections}</td>
                <td>${new Date(e.date).toLocaleString()}</td>
                <td><span class="status-badge ${e.status}">${e.status}</span></td>
                <td class="question-actions">
                    ${e.status === 'scheduled' ? `
                        <button onclick="editExam(${e.exam_id})" class="btn-edit" title="Edit Exam">Edit</button>
                        <button onclick="publishExam(${e.exam_id})" class="btn-edit" style="background-color:#17a2b8; color:white;" title="Publish Exam">Publish</button>
                        <button onclick="goToAddQuestions(${e.exam_id})" class="btn-edit" style="background-color: #28a745; color: white;" title="Add/View Questions">+Q</button>
                        ${e.mode === 'CENTER' ? `<button onclick="openAssignPCModal(${e.exam_id})" class="btn-edit" style="background-color: #4F46E5; color: white;" title="Assign Center PCs">PCs</button>` : ''}
                        <button onclick="deleteExam(${e.exam_id})" class="btn-delete" title="Delete Exam">Delete</button>
                    ` : e.status === 'active' ? `
                        <button onclick="monitorExam(${e.exam_id})" class="btn-edit" style="background-color:#2b6cb0; color:white;">Monitor</button>
                        <button onclick="goToExamResults('${e.exam_name.replace(/'/g, "\\'")}')" class="btn-edit" style="background-color:#6f42c1; color:white;">Results</button>
                        ${e.mode === 'CENTER' ? `<button onclick="openAssignPCModal(${e.exam_id})" class="btn-edit" style="background-color: #4F46E5; color: white;" title="Assign Center PCs">PCs</button>` : ''}
                        <button onclick="deleteExam(${e.exam_id})" class="btn-delete" title="Delete Exam">Delete</button>
                    ` : `
                        <button onclick="goToExamResults('${e.exam_name.replace(/'/g, "\\'")}')" class="btn-edit" style="background-color:#6f42c1; color:white;">Results</button>
                        <button onclick="deleteExam(${e.exam_id})" class="btn-delete" title="Delete Exam">Delete</button>
                    `}
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center;">Error: ${error.message}</td></tr>`;
    }
}

async function editExam(examId) {
    try {
        // Ensure subject/section map is loaded before proceeding
        await subjectsDataPromise;
        const exam = await apiRequest(`/teacher/exams/${examId}`);
        
        document.getElementById('exam_id_hidden').value = exam.exam_id;
        document.getElementById('exam-name').value = exam.exam_name;
        document.getElementById('exam-subject').value = exam.subject_id;
        
        // Trigger change to load sections
        const event = new Event('change');
        document.getElementById('exam-subject').dispatchEvent(event);

        document.getElementById('exam-duration').value = exam.duration;
        document.getElementById('exam-total-marks').value = exam.total_marks;
        
        let formattedDate = exam.date.replace(" ", "T");
        if (formattedDate.length > 16) formattedDate = formattedDate.substring(0, 16);
        document.getElementById('exam-date').value = formattedDate;

        // Select sections. The change event above should have populated the dropdown.
        const sectionSelect = document.getElementById('exam-section');
        Array.from(sectionSelect.options).forEach(opt => {
            if (exam.section_ids.includes(parseInt(opt.value))) {
                opt.selected = true;
            }
        });

        document.getElementById('exam-mode').value = exam.mode || 'ONLINE';
        toggleExamMode();
        if (exam.mode === 'CENTER') {
            const lab = labHierarchy.find(l => l.lab_id == exam.lab_id);
            if (lab) {
                document.getElementById('exam-block').value = lab.block_id;
                handleBlockChange();
                document.getElementById('exam-floor').value = lab.floor_id;
                handleFloorChange();
                document.getElementById('exam-lab').value = exam.lab_id;
            }
            
            document.getElementById('exam-password').value = exam.password_hash || '';
        }

        document.getElementById('create-exam-btn').textContent = 'Update Exam';
        document.getElementById('cancel-exam-edit-btn').style.display = 'inline-block';
        
        document.getElementById('create-exam-section').scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        alert("Error loading exam: " + error.message);
    }
}

// --- Add Questions ---
async function loadExamsForQuestions() {
    const select = document.getElementById('question-exam');
    if (!select) return;
    select.innerHTML = '<option value="">Loading...</option>';
    
    try {
        const exams = await apiRequest('/teacher/exams');
        select.innerHTML = '<option value="">Select Exam</option>';
        exams.forEach(e => {
            if (e.status !== 'completed') {
                select.appendChild(new Option(e.exam_name, e.exam_id));
            }
        });
    } catch (error) {
        console.error("Failed to load exams", error);
    }
}

async function handleAddQuestion(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    
    const payload = {
        exam_id: parseInt(formData.get('exam_id')),
        question_text: formData.get('question_text'),
        marks: parseFloat(formData.get('marks')),
        options: []
    };

    const correctIndex = parseInt(formData.get('correct_option'));
    for (let i = 0; i < 4; i++) {
        const text = formData.get(`option_${i}`);
        if (text) {
            payload.options.push({
                text: text,
                is_correct: (i === correctIndex)
            });
        }
    }

    const questionId = formData.get('question_id');
    const method = questionId ? 'PUT' : 'POST';
    const url = questionId ? `/teacher/questions/${questionId}` : '/teacher/exams/add-question';

    try {
        const result = await apiRequest(url, method, payload);
        alert(result.message);
        resetQuestionForm();
        loadExamQuestions(payload.exam_id); // Refresh list
    } catch (error) {
        alert("Error: " + error.message);
    }
}

async function loadExamQuestions(examId) {
    const container = document.getElementById('questions-list-container');
    if (!container) return;

    if (!examId) {
        container.style.display = 'none';
        return;
    }

    const tbody = document.querySelector('#questions-table tbody');
    const summary = document.getElementById('marks-summary');
    
    container.style.display = 'block';
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>';

    try {
        const data = await apiRequest(`/teacher/exams/${examId}/questions`) || {};

        if (typeof data.exam_total_marks === 'undefined' || typeof data.total_marks_used === 'undefined') {
            throw new Error("Incomplete marks data from server.");
        }

        const remaining = data.exam_total_marks - data.total_marks_used;
        summary.innerHTML = `Allocated: ${data.total_marks_used} / ${data.exam_total_marks} | <span style="color: ${remaining < 0 ? '#e53e3e' : '#28a745'}">Remaining: ${remaining.toFixed(2)}</span>`;
        if (remaining < 0) {
            summary.style.borderColor = '#e53e3e';
            summary.style.backgroundColor = '#fee2e2';
        } else {
            summary.style.borderColor = '#bee3f8';
            summary.style.backgroundColor = '#ebf8ff';
        }
        
        if (!data.questions || data.questions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No questions added yet.</td></tr>';
            return;
        }

        tbody.innerHTML = data.questions.map(q => `
            <tr>
                <td>${q.question_text}</td>
                <td>${q.correct_option}</td>
                <td>${q.marks}</td>
                <td>
                    <button onclick="editQuestion(${q.question_id})" class="btn-edit">Edit</button>
                    <button onclick="deleteQuestion(${q.question_id})" class="btn-delete">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">Error loading questions.</td></tr>';
        summary.innerHTML = 'Could not load marks summary.';
    }
}

function resetQuestionForm() {
    const form = document.getElementById('questions-section').querySelector('form');
    const examId = document.getElementById('question-exam').value; // Keep selected exam
    form.reset();
    document.getElementById('question-exam').value = examId;
    document.getElementById('question_id_hidden_q').value = '';
    document.getElementById('add-update-question-btn').textContent = 'Add Question';
    document.getElementById('cancel-question-edit-btn').style.display = 'none';
}

async function editQuestion(id) {
    try {
        const q = await apiRequest(`/teacher/questions/${id}`);
        document.getElementById('question_id_hidden_q').value = q.question_id;
        document.getElementById('question-exam').value = q.exam_id;
        document.getElementById('question-text').value = q.question_text;
        document.getElementById('question-marks').value = q.marks;
        
        q.options.forEach((opt, index) => {
            if (index < 4) {
                document.getElementsByName(`option_${index}`)[0].value = opt.option_text;
                if (opt.is_correct) {
                    document.querySelector(`input[name="correct_option"][value="${index}"]`).checked = true;
                }
            }
        });

        document.getElementById('add-update-question-btn').textContent = 'Update Question';
        document.getElementById('cancel-question-edit-btn').style.display = 'inline-block';
        document.getElementById('questions-section').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        alert("Error loading question: " + error.message);
    }
}

async function deleteQuestion(id) {
    if (!confirm("Delete this question?")) return;
    try {
        await apiRequest(`/teacher/questions/${id}`, 'DELETE');
        const examId = document.getElementById('question-exam').value;
        loadExamQuestions(examId);
    } catch (error) {
        alert("Error: " + error.message);
    }
}

// --- My Exams & Results ---
async function loadMyExams() {
    const tbody = document.querySelector('#my-exams-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading...</td></tr>';

    const subjectId = document.getElementById('exam-filter-subject').value;
    const status = document.getElementById('exam-filter-status').value;
    const search = document.getElementById('exam-filter-search').value;

    try {
        const queryParams = new URLSearchParams();
        if (subjectId) queryParams.append('subject_id', subjectId);
        if (status) queryParams.append('status', status);
        if (search) queryParams.append('search', search);
        if (showingArchived) queryParams.append('archived', 'true');

        const exams = await apiRequest(`/teacher/exams?${queryParams.toString()}`);
        
        if (exams.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No exams found.</td></tr>';
            return;
        }

        tbody.innerHTML = exams.map(e => `
            <tr>
                <td><strong>${e.exam_name}</strong></td>
                <td>${e.subject_name}</td>
                <td>${e.total_marks}</td>
                <td>${e.sections}</td>
                <td>${new Date(e.date).toLocaleString()}</td>
                <td><span class="status-badge ${e.status}" style="text-transform: capitalize;">${e.status}</span></td>
                <td class="question-actions">
                    ${showingArchived ? `
                        <button onclick="restoreExam(${e.exam_id})" class="btn-edit" style="background-color: #3182ce; color: white;">Restore</button>
                    ` : e.status === 'scheduled' ? `
                        <button onclick="editMyExam(${e.exam_id})" class="btn-edit" title="Edit Exam">Edit</button>
                        <button onclick="publishExam(${e.exam_id})" class="btn-edit" style="background-color:#17a2b8; color:white;" title="Publish Exam">Publish</button>
                        <button onclick="goToAddQuestions(${e.exam_id})" class="btn-edit" style="background-color: #28a745; color: white;" title="Add/View Questions">+Q</button>
                        ${e.mode === 'CENTER' ? `<button onclick="openAssignPCModal(${e.exam_id})" class="btn-edit" style="background-color: #4F46E5; color: white;" title="Assign Center PCs">PCs</button>` : ''}
                        <button onclick="deleteExam(${e.exam_id})" class="btn-delete" title="Delete Exam">Delete</button>
                    ` : e.status === 'active' ? `
                        <button onclick="monitorExam(${e.exam_id})" class="btn-edit" style="background-color:#2b6cb0; color:white;">Monitor</button>
                        <button onclick="goToExamResults('${e.exam_name.replace(/'/g, "\\'")}')" class="btn-edit" style="background-color:#6f42c1; color:white;">View Results</button>
                        ${e.mode === 'CENTER' ? `<button onclick="openAssignPCModal(${e.exam_id})" class="btn-edit" style="background-color: #4F46E5; color: white;" title="Assign Center PCs">PCs</button>` : ''}
                        <button onclick="deleteExam(${e.exam_id})" class="btn-delete" title="Delete Exam">Delete</button>
                    ` : `
                        <button onclick="goToExamResults('${e.exam_name.replace(/'/g, "\\'")}')" class="btn-edit" style="background-color:#6f42c1; color:white;">View Results</button>
                        <button onclick="deleteExam(${e.exam_id})" class="btn-delete" title="Delete Exam">Delete</button>
                        <button onclick="openReExamModal(${e.exam_id}, ${e.duration})" class="btn-edit" style="background-color: #ed8936; color: white;">Re-Exam</button>
                    `}
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="7" style="color:red; text-align:center;">Error: ${error.message}</td></tr>`;
    }
}

async function publishExam(id) {
    if (!confirm("Publish this exam? Students will be able to see it.")) return;
    try {
        const res = await apiRequest(`/teacher/exams/${id}/publish`, 'POST');
        alert(res.message);
        loadMyExams();
        loadExistingExams();
        loadDashboardStats();
    } catch (error) {
        alert("Error: " + error.message);
    }
}

function goToExamResults(examName) {
    const searchInput = document.getElementById('result-filter-search');
    if (searchInput) {
        searchInput.value = examName;
    }
    showSection('results');
}

// --- Real-Time Monitoring ---
let monitorInterval = null;

async function monitorExam(examId) {
    showSection('monitor');
    if (monitorInterval) clearInterval(monitorInterval);
    
    await loadExamMonitor(examId);
    monitorInterval = setInterval(() => loadExamMonitor(examId), 30000); // Refresh every 30s
}

async function loadExamMonitor(examId) {
    const container = document.getElementById('monitor-stats-cards');
    const tbody = document.getElementById('monitor-students-body');
    
    try {
        const data = await apiRequest(`/teacher/exams/${examId}/monitor`);
        document.getElementById('monitor-exam-name').textContent = data.exam_name;

        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${data.stats.assigned}</div>
                <div class="stat-label">Assigned</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color:#2b6cb0;">${data.stats.started}</div>
                <div class="stat-label">Started</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color:#28a745;">${data.stats.submitted}</div>
                <div class="stat-label">Submitted</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color:#e53e3e;">${data.stats.assigned - data.stats.started}</div>
                <div class="stat-label">Remaining</div>
            </div>
        `;

        tbody.innerHTML = data.students.map(s => `
            <tr>
                <td><strong>${s.name}</strong></td>
                <td>${s.usn}</td>
                <td><span class="status-badge ${s.status === 'IN_PROGRESS' ? 'active' : s.status === 'COMPLETED' ? 'completed' : 'scheduled'}">${s.status.replace('_', ' ')}</span></td>
                <td><span style="color:${s.violations > 0 ? '#dc3545' : '#28a745'}; font-weight:bold;">${s.violations}</span></td>
            </tr>
        `).join('');

    } catch (error) {
        console.error("Monitor error", error);
    }
}

// --- Exam Analytics ---
async function viewExamAnalytics(examId) {
    showSection('analytics');
    if (monitorInterval) clearInterval(monitorInterval);
    
    try {
        const data = await apiRequest(`/teacher/exams/${examId}/analytics`);
        document.getElementById('analytics-exam-name').textContent = data.exam_name;

        renderScoreDistChart(data.distribution);
        renderPassFailChart(data.pass_fail);
        renderQuestionDifficulty(data.question_stats);

    } catch (error) {
        console.error("Analytics error", error);
        alert("Failed to load analytics");
    }
}

let scoreChart = null;
function renderScoreDistChart(dist) {
    const ctx = document.getElementById('scoreDistChart');
    if (!ctx) return;
    if (scoreChart) scoreChart.destroy();

    scoreChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(dist),
            datasets: [{
                label: 'Students',
                data: Object.values(dist),
                backgroundColor: '#3182ce'
            }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
}

let passFailChart = null;
function renderPassFailChart(data) {
    const ctx = document.getElementById('passFailChart');
    if (!ctx) return;
    if (passFailChart) passFailChart.destroy();

    passFailChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Pass', 'Fail'],
            datasets: [{
                data: [data.pass, data.fail],
                backgroundColor: ['#48bb78', '#f56565']
            }]
        },
        options: { responsive: true }
    });
}

function renderQuestionDifficulty(questions) {
    const container = document.getElementById('question-difficulty-container');
    if (!container) return;

    if (questions.length === 0) {
        container.innerHTML = '<p>No questions found.</p>';
        return;
    }

    container.innerHTML = questions.map((q, index) => {
        let color = '#48bb78'; // Green (Easy)
        if (q.correct_percentage < 50) color = '#f56565'; // Red (Hard)
        else if (q.correct_percentage < 75) color = '#ecc94b'; // Yellow (Medium)

        return `
            <div style="margin-bottom: 15px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span style="font-weight:600; font-size:0.9rem;">Q${index + 1}: ${q.text.substring(0, 60)}${q.text.length > 60 ? '...' : ''}</span>
                    <span style="font-weight:bold; color:${color};">${q.correct_percentage}% Correct</span>
                </div>
                <div style="background:#edf2f7; height:8px; border-radius:4px; overflow:hidden;">
                    <div style="width:${q.correct_percentage}%; background:${color}; height:100%;"></div>
                </div>
            </div>
        `;
    }).join('');
}

async function goToAddQuestions(examId) {
    await showSection('questions');
    resetQuestionForm();
    const select = document.getElementById('question-exam');
    if (select) {
        select.value = examId;
        select.dispatchEvent(new Event('change'));
    }
}

async function editMyExam(examId) {
    showSection('create-exam');
    await editExam(examId);
}

async function deleteExam(examId) {
    if (!confirm("Are you sure you want to delete this exam and all its questions? This action cannot be undone.")) return;
    try {
        const result = await apiRequest(`/teacher/exams/${examId}`, 'DELETE');
        alert(result.message);
        loadMyExams();
    } catch (error) {
        alert("Error: " + error.message);
    }
}

async function restoreExam(examId) {
    if (!confirm("Restore this exam? It will appear in your active list.")) return;
    try {
        const result = await apiRequest(`/teacher/exams/${examId}/restore`, 'PUT');
        alert(result.message);
        loadMyExams();
    } catch (error) {
        alert("Error: " + error.message);
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
    
    // Load students for this exam (from results)
    const studentSelect = document.getElementById('re-exam-students');
    studentSelect.innerHTML = '<option>Loading...</option>';
    
    try {
        const results = await apiRequest(`/teacher/exams/${examId}/attempts`);
        studentSelect.innerHTML = '';
        if(results.length === 0) {
             studentSelect.innerHTML = '<option disabled value="">No students found in results yet.</option>';
        } else {
            results.forEach(r => {
                studentSelect.appendChild(new Option(`${r.student_name} (${r.usn}) - ${r.result_status || 'Absent'}`, r.student_id));
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
    const submitBtn = document.querySelector('#re-exam-modal button[onclick="submitReExam()"]');
    
    // 1. Validate Date
    if (!dateInput.value) return alert("Please select a date and time for the re-exam.");
    if (new Date(dateInput.value) < new Date()) return alert("Cannot schedule a re-exam in the past.");

    // 2. Validate Duration
    const duration = parseInt(durationInput.value);
    if (isNaN(duration) || duration < 5 || duration > 180) {
        return alert("Please enter a valid duration between 5 and 180 minutes.");
    }
    
    const payload = { exam_date: dateInput.value, duration: duration };
    let url = `/teacher/exams/${examId}/re-exam/class`;

    // 3. Validate Students
    if (type === 'students') {
        const studentSelect = document.getElementById('re-exam-students');
        const students = Array.from(studentSelect.selectedOptions).map(o => parseInt(o.value)).filter(val => !isNaN(val));
        
        if (students.length === 0) {
            return alert("You selected 'Specific Students' but haven't chosen any. Please select at least one student.");
        }
        payload.student_ids = students;
        url = `/teacher/exams/${examId}/re-exam/students`;
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
        loadMyExams();
    } catch (e) { 
        alert("Error: " + e.message); 
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Schedule Re-Exam';
        }
    }
}

async function loadTeacherResults() {
    const tbody = document.getElementById('teacher-results-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading...</td></tr>';
    
    // Add filters logic here if needed based on HTML IDs
    try {
        const results = await apiRequest('/teacher/results');
        currentResultsData = results;
        if (results.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No results found.</td></tr>';
            return;
        }
        tbody.innerHTML = results.map(r => `
            <tr>
                <td>${r.usn}</td>
                <td>${r.student_name}</td>
                <td>${r.section_name} (Sem ${r.semester})</td>
                <td>${r.exam_name}</td>
                <td>${r.subject_name}</td>
                <td>${r.obtained_marks} / ${r.max_marks}</td>
                <td>${((r.obtained_marks/r.max_marks)*100).toFixed(1)}%</td>
                <td>${r.result_status}</td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="8" style="color:red; text-align:center;">Error: ${error.message}</td></tr>`;
    }
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

    const tableColumn = ["USN", "Name", "Section", "Exam", "Subject", "Score", "Status"];
    const tableRows = currentResultsData.map(r => [
        r.usn,
        r.student_name,
        `${r.section_name} (Sem ${r.semester})`,
        r.exam_name,
        r.subject_name,
        `${r.obtained_marks} / ${r.max_marks}`,
        r.result_status
    ]);

    doc.autoTable({ head: [tableColumn], body: tableRows, startY: 30 });
    doc.save("teacher_exam_results.pdf");
}

async function loadAssignedSubjects() {
    const tbody = document.getElementById('subjects-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Loading...</td></tr>';
    try {
        const subjects = await apiRequest('/teacher/subjects');
        if (subjects.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No subjects assigned.</td></tr>';
            return;
        }
        tbody.innerHTML = subjects.map(s => `
            <tr>
                <td><strong>${s.subject_name}</strong></td>
                <td>${s.section_name} (${s.batch_year}, Sem ${s.semester}) - ${s.student_count} student(s)</td>
                <td><button class="btn-edit" onclick="viewSectionStudents(${s.section_id})">View Students</button></td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="3" style="color:red; text-align:center;">Error: ${error.message}</td></tr>`;
    }
}

async function loadAssignedSections() {
    const tbody = document.getElementById('sections-table-body');
    const summary = document.getElementById('sections-summary');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>';
    if (summary) summary.textContent = 'Loading stats...';
    
    try {
        const sections = await apiRequest('/teacher/sections');
        
        if (summary) {
            const totalSections = sections.length;
            const totalStudents = sections.reduce((sum, sec) => sum + (sec.student_count || 0), 0);
            summary.innerHTML = `You are currently assigned to <strong>${totalSections}</strong> section(s) with a total of <strong>${totalStudents}</strong> student(s).`;
        }

        if (sections.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No sections assigned.</td></tr>';
            return;
        }
        tbody.innerHTML = sections.map(s => `
            <tr>
                <td><strong>${s.section_name}</strong></td>
                <td>${s.semester}</td>
                <td>${s.student_count} student(s)</td>
                <td><button class="btn-edit" onclick="viewSectionStudents(${s.section_id})">View Students</button></td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="4" style="color:red; text-align:center;">Error: ${error.message}</td></tr>`;
    }
}

async function viewSectionStudents(sectionId) {
    const modal = document.getElementById('section-students-modal');
    const tbody = document.querySelector('#section-students-table tbody');
    if (!modal || !tbody) return;

    modal.style.display = 'block';
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Loading...</td></tr>';

    try {
        const students = await apiRequest(`/teacher/sections/${sectionId}/students`);
        if (students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No students in this section.</td></tr>';
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
        tbody.innerHTML = `<tr><td colspan="3" style="color:red; text-align:center;">Error: ${error.message}</td></tr>`;
    }
}

async function loadTeacherActivityLogs(page = 1) {
    const tbody = document.getElementById('teacher-activity-logs-body');
    const paginationContainer = document.getElementById('teacher-activity-logs-pagination');
    if (!tbody) return;
    
    const startDate = document.getElementById('activity-log-start-date').value;
    const endDate = document.getElementById('activity-log-end-date').value;
    const examFilter = document.getElementById('activity-log-exam-filter').value;
    const sectionFilter = document.getElementById('activity-log-section-filter').value;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';
    try {
        const queryParams = new URLSearchParams({ page, limit: 15 });
        if (startDate) queryParams.append('start_date', startDate);
        if (endDate) queryParams.append('end_date', endDate);
        if (examFilter) queryParams.append('exam_id', examFilter);
        if (sectionFilter) queryParams.append('section_id', sectionFilter);

        const data = await apiRequest(`/teacher/activity-logs?${queryParams.toString()}`);
        
        const logs = data.logs || data;
        const totalPages = data.total_pages || 1;
        
        currentLogsData = logs;
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No logs found.</td></tr>';
            if (paginationContainer) paginationContainer.innerHTML = '';
            return;
        }
        
        tbody.innerHTML = logs.map(l => `
            <tr>
                <td>${new Date(l.created_at).toLocaleString()}</td>
                <td>${l.action}</td>
                <td>${l.student_name || '-'}</td>
                <td>${l.exam_name || '-'}</td>
                <td>${l.section_name ? `${l.section_name} (Sem ${l.semester})` : (l.exam_sections || '-')}</td>
                <td>${l.ip_address || '-'}</td>
            </tr>
        `).join('');

        if (paginationContainer) {
            let paginationHtml = '';
            if (totalPages > 1) {
                paginationHtml += `<button type="button" onclick="loadTeacherActivityLogs(${page - 1})" ${page === 1 ? 'disabled' : ''}>&laquo;</button>`;
                for (let i = 1; i <= totalPages; i++) {
                    paginationHtml += `<button type="button" onclick="loadTeacherActivityLogs(${i})" class="${i === page ? 'active' : ''}">${i}</button>`;
                }
                paginationHtml += `<button type="button" onclick="loadTeacherActivityLogs(${page + 1})" ${page === totalPages ? 'disabled' : ''}>&raquo;</button>`;
            }
            paginationContainer.innerHTML = paginationHtml;
        }
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" style="color:red; text-align:center;">Error: ${error.message}</td></tr>`;
    }
}

function exportLogsCSV() {
    if (!currentLogsData || currentLogsData.length === 0) {
        alert("No logs to export");
        return;
    }
    const headers = ["Timestamp", "Action", "Student", "Exam", "Section", "IP Address"];
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(",")].concat(currentLogsData.map(l => 
        `"${new Date(l.created_at).toLocaleString()}","${l.action}","${l.student_name || ''}","${l.exam_name || ''}","${l.section_name || ''}","${l.ip_address || ''}"`
    )).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "teacher_activity_logs.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- Violation Analytics ---
async function loadTeacherViolationAnalytics() {
    const container = document.getElementById('teacher-violation-summary-cards');
    container.innerHTML = '<div class="spinner"></div>';
    const status = document.getElementById('teacher-violation-filter-status').value;
    const examSearch = document.getElementById('teacher-violation-filter-exam').value;
    const type = document.getElementById('teacher-violation-filter-type').value;
    loadViolationHistory();
    
    try {
        let url = '/teacher/violations/stats';
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
        `;

        // Rename table heading dynamically back to Recent
        document.querySelectorAll('h2, h3').forEach(h => {
            if (h.textContent.includes('Pending Violations')) h.textContent = 'Recent Violations';
        });

        // 2. Recent Violations Table
        const recentBody = document.getElementById('teacher-recent-violations-body');
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
    const examSearch = document.getElementById('teacher-violation-filter-exam').value;
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

        const data = await apiRequest(`/teacher/violations/history?${queryParams.toString()}`);
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
                                        <td style="width: 25%; padding-left: 40px;"><span style="color:#DC2626;">${v.violation_type}</span></td>
                                        <td style="width: 15%;"><span class="status-badge ${v.review_status === 'Pending' ? 'inactive' : 'active'}">${v.review_status}</span></td>
                                        <td style="width: 20%;">${new Date(v.timestamp).toLocaleString()}</td>
                                        <td style="width: 20%;"><small>${v.remarks || '-'}</small></td>
                                        <td style="width: 20%; text-align: right; padding-right: 20px;"><button class="btn-edit" onclick="viewEvidence(${v.violation_id})" style="background-color: #3182ce; color: white; padding: 4px 8px; border-radius: 6px; font-weight: 500; border: none;">View Evidence</button></td>
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

let currentViolationId = null;

async function viewEvidence(id) {
    currentViolationId = id;
    const modal = document.getElementById('evidence-modal');
    const content = document.getElementById('evidence-content');
    
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    document.body.style.overflow = 'hidden'; // Prevent background scroll for better focus

    // Style the modal content box to be wider and scrollable
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
        const v = await apiRequest(`/teacher/violations/${id}`);

        const getStatusBadge = (status) => {
            let color, bgColor;
            switch (status) {
                case 'Resolved':
                    color = '#16A34A'; bgColor = '#DCFCE7'; break; // Green
                case 'Dismissed':
                    color = '#64748B'; bgColor = '#F1F5F9'; break; // Grey
                case 'Pending':
                case 'Under Review':
                default:
                    color = '#B45309'; bgColor = '#FEF3C7'; break; // Amber/Yellow
            }
            return `<span style="color: ${color}; background-color: ${bgColor}; padding: 4px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${status}</span>`;
        };

        let contentHtml = `
            <!-- Details Grid -->
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px 24px; margin-bottom: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 24px;">
                <div>
                    <label style="font-size: 0.8rem; color: #6b7280; display: block; margin-bottom: 4px;">Student</label>
                    <div style="font-weight: 600; color: #111827;">${v.student_name} (${v.usn})</div>
                </div>
                <div>
                    <label style="font-size: 0.8rem; color: #6b7280; display: block; margin-bottom: 4px;">Exam</label>
                    <div style="font-weight: 600; color: #111827;">${v.exam_name}</div>
                </div>
                <div>
                    <label style="font-size: 0.8rem; color: #6b7280; display: block; margin-bottom: 4px;">Violation Type</label>
                    <div><span style="color: #991B1B; background-color: #FEE2E2; padding: 4px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${v.violation_type}</span></div>
                </div>
                <div>
                    <label style="font-size: 0.8rem; color: #6b7280; display: block; margin-bottom: 4px;">Status</label>
                    <div>${getStatusBadge(v.review_status)}</div>
                </div>
                <div>
                    <label style="font-size: 0.8rem; color: #6b7280; display: block; margin-bottom: 4px;">Time</label>
                    <div style="font-size: 0.9rem; color: #374151;">${new Date(v.timestamp).toLocaleString()}</div>
                </div>
                <div>
                    <label style="font-size: 0.8rem; color: #6b7280; display: block; margin-bottom: 4px;">Confidence</label>
                    <div style="font-size: 0.9rem; color: #374151;">${v.confidence_score || 'N/A'}</div>
                </div>
            </div>

            <!-- Related Question -->
            ${v.question_text ? `
                <div style="margin-bottom: 24px;">
                    <h4 style="font-size: 1rem; font-weight: 600; color: #1f2937; margin-top: 0; margin-bottom: 8px;">Related Question</h4>
                    <p style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 12px; border-radius: 6px; margin: 0; font-size: 0.9rem; color: #374151;">${v.question_text}</p>
                </div>
            ` : ''}

            <!-- Evidence Section -->
            <div style="margin-bottom: 24px;">
                <h4 style="font-size: 1rem; font-weight: 600; color: #1f2937; margin-top: 0; margin-bottom: 12px;">Evidence</h4>
                ${v.evidence && v.evidence.length > 0 ? 
                    v.evidence.map(e => `
                        <div style="border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 16px; overflow: hidden;">
                            <div style="background-color: #f9fafb; padding: 8px 12px; font-size: 0.8rem; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Captured: ${new Date(e.captured_time).toLocaleTimeString()}</div>
                            <div style="display: flex; gap: 16px; padding: 16px; flex-wrap: wrap; justify-content: center;">
                                ${(e.screenshot_path || e.camera_image_path) ? `
                                    <div style="flex: 1; text-align: center;">
                                        <img src="${e.screenshot_path || e.camera_image_path}" onclick="openFullScreenImage(this.src)" style="max-width: 100%; height: auto; border-radius: 6px; border: 1px solid #d1d5db; cursor: pointer;" alt="Evidence Screenshot">
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `).join('') 
                    : `
                    <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px;">
                        <i class="fas fa-image" style="font-size: 1.75rem; color: #9ca3af;"></i>
                        <span style="font-size: 0.9rem; color: #4b5563;">No visual evidence was captured for this violation.</span>
                    </div>
                    `
                }
            </div>

            <!-- Remarks -->
            ${v.remarks ? `
                <div style="margin-bottom: 24px;">
                    <h4 style="font-size: 1rem; font-weight: 600; color: #1f2937; margin-top: 0; margin-bottom: 8px;">Previous Remarks</h4>
                    <p style="background-color: #FEFCE8; border: 1px solid #FDE68A; padding: 12px; border-radius: 6px; margin: 0; font-size: 0.9rem; color: #713F12;">${v.remarks}</p>
                </div>
            ` : ''}
        `;

        // Conditionally add action buttons
        if (v.review_status !== 'Pending' && v.review_status !== 'Under Review') {
            // No actions needed
        } else {
            contentHtml += `
                <div style="border-top: 1px solid #e5e7eb; padding: 16px 24px; background-color: #f9fafb; margin: 24px -24px -24px -24px; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                    <label for="dynamic-violation-remarks" style="font-size: 0.9rem; font-weight: 600; color: #374151; display: block; margin-bottom: 8px;">Add Remarks & Resolve</label>
                    <textarea id="dynamic-violation-remarks" placeholder="Add optional remarks to justify your decision..." style="width: 100%; min-height: 60px; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.9rem; margin-bottom: 12px; box-sizing: border-box; resize: vertical;"></textarea>
                    <div style="display: flex; justify-content: flex-end; gap: 12px;">
                        <button onclick="resolveViolation('Dismissed')" style="background-color: #6b7280; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.9rem;">Dismiss</button>
                        <button onclick="resolveViolation('Resolved')" style="background-color: #16A34A; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.9rem;">Confirm Violation</button>
                    </div>
                </div>
            `;
        }

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
        await apiRequest(`/teacher/violations/${currentViolationId}/resolve`, 'PUT', { status, remarks });
        alert(`Violation marked as ${status}`);
        closeEvidenceModal();
        loadTeacherViolationAnalytics(); // Refresh list
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

function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector("i");
    if (input && input.type === "password") {
        input.type = "text";
        if (icon) {
            icon.classList.remove("fa-eye");
            icon.classList.add("fa-eye-slash");
        }
    } else if (input) {
        input.type = "password";
        if (icon) {
            icon.classList.remove("fa-eye-slash");
            icon.classList.add("fa-eye");
        }
    }
}