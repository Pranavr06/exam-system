document.addEventListener("DOMContentLoaded", () => {
    requireAuth("super_admin");
    loadUserProfile();
    showSection('dashboard');

    // Form submit listeners
    const deptForm = document.getElementById('department-form');
    if (deptForm) deptForm.addEventListener('submit', handleSaveDepartment);
    
    const adminForm = document.getElementById('admin-form');
    if (adminForm) adminForm.addEventListener('submit', handleSaveAdmin);
    
    const resetPwdForm = document.getElementById('reset-password-form');
    if (resetPwdForm) resetPwdForm.addEventListener('submit', handleResetPassword);
});

function loadUserProfile() {
    const profile = JSON.parse(localStorage.getItem('userProfile'));
    if (profile) {
        document.getElementById('nav-user').textContent = profile.name;
        document.getElementById('nav-designation').textContent = profile.designation;
    }
}

// UI Tab Switching Logic
function showSection(sectionName) {
    document.querySelectorAll('.form-container').forEach(div => {
        div.classList.remove('active');
    });
    document.querySelectorAll('.sidebar button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`${sectionName}-section`).classList.add('active');
    document.querySelector(`.sidebar button[data-section="${sectionName}"]`).classList.add('active');

    // Load data for the section
    if (sectionName === 'dashboard') loadDashboardStats();
    if (sectionName === 'departments') loadDepartments();
    if (sectionName === 'admins') loadAdmins();
    if (sectionName === 'teachers') { loadAllTeachers(); loadDepartmentsForTeacherFilter(); }
    if (sectionName === 'students') { loadStudentStats(); loadAllStudents(); loadDepartmentsForStudentFilter(); }
    if (sectionName === 'violations') loadViolationAnalytics();
    if (sectionName === 'exams') { loadAllExams(); loadDepartmentsForExamFilter(); }
    if (sectionName === 'admins') loadDepartmentsForDropdown();
    if (sectionName === 'logs') loadSystemLogs();
}

async function loadDashboardStats() {
    const container = document.getElementById('sa-stats-container');
    container.innerHTML = '<div class="spinner"></div>';
    try {
        const stats = await apiRequest('/superadmin/dashboard/stats');
        container.innerHTML = `
            <div class="sa-stat-card">
                <div class="icon departments"><i class="fas fa-building"></i></div>
                <div class="info"><div class="value">${stats.total_departments}</div><div class="label">Departments</div></div>
            </div>
            <div class="sa-stat-card">
                <div class="icon admins"><i class="fas fa-user-shield"></i></div>
                <div class="info"><div class="value">${stats.total_admins}</div><div class="label">Admins</div></div>
            </div>
            <div class="sa-stat-card">
                <div class="icon active-admins"><i class="fas fa-chalkboard-teacher"></i></div>
                <div class="info"><div class="value">${stats.total_teachers}</div><div class="label">Teachers</div></div>
            </div>
            <div class="sa-stat-card">
                <div class="icon" style="background:#F3E8FF; color:#7C3AED;"><i class="fas fa-user-graduate"></i></div>
                <div class="info"><div class="value">${stats.total_students}</div><div class="label">Students</div></div>
            </div>
            <div class="sa-stat-card">
                <div class="icon" style="background:#E0F2FE; color:#0284C7;"><i class="fas fa-file-alt"></i></div>
                <div class="info"><div class="value">${stats.total_exams}</div><div class="label">Exams</div></div>
            </div>
            <div class="sa-stat-card">
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
        document.getElementById('students-writing-badge').textContent = `${stats.students_writing || 0} Students Writing`;
        
        // Update Active Teachers Badge
        document.getElementById('active-teachers-badge').textContent = `${stats.active_teachers_today || 0} Active Today`;

        // Render Active Exams
        const activeExamsBody = document.getElementById('active-exams-body');
        if (stats.active_exams.length === 0) {
            activeExamsBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">No active exams currently.</td></tr>';
        } else {
            activeExamsBody.innerHTML = stats.active_exams.map(e => `
                <tr>
                    <td><strong>${e.exam_name}</strong></td>
                    <td><span class="dept-badge">${e.department_name}</span></td>
                    <td>${new Date(e.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                    <td>${e.section_count} Sections</td>
                </tr>
            `).join('');
        }

        // Render Violations
        const violationsList = document.getElementById('recent-violations-list');
        if (stats.recent_violations.length === 0) {
            violationsList.innerHTML = '<p style="color:#666; text-align:center; padding:10px;">No recent violations.</p>';
        } else {
            violationsList.innerHTML = stats.recent_violations.map(v => `
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

        // Render Activity Feed
        const activityList = document.getElementById('system-activity-feed');
        if (stats.recent_activity.length === 0) {
            activityList.innerHTML = '<p style="color:#666; text-align:center; padding:10px;">No recent activity.</p>';
        } else {
            activityList.innerHTML = stats.recent_activity.map(a => `
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
                teacherBody.innerHTML = stats.top_teachers.map(t => `
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
                <td><span class="status-badge ${a.is_active ? 'active' : 'inactive'}">${a.is_active ? 'Active' : 'Inactive'}</span></td>
                <td class="actions">
                    <button class="btn-action" onclick="editAdmin(${a.admin_id})">Edit</button>
                    <button class="btn-action" onclick="toggleAdminStatus(${a.admin_id}, ${!a.is_active})">${a.is_active ? 'Disable' : 'Enable'}</button>
                    <button class="btn-action" onclick="openResetPasswordModal(${a.admin_id}, '${a.name}')">Reset Pass</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:red;text-align:center">Error: ${error.message}</td></tr>`;
    }
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

async function handleResetPassword(event) {
    event.preventDefault();
    const form = event.target;
    const id = form.querySelector('input[name="admin_id"]').value;
    const password = form.querySelector('input[name="password"]').value;
    try {
        const result = await apiRequest(`/superadmin/admins/${id}/password`, 'PUT', { password });
        alert(result.message);
        closeModal('reset-password-modal');
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function toggleAdminStatus(adminId, newStatus) {
    const action = newStatus ? 'enable' : 'disable';
    if (!confirm(`Are you sure you want to ${action} this admin account?`)) return;
    try {
        const result = await apiRequest(`/superadmin/admins/${adminId}/status`, 'PUT', { is_active: newStatus });
        alert(result.message);
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

function openResetPasswordModal(id, name) {
    const form = document.getElementById('reset-password-form');
    form.reset();
    form.querySelector('input[name="admin_id"]').value = id;
    document.getElementById('reset-admin-name').textContent = name;
    openModal('reset-password-modal');
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

function renderStudentCharts(data) {
    // Dept Strength Chart
    const ctx1 = document.getElementById('deptStrengthChart');
    if (ctx1) {
        new Chart(ctx1, {
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
        new Chart(ctx2, {
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
                <td><strong>${s.name}</strong> <span style="color:#666; font-size:0.85em;">(${s.usn})</span></td>
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
    
    try {
        const stats = await apiRequest('/superadmin/violations/stats');
        
        // 1. Summary Cards
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

        // 2. Charts
        renderViolationTrendChart(stats.trend);
        renderViolationDeptChart(stats.by_dept);
        renderViolationTypeChart(stats.by_type);

        // 3. Alerts
        const alertsContainer = document.getElementById('violation-alerts-container');
        let alertsHtml = '';
        if (stats.today > 5) alertsHtml += `<div class="activity-item violation"><div class="act-icon"><i class="fas fa-exclamation"></i></div><div class="act-content"><strong>High Violation Rate</strong><br>${stats.today} violations recorded today.</div></div>`;
        // Add more logic based on data if needed
        if (stats.recent.some(v => v.violation_type.includes('Mobile'))) alertsHtml += `<div class="activity-item violation"><div class="act-icon"><i class="fas fa-mobile-alt"></i></div><div class="act-content"><strong>Mobile Device Detected</strong><br>Recent mobile usage attempts found.</div></div>`;
        
        if (!alertsHtml) alertsHtml = '<p style="color:#666; padding:10px;">No critical alerts at this moment.</p>';
        alertsContainer.innerHTML = alertsHtml;

        // 4. Recent Violations Table
        const recentBody = document.getElementById('recent-violations-full-body');
        recentBody.innerHTML = stats.recent.map(v => `
            <tr>
                <td><strong>${v.name}</strong> <span style="font-size:0.8em; color:#666;">(${v.usn})</span></td>
                <td><span class="dept-badge">${v.department_name}</span></td>
                <td>${v.exam_name}</td>
                <td><span style="color:#DC2626; font-weight:500;">${v.violation_type}</span></td>
                <td>${new Date(v.timestamp).toLocaleTimeString()}</td>
            </tr>
        `).join('');

        // 5. High Risk Students
        const riskBody = document.getElementById('high-risk-students-body');
        riskBody.innerHTML = stats.high_risk.map(s => `
            <tr>
                <td><strong>${s.name}</strong> <br><span style="font-size:0.8em; color:#666;">${s.department_name}</span></td>
                <td><span class="status-badge inactive" style="background:#FEE2E2; color:#DC2626;">${s.violation_count} Violations</span></td>
            </tr>
        `).join('');

    } catch (error) {
        console.error("Failed to load violation stats", error);
        container.innerHTML = '<p style="color:red">Error loading data.</p>';
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

async function loadAllExams() {
    const tbody = document.getElementById('all-exams-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading...</td></tr>';

    const deptId = document.getElementById('exam-filter-dept').value;
    const status = document.getElementById('exam-filter-status').value;
    const search = document.getElementById('exam-filter-search').value;

    try {
        const queryParams = new URLSearchParams();
        if (deptId) queryParams.append('department_id', deptId);
        if (status) queryParams.append('status', status);
        if (search) queryParams.append('search', search);

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
            </tr>
        `).join('');

    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="7" style="color:red; text-align:center;">Error loading exams: ${error.message}</td></tr>`;
    }
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
// Generic Form Handler