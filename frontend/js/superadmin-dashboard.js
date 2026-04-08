document.addEventListener("DOMContentLoaded", () => {
    requireAuth("super_admin");
    loadUserProfile();
    showSection('dashboard');

    // Department create form
    const deptForm = document.getElementById('department-form');
    if (deptForm) deptForm.addEventListener('submit', handleSaveDepartment);

    const createDeptForm = document.getElementById('create-department-form');
    if (createDeptForm) createDeptForm.addEventListener('submit', handleSaveDepartment);

    const editDeptForm = document.getElementById('department-edit-form');
    if (editDeptForm) editDeptForm.addEventListener('submit', handleSaveDepartment);

    // Admin form
    const adminForm = document.getElementById('admin-form');
    if (adminForm) adminForm.addEventListener('submit', handleSaveAdmin);

    // Replace admin
    const replaceAdminForm = document.getElementById('replace-admin-form');
    if (replaceAdminForm) replaceAdminForm.addEventListener('submit', handleReplaceAdmin);

    // Violations search filter (Debounced)
    const examSearchInput = document.getElementById('sa-violation-filter-exam');
    if (examSearchInput) {
        let debounceTimer;
        examSearchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                loadViolationAnalytics();
                loadViolationHistory();
            }, 500);
        });
    }
});

function loadUserProfile() {
    const profile = JSON.parse(localStorage.getItem('userProfile'));
    if (profile) {
        const navUser = document.getElementById('nav-user');
        const navDesig = document.getElementById('nav-designation');
        if (navUser) navUser.textContent = profile.name;
        if (navDesig) navDesig.textContent = profile.designation;
    }
}

let navHistory = [];
let isNavigatingBack = false;
let currentLogsData = [];

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

    document.querySelectorAll('.form-container').forEach(div => {
        div.classList.remove('active');
    });
    document.querySelectorAll('.sidebar button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const sectionEl = document.getElementById(`${sectionName}-section`);
    if (sectionEl) sectionEl.classList.add('active');
    
    const btn = document.querySelector(`.sidebar button[data-section="${sectionName}"]`);
    if (btn) btn.classList.add('active');

    updateBreadcrumb(sectionName);

    // Load data for the section
    if (sectionName === 'dashboard') loadDashboardStats();
    if (sectionName === 'departments') loadDepartments();
    if (sectionName === 'admins') loadAdmins();
    if (sectionName === 'teachers') { loadAllTeachers(); loadDepartmentsForTeacherFilter(); }
    if (sectionName === 'students') { loadStudentStats(); loadAllStudents(); loadDepartmentsForStudentFilter(); }
    if (sectionName === 'violations') {
    loadViolationAnalytics();
    loadViolationHistory();
}

if (sectionName === 'exams') {
    loadAllExams();
    loadDepartmentsForExamFilter();
}
    if (sectionName === 'infrastructure') loadInfrastructureData();
    if (sectionName === 'admins') loadDepartmentsForDropdown();
    if (sectionName === 'logs') loadSystemLogs();
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
        'departments': 'Departments',
        'admins': 'Admins',
        'teachers': 'Teachers',
        'students': 'Students',
        'violations': 'Violations',
        'exams': 'Exams',
        'infrastructure': 'Infrastructure',
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

async function loadDashboardStats() {
    const container = document.getElementById('sa-stats-container');
    const alertsContainer = document.getElementById('sa-alerts-container');
    
    if (!container) return; // Prevent crash if container is missing
    
    container.innerHTML = '<div class="spinner"></div>';
    checkSystemHealth(); // Check health when loading dashboard
    try {
        const stats = await apiRequest('/superadmin/dashboard/stats');
        
        // Render Alerts
        if (alertsContainer) {
            if (stats.alerts && stats.alerts.length > 0) {
                alertsContainer.innerHTML = stats.alerts.map(a => `
                    <div class="alert-box ${a.type}" style="background-color: #fff3cd; color: #856404; padding: 12px; margin-bottom: 10px; border: 1px solid #ffeeba; border-radius: 6px; display: flex; align-items: center;">
                        <i class="fas fa-exclamation-triangle" style="margin-right: 10px;"></i>
                        <span>${a.message}</span>
                    </div>
                `).join('');
            } else {
                alertsContainer.innerHTML = '';
            }
        }

        container.innerHTML = `
            <div class="sa-stat-card" onclick="showSection('departments')">
                <div class="icon departments"><i class="fas fa-building"></i></div>
                <div class="info"><div class="value">${stats.total_departments}</div><div class="label">Departments</div></div>
            </div>
            <div class="sa-stat-card" onclick="showSection('admins')">
                <div class="icon admins"><i class="fas fa-user-shield"></i></div>
                <div class="info"><div class="value">${stats.total_admins}</div><div class="label">Admins</div></div>
            </div>
            <div class="sa-stat-card" onclick="showSection('teachers')">
                <div class="icon active-admins"><i class="fas fa-chalkboard-teacher"></i></div>
                <div class="info"><div class="value">${stats.total_teachers}</div><div class="label">Teachers</div></div>
            </div>
            <div class="sa-stat-card" onclick="showSection('students')">
                <div class="icon" style="background:#F3E8FF; color:#7C3AED;"><i class="fas fa-user-graduate"></i></div>
                <div class="info"><div class="value">${stats.total_students}</div><div class="label">Students</div></div>
            </div>
            <div class="sa-stat-card" onclick="showSection('exams')">
                <div class="icon" style="background:#E0F2FE; color:#0284C7;"><i class="fas fa-file-alt"></i></div>
                <div class="info"><div class="value">${stats.total_exams}</div><div class="label">Exams</div></div>
            </div>
            <div class="sa-stat-card" onclick="showSection('violations')">
                <div class="icon" style="background:#FEE2E2; color:#DC2626;"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="info"><div class="value">${stats.total_violations}</div><div class="label">Violations</div></div>
            </div>
        `;

        // Render Charts
        renderDeptPerformanceChart(stats.dept_stats);
        renderViolationChart(stats.violation_distribution);
        renderTeacherActivityChart(stats.top_teachers);
        renderStudentDistChart(stats.student_performance_dist);

        // Update Students Writing Badge
        const writingBadge = document.getElementById('students-writing-badge');
        if (writingBadge) writingBadge.textContent = `${stats.students_writing || 0} Students Writing`;

        // Update Active Teachers Badge
        const activeTeachersBadge = document.getElementById('active-teachers-badge');
        if (activeTeachersBadge) activeTeachersBadge.textContent = `${stats.active_teachers_today || 0} Active Today`;

        // Render Active Exams
        const activeExamsBody = document.getElementById('active-exams-body');
        if (activeExamsBody) {
            if (stats.active_exams.length === 0) {
                activeExamsBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">No active exams currently.</td></tr>';
            } else {
                activeExamsBody.innerHTML = stats.active_exams.slice(0, 5).map(e => `
                    <tr>
                        <td><strong>${e.exam_name}</strong></td>
                        <td><span class="dept-badge">${e.department_name}</span></td>
                        <td>${new Date(e.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                        <td>${e.section_count} Sections</td>
                    </tr>
                `).join('');
            }
        }

        // Render Violations
        const violationsList = document.getElementById('recent-violations-list');
        if (violationsList) {
            if (stats.recent_violations.length === 0) {
                violationsList.innerHTML = '<p style="color:#666; text-align:center; padding:10px;">No recent violations.</p>';
            } else {
                violationsList.innerHTML = stats.recent_violations.slice(0, 5).map(v => `
                    <div class="activity-item violation">
                        <div class="act-icon"><i class="fas fa-exclamation-circle"></i></div>
                        <div class="act-content">
                            <strong>${v.student_name}</strong> (${v.department_name})<br>
                            <span style="color:#DC2626;">${v.violation_type}</span> in ${v.exam_name}
                            <div class="act-time">${new Date(v.timestamp).toLocaleString()}</div>
                        </div>
                    </div>
                `).join('');
            }
        }

        // Render Activity Feed
        const activityList = document.getElementById('system-activity-feed');
        if (activityList) {
            if (stats.recent_activity.length === 0) {
                activityList.innerHTML = '<p style="color:#666; text-align:center; padding:10px;">No recent activity.</p>';
            } else {
                activityList.innerHTML = stats.recent_activity.slice(0, 5).map(a => `
                    <div class="activity-item">
                        <div class="act-icon normal"><i class="fas fa-info"></i></div>
                        <div class="act-content">
                            <strong>${a.user_name}</strong> <span class="role-badge" style="font-size:0.7em;">${a.role}</span>
                            ${a.department_name ? `<span style="font-size: 0.75rem; color: #666;">(${a.department_name})</span>` : ''}<br>
                            ${a.action}
                            <div class="act-time">${new Date(a.created_at).toLocaleString()}</div>
                        </div>
                    </div>
                `).join('');
            }
        }

        // Render Department Health
        const healthCard = document.getElementById('dept-health-card');
        if (healthCard) {
            let healthHtml = '<div class="sa-card-header"><h3 class="sa-card-title">Department Health</h3></div><div style="display: flex; flex-direction: column; gap: 10px;">';
            stats.dept_stats.forEach(d => {
                const score = parseFloat(d.avg_score);
                const violations = d.violation_count;
                let status = 'Good';
                let color = '#10B981'; // Green
                let icon = '🟢';

                if (score < 60 || violations > 10) { status = 'Needs Attention'; color = '#F59E0B'; icon = '🟡'; }
                if (score < 40 || violations > 20) { status = 'Critical'; color = '#EF4444'; icon = '🔴'; }
                if (score >= 80 && violations < 5) { status = 'Excellent'; color = '#059669'; icon = '🟢'; }

                healthHtml += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f1f5f9;"><strong>${d.department_name}</strong> <span style="color:${color}; font-weight:600; font-size:0.9rem;">${icon} ${status}</span></div>`;
            });
            healthHtml += '</div>';
            healthCard.innerHTML = healthHtml;
        }

        // Render Teacher Overview Table
        const teacherBody = document.getElementById('teacher-overview-body');
        if (teacherBody) {
            if (stats.top_teachers.length === 0) {
                teacherBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">No teacher activity yet.</td></tr>';
            } else {
                teacherBody.innerHTML = stats.top_teachers.slice(0, 5).map(t => `
                    <tr>
                        <td><strong>${t.name}</strong></td>
                        <td><span class="dept-badge" style="font-size:0.75rem;">${t.department_name}</span></td>
                        <td style="font-size:0.85rem; color:#555;">${t.subjects}</td>
                        <td style="text-align:center;"><strong>${t.exams_created}</strong></td>
                    </tr>
                `).join('');
            }
        }

    } catch (error) {
        container.innerHTML = '<p style="color:red">Failed to load stats.</p>';
        console.error(error);
    }
}

async function checkSystemHealth() {
    const dbEl = document.getElementById('health-db-status');
    const serverEl = document.getElementById('health-server-status');
    if (!dbEl || !serverEl) return;

    try {
        const status = await apiRequest('/superadmin/system/health');
        
        dbEl.innerHTML = `● ${status.database}`;
        dbEl.style.color = status.database === 'Active' ? '#10B981' : '#EF4444';

        serverEl.innerHTML = `● ${status.server}`;
        serverEl.style.color = '#10B981';
    } catch (error) {
        dbEl.innerHTML = `● Unknown`;
        dbEl.style.color = '#EF4444';
        serverEl.innerHTML = `● Offline`;
        serverEl.style.color = '#EF4444';
    }
}

let deptChart = null;
function renderDeptPerformanceChart(data) {
    const ctx = document.getElementById('deptPerformanceChart');
    if (!ctx) return;

    if (deptChart) deptChart.destroy();

    const labels = data.map(d => d.department_name);
    const scores = data.map(d => parseFloat(d.avg_score).toFixed(1));

    deptChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Avg Score (%)',
                    data: scores,
                    backgroundColor: 'rgba(37, 99, 235, 0.7)',
                    borderColor: 'rgba(37, 99, 235, 1)',
                    borderWidth: 1,
                    yAxisID: 'y',
                }
            ]
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: { display: true, text: 'Score (%)' }
                }
            }
        }
    });
}

let vioChart = null;
function renderViolationChart(data) {
    const ctx = document.getElementById('violationChart');
    if (!ctx) return;

    if (vioChart) vioChart.destroy();

    const labels = data.map(d => d.violation_type);
    const counts = data.map(d => d.count);

    // Populate text stats
    const textContainer = document.getElementById('violation-stats-text');
    if (textContainer) {
        textContainer.innerHTML = data.map(d => `<div style="font-size:0.9rem; margin-bottom:5px;"><strong>${d.violation_type}:</strong> ${d.count}</div>`).join('');
    }

    vioChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: counts,
                backgroundColor: ['#EF4444', '#F59E0B', '#3B82F6', '#6366F1'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

let teacherChart = null;
function renderTeacherActivityChart(data) {
    const ctx = document.getElementById('teacherActivityChart');
    if (!ctx) return;

    if (teacherChart) teacherChart.destroy();

    const labels = data.map(t => t.name);
    const counts = data.map(t => t.exams_created);

    teacherChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Exams Created',
                data: counts,
                backgroundColor: 'rgba(79, 70, 229, 0.7)', // Indigo
                borderColor: 'rgba(79, 70, 229, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            indexAxis: 'y', // Horizontal bar chart
            scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
            plugins: { legend: { display: false } }
        }
    });
}

let studentDistChart = null;
function renderStudentDistChart(data) {
    const ctx = document.getElementById('studentDistChart');
    if (!ctx) return;

    if (studentDistChart) studentDistChart.destroy();

    const labels = data.map(d => d.grade_range);
    const counts = data.map(d => d.count);

    studentDistChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Students',
                data: counts,
                backgroundColor: [
                    'rgba(16, 185, 129, 0.8)', // 90-100 Green
                    'rgba(52, 211, 153, 0.8)', // 80-89
                    'rgba(96, 165, 250, 0.8)', // 70-79 Blue
                    'rgba(251, 191, 36, 0.8)', // 60-69 Yellow
                    'rgba(248, 113, 113, 0.8)', // 40-59 Red
                    'rgba(220, 38, 38, 0.8)'   // <40 Dark Red
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } },
            plugins: { legend: { display: false } }
        }
    });
}

async function loadDepartments() {
    const tbody = document.getElementById('departments-table-body');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Loading...</td></tr>';
    try {
        const departments = await apiRequest('/superadmin/departments');
        if (departments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center">No departments found. Create one above.</td></tr>';
            return;
        }
        tbody.innerHTML = departments.map(d => `
            <tr>
                <td><strong>${d.department_name}</strong></td>
                <td>${d.admin_name || '<em style="color:#94A3B8;">Not Assigned</em>'}</td>
                <td>${new Date(d.created_at).toLocaleDateString()}</td>
                <td class="actions">
                    <button class="btn-action" onclick="editDepartment(${d.department_id}, '${d.department_name}')">Edit</button>
                    <button class="btn-action" onclick="confirmDelete('department', ${d.department_id})">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="4" style="color:red;text-align:center">Error: ${error.message}</td></tr>`;
    }
}

async function loadAdmins() {
    const tbody = document.getElementById('admins-table-body');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Loading...</td></tr>';
    try {
        const admins = await apiRequest('/superadmin/admins');
        if (admins.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No admins found.</td></tr>';
            return;
        }
        tbody.innerHTML = admins.map(a => `
            <tr>
                <td><strong>${a.name}</strong></td>
                <td>${a.email}</td>
                <td>${a.department_name || '<span style="color:#999">Unassigned</span>'}</td>
                <td class="actions">
                    <button class="btn-action" onclick="editAdmin(${a.admin_id})">Edit</button>
                    <button class="btn-action" onclick="openReplaceAdminModal(${a.admin_id}, '${a.name}')" style="color: #D97706;">Replace</button>
                    <button class="btn-action" onclick="confirmDelete('admin', ${a.admin_id})" style="color: #DC2626;">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:red;text-align:center">Error: ${error.message}</td></tr>`;
    }
}

function openReplaceAdminModal(id, name) {
    const form = document.getElementById('replace-admin-form');
    form.reset();
    form.querySelector('input[name="current_admin_id"]').value = id;
    document.getElementById('replace-current-name').textContent = name;
    openModal('replace-admin-modal');
}

async function handleSaveDepartment(event) {
    event.preventDefault();
    const form = event.target;
    const name = form.querySelector('input[name="name"]').value;
    const id = form.querySelector('input[name="department_id"]').value;

    try {
        let result;
        if (id) result = await apiRequest(`/superadmin/departments/${id}`, 'PUT', { name });
        else result = await apiRequest('/superadmin/departments', 'POST', { name });
        
        alert(result.message);
        resetDepartmentForm();
        loadDepartments();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function handleSaveAdmin(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    data.department_id = parseInt(data.department_id);
    const adminId = data.admin_id;

    try {
        let result;
        if (adminId) {
            result = await apiRequest(`/superadmin/admins/${adminId}`, 'PUT', data);
        } else {
            result = await apiRequest('/superadmin/admins', 'POST', data);
        }
        alert(result.message);
        resetAdminForm();
        loadAdmins();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function handleReplaceAdmin(event) {
    event.preventDefault();
    if (!confirm("Are you sure you want to replace this admin? This action is irreversible.")) return;

    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    data.current_admin_id = parseInt(data.current_admin_id);

    try {
        const result = await apiRequest('/superadmin/admins/replace', 'POST', data);
        alert(result.message);
        closeModal('replace-admin-modal');
        loadAdmins();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

function confirmDelete(type, id) {
    const modal = document.getElementById('delete-confirm-modal');
    const message = document.getElementById('delete-confirm-message');
    const confirmBtn = document.getElementById('confirm-delete-btn');

    message.textContent = `Are you sure you want to delete this ${type}? This action cannot be undone.`;
    
    confirmBtn.onclick = async () => {
        try {
            const result = await apiRequest(`/superadmin/${type}s/${id}`, 'DELETE');
            alert(result.message);
            closeModal('delete-confirm-modal');
            if (type === 'department') loadDepartments();
            if (type === 'admin') loadAdmins();
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    };

    openModal('delete-confirm-modal');
}

// Modal Handling
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

async function loadDepartmentsForDropdown() {
    const deptSelect = document.getElementById('admin-department');
    if(!deptSelect) return;
    deptSelect.innerHTML = '<option>Loading...</option>';
    try {
        const departments = await apiRequest('/superadmin/departments');
        deptSelect.innerHTML = '<option value="">Select Department</option>';
        departments.forEach(d => {
            deptSelect.appendChild(new Option(d.department_name, d.department_id));
        });
    } catch (error) {
        console.error("Failed to load departments for dropdown", error);
        deptSelect.innerHTML = '<option value="">Error loading departments</option>';
    }
}

function editDepartment(id, name) {
    const form = document.getElementById('department-form');
    form.querySelector('input[name="department_id"]').value = id;
    form.querySelector('input[name="name"]').value = name;
    
    form.querySelector('button[type="submit"]').textContent = "Update Department";
    form.querySelector('.btn-secondary').style.display = "inline-block";
    document.querySelector('#departments-section .sa-card-title').textContent = "Edit Department";
    
    form.scrollIntoView({ behavior: 'smooth' });
}

function resetDepartmentForm() {
    const form = document.getElementById('department-form');
    form.reset();
    form.querySelector('input[name="department_id"]').value = "";
    form.querySelector('button[type="submit"]').textContent = "Create Department";
    form.querySelector('.btn-secondary').style.display = "none";
    document.querySelector('#departments-section .sa-card-title').textContent = "Create New Department";
}

async function editAdmin(adminId) {
    const form = document.getElementById('admin-form');
    resetAdminForm();

    try {
        // Ensure departments are loaded if not already
        if (document.getElementById('admin-department').options.length <= 1) {
            await loadDepartmentsForDropdown();
        }

        // Load admin details
        const admin = await apiRequest(`/superadmin/admins/${adminId}`);
        form.querySelector('input[name="admin_id"]').value = admin.admin_id;
        form.querySelector('input[name="name"]').value = admin.name;
        form.querySelector('input[name="email"]').value = admin.email;
        form.querySelector('select[name="department_id"]').value = admin.department_id;
        
        const pwdInput = form.querySelector('input[name="password"]');
        pwdInput.required = false;
        pwdInput.placeholder = "Leave blank to keep current";

        form.querySelector('button[type="submit"]').textContent = "Update Admin";
        form.querySelector('.btn-secondary').style.display = "inline-block";
        document.querySelector('#admins-section .sa-card-title').textContent = "Edit Admin";
        
        form.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        alert("Error: " + error.message);
    }
}

function resetAdminForm() {
    const form = document.getElementById('admin-form');
    form.reset();
    form.querySelector('input[name="admin_id"]').value = "";
    
    const pwdInput = form.querySelector('input[name="password"]');
    pwdInput.required = true;
    pwdInput.placeholder = "";

    form.querySelector('button[type="submit"]').textContent = "Save Admin";
    form.querySelector('.btn-secondary').style.display = "none";
    document.querySelector('#admins-section .sa-card-title').textContent = "Create New Admin";
}

async function loadDepartmentsForExamFilter() {
    const deptSelect = document.getElementById('exam-filter-dept');
    if (!deptSelect || deptSelect.options.length > 1) return; // Don't reload if already populated
    try {
        const departments = await apiRequest('/superadmin/departments');
        departments.forEach(d => {
            deptSelect.appendChild(new Option(d.department_name, d.department_id));
        });
    } catch (error) {
        console.error("Failed to load departments for exam filter", error);
    }
}

async function loadDepartmentsForTeacherFilter() {
    const deptSelect = document.getElementById('teacher-filter-dept');
    if (!deptSelect || deptSelect.options.length > 1) return;
    try {
        const departments = await apiRequest('/superadmin/departments');
        departments.forEach(d => {
            deptSelect.appendChild(new Option(d.department_name, d.department_id));
        });
    } catch (error) {
        console.error("Failed to load departments for teacher filter", error);
    }
}

async function loadAllTeachers() {
    const tbody = document.getElementById('all-teachers-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';

    const deptId = document.getElementById('teacher-filter-dept').value;
    const search = document.getElementById('teacher-filter-search').value;

    try {
        const queryParams = new URLSearchParams();
        if (deptId) queryParams.append('department_id', deptId);
        if (search) queryParams.append('search', search);

        const teachers = await apiRequest(`/superadmin/teachers?${queryParams.toString()}`);

        if (teachers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No teachers found.</td></tr>';
            return;
        }

        tbody.innerHTML = teachers.map(t => `
            <tr>
                <td><strong>${t.name}</strong></td>
                <td>${t.email}</td>
                <td><span class="dept-badge">${t.department_name}</span></td>
                <td style="text-align:center;">${t.exams_created}</td>
                <td><span class="status-badge ${t.active_status ? 'active' : 'inactive'}">${t.active_status ? 'Active' : 'Inactive'}</span></td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Error loading teachers: ${error.message}</td></tr>`;
    }
}

async function loadStudentStats() {
    const container = document.getElementById('student-stats-container');
    container.innerHTML = '<div class="spinner"></div>';
    try {
        const stats = await apiRequest('/superadmin/students/stats');
        
        container.innerHTML = `
            <div class="sa-stat-card">
                <div class="icon" style="background:#E0F2FE; color:#0284C7;"><i class="fas fa-pen-alt"></i></div>
                <div class="info"><div class="value">${stats.students_in_exams}</div><div class="label">In Exams Now</div></div>
            </div>
            <div class="sa-stat-card">
                <div class="icon" style="background:#F0FDF4; color:#16A34A;"><i class="fas fa-user-check"></i></div>
                <div class="info"><div class="value">${stats.students_logged_in}</div><div class="label">Logged In Today</div></div>
            </div>
            <div class="sa-stat-card">
                <div class="icon" style="background:#F3E8FF; color:#7C3AED;"><i class="fas fa-history"></i></div>
                <div class="info"><div class="value">${stats.attempts_today}</div><div class="label">Attempts Today</div></div>
            </div>
            <div class="sa-stat-card">
                <div class="icon" style="background:#FEE2E2; color:#DC2626;"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="info"><div class="value">${stats.flagged_today}</div><div class="label">Flagged Today</div></div>
            </div>
        `;

        renderStudentCharts(stats.dept_participation);

    } catch (error) {
        container.innerHTML = '<p style="color:red">Failed to load student stats.</p>';
        console.error(error);
    }
}

let studentStrengthChart = null;
let studentParticipationChart = null;

function renderStudentCharts(data) {
    // Dept Strength Chart
    const ctx1 = document.getElementById('deptStrengthChart');
    if (ctx1) {
        if (studentStrengthChart) studentStrengthChart.destroy();
        studentStrengthChart = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: data.map(d => d.department_name),
                datasets: [{
                    label: 'Total Students',
                    data: data.map(d => d.total_students),
                    backgroundColor: '#3B82F6'
                }]
            },
            options: { responsive: true, plugins: { legend: { display: false } } }
        });
    }

    // Participation Chart
    const ctx2 = document.getElementById('participationChart');
    if (ctx2) {
        if (studentParticipationChart) studentParticipationChart.destroy();
        studentParticipationChart = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: data.map(d => d.department_name),
                datasets: [{
                    label: 'Participation Rate (%)',
                    data: data.map(d => d.total_students > 0 ? ((d.participating_students / d.total_students) * 100).toFixed(1) : 0),
                    backgroundColor: '#10B981'
                }]
            },
            options: { 
                responsive: true, 
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, max: 100 } }
            }
        });
    }
}

async function loadDepartmentsForStudentFilter() {
    const deptSelect = document.getElementById('student-filter-dept');
    if (!deptSelect || deptSelect.options.length > 1) return;
    try {
        const departments = await apiRequest('/superadmin/departments');
        departments.forEach(d => {
            deptSelect.appendChild(new Option(d.department_name, d.department_id));
        });
    } catch (error) { console.error("Failed to load depts", error); }
}

async function loadAllStudents() {
    const tbody = document.getElementById('all-students-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';

    const deptId = document.getElementById('student-filter-dept').value;
    const search = document.getElementById('student-filter-search').value;

    try {
        const queryParams = new URLSearchParams();
        if (deptId) queryParams.append('department_id', deptId);
        if (search) queryParams.append('search', search);

        const students = await apiRequest(`/superadmin/students?${queryParams.toString()}`);

        if (students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No students found.</td></tr>';
            return;
        }

        tbody.innerHTML = students.map(s => `
            <tr>
                <td><strong>${s.name}</strong> <span style="color:#666; font-size:0.85em;">(${s.usn})</span> ${s.risk_status === 'High Risk' ? '<span style="background:#FEE2E2; color:#DC2626; padding:2px 6px; border-radius:4px; font-size:0.7em; font-weight:bold;">High Risk</span>' : ''}</td>
                <td><span class="dept-badge">${s.department_name}</span></td>
                <td style="text-align:center;">${s.exams_taken}</td>
                <td style="text-align:center;">${parseFloat(s.avg_score).toFixed(1)}%</td>
                <td style="text-align:center;"><span style="color:${s.violations > 0 ? '#DC2626' : '#10B981'}; font-weight:bold;">${s.violations}</span></td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Error: ${error.message}</td></tr>`;
    }
}

async function loadViolationAnalytics() {

    const container = document.getElementById('violation-summary-cards');
    container.innerHTML = '<div class="spinner"></div>';

    const status = document.getElementById('sa-violation-filter-status').value;
    const examSearch = document.getElementById('sa-violation-filter-exam').value;
    const type = document.getElementById('sa-violation-filter-type').value;

    try {

        let url = '/superadmin/violations/stats';
        const params = new URLSearchParams();

        if (status) params.append('status', status);
        if (examSearch) params.append('exam_search', examSearch);
        if (type) params.append('violation_type', type);

        if ([...params].length > 0) url += `?${params.toString()}`;

        const stats = await apiRequest(url);

        container.innerHTML = `
            <div class="sa-stat-card">
                <div class="icon" style="background:#FEE2E2; color:#DC2626;"><i class="fas fa-exclamation-circle"></i></div>
                <div class="info"><div class="value">${stats.today}</div><div class="label">Violations Today</div></div>
            </div>

            <div class="sa-stat-card">
                <div class="icon" style="background:#FFEDD5; color:#D97706;"><i class="fas fa-calendar-week"></i></div>
                <div class="info"><div class="value">${stats.week}</div><div class="label">Violations This Week</div></div>
            </div>

            <div class="sa-stat-card">
                <div class="icon" style="background:#E0E7FF; color:#4F46E5;"><i class="fas fa-user-tag"></i></div>
                <div class="info"><div class="value">${stats.students_flagged}</div><div class="label">Students Flagged</div></div>
            </div>

            <div class="sa-stat-card">
                <div class="icon" style="background:#F3F4F6; color:#4B5563;"><i class="fas fa-file-contract"></i></div>
                <div class="info"><div class="value">${stats.exams_affected}</div><div class="label">Exams Affected</div></div>
            </div>
        `;

        renderViolationTrendChart(stats.trend);
        renderViolationDeptChart(stats.by_dept);
        renderViolationTypeChart(stats.by_type);

    } catch (error) {

        console.error("Failed to load violation stats", error);
        container.innerHTML = '<p style="color:red">Error loading data.</p>';

    }
}

async function loadViolationHistory(page = 1) {

    const tbody = document.getElementById('violation-history-body');
    const paginationContainer = document.getElementById('history-pagination');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Loading...</td></tr>';

    const status = document.getElementById('history-filter-status')?.value;
    const examSearch = document.getElementById('sa-violation-filter-exam')?.value;
    const search = document.getElementById('history-filter-search')?.value;
    const startDate = document.getElementById('history-filter-start-date')?.value;
    const endDate = document.getElementById('history-filter-end-date')?.value;
    const type = document.getElementById('history-filter-type')?.value;

    try {

        let url = `/superadmin/violations/history?page=${page}&limit=10`;

        if (status) url += `&status=${status}`;
        if (examSearch) url += `&exam_search=${encodeURIComponent(examSearch)}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (startDate) url += `&start_date=${startDate}`;
        if (endDate) url += `&end_date=${endDate}`;
        if (type) url += `&violation_type=${type}`;

        const data = await apiRequest(url);
        const totalPages = data.total_pages || 1;

        if (!data.history || data.history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">No violations found.</td></tr>';
            if (paginationContainer) paginationContainer.innerHTML = '';
            return;
        }

       const grouped = {};
        data.history.forEach(v => {
            const key = `history_${v.usn}_${v.exam_name}`.replace(/\W/g, '_');
            if (!grouped[key]) {
                grouped[key] = { student_name: v.student_name || v.name, usn: v.usn, department_name: v.department_name, exam_name: v.exam_name, violations: [] };
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
                    <td><span class="dept-badge">${g.department_name}</span></td>
                    <td>${g.exam_name}</td>
                    <td colspan="6">
                        <span style="background:#FEE2E2; color:#DC2626; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold;">
                            ${g.violations.length} Violation(s)
                        </span>
                    </td>
                </tr>
                <tr id="details-${key}" style="display: none;">
                    <td colspan="9" style="padding: 0; background-color: #f1f5f9;">
                        <table style="width: 100%; margin: 0; background: transparent; border-collapse: collapse;">
                            <tbody>
                                ${g.violations.map(v => `
                                    <tr style="border-bottom: 1px solid #e2e8f0;">
                                        <td style="width: 25%; padding-left: 40px;"><span style="color:#DC2626; font-weight: 500;">${v.violation_type}</span></td>
                                        <td style="width: 10%;"><span class="status-badge" style="background-color: ${v.review_status === 'Resolved' ? '#DCFCE7' : v.review_status === 'Dismissed' ? '#F1F5F9' : '#FEF2F2'}; color: ${v.review_status === 'Resolved' ? '#16A34A' : v.review_status === 'Dismissed' ? '#64748B' : '#DC2626'}; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem;">${v.review_status}</span></td>
                                        <td style="width: 15%;">${new Date(v.timestamp).toLocaleString()}</td>
                                        <td style="width: 15%;"><small>${v.admin_remarks || '-'}</small></td>
                                        <td style="width: 15%;"><small>${v.remarks || '-'}</small></td>
                                        <td style="width: 20%; text-align: right; padding-right: 20px;"><button class="btn-action" onclick="viewEvidence(${v.violation_id})" style="color: #3182ce; font-weight: 500; padding: 4px 8px; border-radius: 4px; border: 1px solid #e2e8f0; background: white;">Review Evidence</button></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </td>
                </tr>
            `;
        }).join('');


        if (paginationContainer) {
            let paginationHtml = '';
            if (totalPages > 1) {
                paginationHtml += `<button type="button" onclick="loadViolationHistory(${page - 1})" ${page === 1 ? 'disabled' : ''}>&laquo;</button>`;
                for (let i = 1; i <= totalPages; i++) {
                    paginationHtml += `<button type="button" onclick="loadViolationHistory(${i})" class="${i === page ? 'active' : ''}">${i}</button>`;
                }
                paginationHtml += `<button type="button" onclick="loadViolationHistory(${page + 1})" ${page === totalPages ? 'disabled' : ''}>&raquo;</button>`;
            }
            paginationContainer.innerHTML = paginationHtml;
        }

    } catch (error) {

        console.error("Violation history error", error);

        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="color:red;text-align:center;">
                    Failed to load violation history
                </td>
            </tr>
        `;
    }
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

let vDeptChart = null;
function renderViolationDeptChart(data) {
    const ctx = document.getElementById('violationDeptChart');
    if (!ctx) return;
    if (vDeptChart) vDeptChart.destroy();

    vDeptChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.department_name),
            datasets: [{
                label: 'Violations',
                data: data.map(d => d.count),
                backgroundColor: '#F59E0B'
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
};

let showingArchived = false;
function toggleArchivedExams() {
    showingArchived = !showingArchived;
    const btn = document.getElementById('toggle-archived-btn');
    if (btn) btn.textContent = showingArchived ? "View Active" : "View Archived";
    loadAllExams();
}

async function loadAllExams() {
    const tbody = document.getElementById('all-exams-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading...</td></tr>';

    const deptId = document.getElementById('exam-filter-dept').value;
    const status = document.getElementById('exam-filter-status').value;
    const search = document.getElementById('exam-filter-search').value;

    // Update Header
    const header = document.getElementById('global-exams-header');
    if (header) header.textContent = showingArchived ? "Global Exam Monitoring (Archived)" : "Global Exam Monitoring";

    try {
        const queryParams = new URLSearchParams();
        if (deptId) queryParams.append('department_id', deptId);
        if (status) queryParams.append('status', status);
        if (search) queryParams.append('search', search);
        if (showingArchived) queryParams.append('archived', 'true');

        const exams = await apiRequest(`/superadmin/exams?${queryParams.toString()}`);

        if (exams.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No exams found matching criteria.</td></tr>';
            return;
        }

        tbody.innerHTML = exams.map(e => `
            <tr>
                <td><strong>${e.exam_name}</strong></td>
                <td><span class="dept-badge">${e.department_name}</span></td>
                <td>${e.subject_name}</td>
                <td>${e.batch_year || '-'}/${e.semester || '-'}</td>
                <td>${e.created_by}</td>
                <td><span class="status-badge ${e.status}">${e.status}</span></td>
                <td>${new Date(e.date).toLocaleString()}</td>
                <td>
                    ${showingArchived ? 
                        `<button onclick="restoreExam(${e.exam_id})" class="btn-action" style="color: #3182ce;">Restore</button>` : 
                        (e.status === 'completed' || e.status === 'active' ? `<button onclick="viewExamResults(${e.exam_id})" class="btn-action" style="color: #6f42c1; font-weight: bold;">Results</button>` : '-')
                    }
                </td>
            </tr>
        `).join('');

    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="7" style="color:red; text-align:center;">Error loading exams: ${error.message}</td></tr>`;
    }
}

async function restoreExam(examId) {
    if (!confirm("Restore this exam?")) return;
    try {
        const result = await apiRequest(`/superadmin/exams/${examId}/restore`, 'PUT');
        alert(result.message);
        loadAllExams();
    } catch (error) {
        alert("Error: " + error.message);
    }
}

async function viewExamResults(examId) {
    const tbody = document.querySelector('#results-table tbody');
    openModal('results-modal');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';

    try {
        const results = await apiRequest(`/superadmin/exams/${examId}/results`);
        
        if (results.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No results found yet.</td></tr>';
            return;
        }

        tbody.innerHTML = results.map(r => `
            <tr>
                <td>${r.usn}</td>
                <td>${r.name}</td>
                <td><strong>${r.total_marks}</strong></td>
                <td><span class="status-badge" style="background-color: ${r.result_status === 'Finalized' ? '#DCFCE7' : '#FEF3C7'}; color: ${r.result_status === 'Finalized' ? '#16A34A' : '#B45309'}; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem;">${r.result_status}</span></td>
                <td>${new Date(r.generated_time).toLocaleString()}</td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Error: ${error.message}</td></tr>`;
    }
}

async function cleanupArchivedExams() {
    const days = prompt("Enter the number of days (exams older than this will be permanently deleted):", "30");
    if (days === null) return;
    
    if (isNaN(days) || days < 1) {
        alert("Please enter a valid number of days.");
        return;
    }

    if (!confirm(`Are you sure you want to PERMANENTLY delete archived exams older than ${days} days? This cannot be undone.`)) return;

    try {
        const result = await apiRequest(`/superadmin/exams/cleanup?days=${days}`, 'DELETE');
        alert(result.message);
        loadAllExams();
    } catch (error) {
        alert("Error: " + error.message);
    }
}

async function cleanupOldViolations() {
    const days = prompt("Enter the number of days (violations older than this will be permanently deleted, including their Supabase screenshots):", "30");
    if (days === null) return;
    
    if (isNaN(days) || days < 1) {
        alert("Please enter a valid number of days.");
        return;
    }

    if (!confirm(`Are you sure you want to PERMANENTLY delete violations and screenshots older than ${days} days? This cannot be undone.`)) return;

    try {
        const result = await apiRequest(`/superadmin/violations/cleanup?days=${days}`, 'DELETE');
        alert(result.message);
        loadViolationAnalytics();
    } catch (error) {
        alert("Error: " + error.message);
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
        const v = await apiRequest(`/superadmin/violations/${id}`);

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
                <div><label style="font-size: 0.8rem; color: #6b7280; display: block; margin-bottom: 4px;">Exam</label><div style="font-weight: 600; color: #111827;">${v.exam_name}</div></div>
                <div><label style="font-size: 0.8rem; color: #6b7280; display: block; margin-bottom: 4px;">Violation Type</label><div><span style="color: #991B1B; background-color: #FEE2E2; padding: 4px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${v.violation_type}</span></div></div>
                <div><label style="font-size: 0.8rem; color: #6b7280; display: block; margin-bottom: 4px;">Status</label><div>${getStatusBadge(v.review_status)}</div></div>
                <div><label style="font-size: 0.8rem; color: #6b7280; display: block; margin-bottom: 4px;">Time</label><div style="font-size: 0.9rem; color: #374151;">${new Date(v.timestamp || v.detected_at).toLocaleString()}</div></div>
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
        `;
        content.innerHTML = contentHtml;
    } catch (error) {
        content.innerHTML = `<p style="color:red; text-align:center;">Error loading evidence: ${error.message}</p>`;
    }
}

function closeEvidenceModal() {
    document.getElementById('evidence-modal').style.display = 'none';
    document.body.style.overflow = '';
    currentViolationId = null;
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

// System Logs (re-using admin dashboard logic)
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
        const queryParams = new URLSearchParams({ page, limit: 15 });
        if (startDate) queryParams.append('start_date', startDate);
        if (endDate) queryParams.append('end_date', endDate);
        if (actionType) queryParams.append('action_type', actionType);
        if (search) queryParams.append('search', search);

        // Super admin uses the same endpoint, which detects the role
        const response = await apiRequest(`/admin/dashboard/logs?${queryParams.toString()}`);
        const { logs, total_pages } = response;
        
        currentLogsData = logs; // Save to global scope for CSV export

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No logs found.</td></tr>';
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
    link.setAttribute("download", "superadmin_system_logs.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function resolveViolation(status) {
    if (!currentViolationId) return;
    const remarksEl = document.getElementById('dynamic-violation-remarks');
    const remarks = remarksEl ? remarksEl.value : '';
    
    try {
        const result = await apiRequest(`/superadmin/violations/${currentViolationId}/resolve`, 'PUT', { status, remarks });
        alert(result.message || `Violation marked as ${status}`);
        closeEvidenceModal();
        loadViolationAnalytics(); // Refresh summary list
        loadViolationHistory();   // Refresh history list
    } catch (error) {
        alert("Error: " + error.message);
    }
}

// Generic Form Handler

// --- Infrastructure Management Logic ---
async function loadInfrastructureData() {
    try {
        const hierarchy = await apiRequest('/infrastructure/labs');
        
        const blockSelect = document.getElementById('infra-block-select');
        const floorSelect = document.getElementById('infra-floor-select');
        const labSelect = document.getElementById('infra-lab-select');
        
        if (!blockSelect || !floorSelect || !labSelect) return;

        // Extract unique blocks
        const uniqueBlocks = [...new Map(hierarchy.map(item => [item.block_id, {id: item.block_id, name: item.block_name}])).values()];
        blockSelect.innerHTML = '<option value="">Select Block</option>';
        uniqueBlocks.forEach(b => blockSelect.appendChild(new Option(b.name, b.id)));
        
        // Extract unique floors
        const uniqueFloors = [...new Map(hierarchy.filter(i => i.floor_id).map(item => [item.floor_id, {id: item.floor_id, name: `${item.block_name} - ${item.floor_number === -1 ? 'Basement' : item.floor_number === 0 ? 'Ground Floor' : 'Floor ' + item.floor_number}`}])).values()];
        floorSelect.innerHTML = '<option value="">Select Floor</option>';
        uniqueFloors.forEach(f => floorSelect.appendChild(new Option(f.name, f.id)));
        
        // Extract unique labs
        const uniqueLabs = [...new Map(hierarchy.filter(i => i.lab_id).map(item => [item.lab_id, {id: item.lab_id, name: `${item.block_name} - ${item.floor_number === -1 ? 'B' : item.floor_number === 0 ? 'G' : 'F' + item.floor_number} - ${item.lab_name}`}])).values()];
        labSelect.innerHTML = '<option value="">Select Lab</option>';
        uniqueLabs.forEach(l => labSelect.appendChild(new Option(l.name, l.id)));

        // New: Render tables
        renderInfrastructureTables(hierarchy);
        loadAllPCs(); // Also load PCs
        
    } catch (error) {
        console.error("Failed to load infrastructure", error);
    }
}

async function handleCreateBlock(e) {
    e.preventDefault();
    try {
        const name = e.target.querySelector('input[name="name"]').value;
        const res = await apiRequest('/infrastructure/block', 'POST', { name });
        alert(res.message);
        e.target.reset();
        loadInfrastructureData();
    } catch (err) { alert("Error: " + err.message); }
}

async function handleCreateFloor(e) {
    e.preventDefault();
    try {
        const data = Object.fromEntries(new FormData(e.target).entries());
        data.block_id = parseInt(data.block_id);
        data.floor_number = parseInt(data.floor_number);
        const res = await apiRequest('/infrastructure/floor', 'POST', data);
        alert(res.message);
        e.target.reset();
        loadInfrastructureData();
    } catch (err) { alert("Error: " + err.message); }
}

async function handleCreateLab(e) {
    e.preventDefault();
    try {
        const data = Object.fromEntries(new FormData(e.target).entries());
        data.floor_id = parseInt(data.floor_id);
        const res = await apiRequest('/infrastructure/lab', 'POST', data);
        alert(res.message);
        e.target.reset();
        loadInfrastructureData();
    } catch (err) { alert("Error: " + err.message); }
}

async function handleCreatePC(e) {
    e.preventDefault();
    try {
        const data = Object.fromEntries(new FormData(e.target).entries());
        data.lab_id = parseInt(data.lab_id);
        const res = await apiRequest('/infrastructure/pc', 'POST', data);
        alert(res.message);
        e.target.reset();
        loadInfrastructureData();
    } catch (err) { alert("Error: " + err.message); }
}

function renderInfrastructureTables(hierarchy) {
    const blocksBody = document.getElementById('blocks-table-body');
    const floorsBody = document.getElementById('floors-table-body');
    const labsBody = document.getElementById('labs-table-body');

    if (!blocksBody || !floorsBody || !labsBody) return;

    // Process and render blocks
    const uniqueBlocks = [...new Map(hierarchy.map(item => [item.block_id, {id: item.block_id, name: item.block_name}])).values()];
    if (uniqueBlocks.length > 0) {
        blocksBody.innerHTML = uniqueBlocks.map(b => `
            <tr>
                <td><strong>${b.name}</strong></td>
                <td>
                    <button class="btn-edit" onclick="openEditInfraModal('block', ${b.id}, '${b.name.replace(/'/g, "\\'")}')" style="margin-right: 5px;">Edit</button>
                    <button class="btn-delete" onclick="handleDeleteInfrastructure('block', ${b.id}, '${b.name.replace(/'/g, "\\'")}')">Delete</button>
                </td>
            </tr>
        `).join('');
    } else {
        blocksBody.innerHTML = '<tr><td colspan="2" style="text-align:center;">No blocks created.</td></tr>';
    }

    // Process and render floors
    const uniqueFloors = [...new Map(hierarchy.filter(i => i.floor_id).map(item => [item.floor_id, {id: item.floor_id, number: item.floor_number, block_name: item.block_name}])).values()];
    if (uniqueFloors.length > 0) {
        floorsBody.innerHTML = uniqueFloors.map(f => `
            <tr>
                <td>${f.number === -1 ? 'Basement' : f.number === 0 ? 'Ground Floor' : 'Floor ' + f.number}</td>
                <td>${f.block_name}</td>
                <td>
                    <button class="btn-edit" onclick="openEditInfraModal('floor', ${f.id}, '${f.number}')" style="margin-right: 5px;">Edit</button>
                    <button class="btn-delete" onclick="handleDeleteInfrastructure('floor', ${f.id}, '${f.number === -1 ? 'Basement' : f.number === 0 ? 'Ground Floor' : 'Floor ' + f.number}')">Delete</button>
                </td>
            </tr>
        `).join('');
    } else {
        floorsBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No floors created.</td></tr>';
    }

    // Process and render labs
    const uniqueLabs = [...new Map(hierarchy.filter(i => i.lab_id).map(item => [item.lab_id, {id: item.lab_id, name: item.lab_name, location: `${item.block_name} - ${item.floor_number === -1 ? 'B' : item.floor_number === 0 ? 'G' : 'F' + item.floor_number}`}])).values()];
    if (uniqueLabs.length > 0) {
        labsBody.innerHTML = uniqueLabs.map(l => `
            <tr>
                <td><strong>${l.name}</strong></td>
                <td>${l.location}</td>
                <td>
                    <button class="btn-edit" onclick="openEditInfraModal('lab', ${l.id}, '${l.name.replace(/'/g, "\\'")}')" style="margin-right: 5px;">Edit</button>
                    <button class="btn-delete" onclick="handleDeleteInfrastructure('lab', ${l.id}, '${l.name.replace(/'/g, "\\'")}')">Delete</button>
                </td>
            </tr>
        `).join('');
    } else {
        labsBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No labs created.</td></tr>';
    }
}

async function loadAllPCs() {
    const pcsBody = document.getElementById('pcs-table-body');
    if (!pcsBody) return;
    pcsBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>';
    try {
        const pcs = await apiRequest('/infrastructure/pcs');
        if (pcs.length > 0) {
            pcsBody.innerHTML = pcs.map(p => `
                <tr>
                    <td><strong>${p.pc_number}</strong></td>
                    <td>${p.block_name} - ${p.floor_number === -1 ? 'B' : p.floor_number === 0 ? 'G' : 'F' + p.floor_number} - ${p.lab_name}</td>
                    <td><span class="status-badge ${p.status.toLowerCase()}">${p.status}</span></td>
                    <td>
                        <button class="btn-edit" onclick="openEditInfraModal('pc', ${p.pc_id}, '${p.pc_number.replace(/'/g, "\\'")}', '${p.status}')" style="margin-right: 5px;">Edit</button>
                        <button class="btn-delete" onclick="handleDeleteInfrastructure('pc', ${p.pc_id}, '${p.pc_number.replace(/'/g, "\\'")}')">Delete</button>
                    </td>
                </tr>
            `).join('');
        } else {
            pcsBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No PCs created.</td></tr>';
        }
    } catch (error) {
        pcsBody.innerHTML = '<tr><td colspan="4" style="color:red; text-align:center;">Error loading PCs.</td></tr>';
    }
}

function openEditInfraModal(type, id, currentValue, status = null) {
    document.getElementById('edit-infra-type').value = type;
    document.getElementById('edit-infra-id').value = id;
    document.getElementById('edit-infra-name').value = currentValue;
    
    const label = document.getElementById('edit-name-label');
    const statusGroup = document.getElementById('edit-status-group');
    const nameInput = document.getElementById('edit-infra-name');
    
    nameInput.type = type === 'floor' ? 'number' : 'text';
    if (type === 'floor') {
        nameInput.min = "-1";
        nameInput.max = "7";
    } else {
        nameInput.removeAttribute('min');
        nameInput.removeAttribute('max');
    }

    label.textContent = type === 'floor' ? 'Floor Number' : (type === 'pc' ? 'PC Number' : 'Name');

    statusGroup.style.display = type === 'pc' ? 'block' : 'none';
    if (type === 'pc') document.getElementById('edit-infra-status').value = status || 'ACTIVE';
    
    openModal('edit-infra-modal');
}

async function handleEditInfrastructureSubmit(e) {
    e.preventDefault();
    const type = document.getElementById('edit-infra-type').value;
    const id = document.getElementById('edit-infra-id').value;
    const nameVal = document.getElementById('edit-infra-name').value;
    
    let payload = {};
    if (type === 'block') payload = { name: nameVal };
    else if (type === 'floor') payload = { floor_number: parseInt(nameVal) };
    else if (type === 'lab') payload = { lab_name: nameVal };
    else if (type === 'pc') payload = { pc_number: nameVal, status: document.getElementById('edit-infra-status').value };
    
    try {
        const res = await apiRequest(`/infrastructure/${type}/${id}`, 'PUT', payload);
        alert(res.message);
        closeModal('edit-infra-modal');
        loadInfrastructureData();
    } catch (err) { alert("Error: " + err.message); }
}

async function handleDeleteInfrastructure(type, id, name) {
    let message = `Are you sure you want to delete '${name}'?`;
    if (type === 'block') {
        message += "\n\nWARNING: Deleting a block will PERMANENTLY delete all associated floors, labs, and PCs. This action cannot be undone.";
    } else if (type === 'floor') {
        message += "\n\nThis will also delete all labs and PCs on this floor.";
    } else if (type === 'lab') {
        message += "\n\nThis will also delete all PCs in this lab.";
    }

    if (!confirm(message)) return;

    try {
        const res = await apiRequest(`/infrastructure/${type}/${id}`, 'DELETE');
        alert(res.message);
        loadInfrastructureData(); // Reload all data
    } catch (err) {
        alert("Error: " + err.message);
    }
}