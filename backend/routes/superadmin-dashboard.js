document.addEventListener("DOMContentLoaded", () => {
    requireAuth("super_admin");
    loadUserProfile();
    showSection('dashboard');

    // Form submit listeners
    document.getElementById('create-department-form').addEventListener('submit', handleCreateDepartment);
    document.getElementById('admin-form').addEventListener('submit', handleSaveAdmin);
    document.getElementById('department-edit-form').addEventListener('submit', handleUpdateDepartment);
    document.getElementById('reset-password-form').addEventListener('submit', handleResetPassword);
});

function loadUserProfile() {
    const profile = JSON.parse(localStorage.getItem('userProfile'));
    if (profile) {
        document.getElementById('nav-user').textContent = profile.name;
        document.getElementById('nav-designation').textContent = profile.designation;
    }
}

function showSection(sectionName) {
    document.querySelectorAll('.form-container').forEach(div => div.classList.remove('active'));
    document.querySelectorAll('.sidebar button').forEach(btn => btn.classList.remove('active'));

    document.getElementById(`${sectionName}-section`).classList.add('active');
    document.querySelector(`.sidebar button[data-section="${sectionName}"]`).classList.add('active');

    // Load data for the section
    if (sectionName === 'dashboard') loadDashboardStats();
    if (sectionName === 'departments') loadDepartments();
    if (sectionName === 'admins') loadAdmins();
    if (sectionName === 'logs') loadSystemLogs();
    if (sectionName === 'violations') loadViolationAnalytics();
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
                <div class="icon health"><i class="fas fa-heartbeat"></i></div>
                <div class="info"><div class="value">Healthy</div><div class="label">System Status</div></div>
            </div>
        `;
    } catch (error) {
        container.innerHTML = '<p style="color:red">Failed to load stats.</p>';
    }
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
                    <button class="btn-action" onclick="openEditDepartmentModal(${d.department_id}, '${d.department_name}')">Edit</button>
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
                <td>${a.department_name}</td>
                <td class="actions">
                    <button class="btn-action" onclick="openResetPasswordModal(${a.admin_id}, '${a.name}')">Reset Pass</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:red;text-align:center">Error: ${error.message}</td></tr>`;
    }
}

async function handleCreateDepartment(event) {
    event.preventDefault();
    const form = event.target;
    const name = form.querySelector('input[name="name"]').value;
    try {
        const result = await apiRequest('/superadmin/departments', 'POST', { name });
        alert(result.message);
        form.reset();
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

    try {
        const result = await apiRequest('/superadmin/admins', 'POST', data);
        alert(result.message);
        closeModal('admin-modal');
        loadAdmins();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function handleUpdateDepartment(event) {
    event.preventDefault();
    const form = event.target;
    const id = form.querySelector('input[name="department_id"]').value;
    const name = form.querySelector('input[name="name"]').value;
    try {
        const result = await apiRequest(`/superadmin/departments/${id}`, 'PUT', { name });
        alert(result.message);
        closeModal('department-edit-modal');
        loadDepartments();
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

async function openCreateAdminModal() {
    const form = document.getElementById('admin-form');
    form.reset();
    form.querySelector('input[name="admin_id"]').value = '';
    document.getElementById('admin-modal-title').textContent = 'Create New Admin';
    
    const deptSelect = document.getElementById('admin-department');
    deptSelect.innerHTML = '<option>Loading departments...</option>';
    try {
        const departments = await apiRequest('/superadmin/departments');
        deptSelect.innerHTML = '<option value="">Select Department</option>';
        departments.forEach(d => {
            deptSelect.appendChild(new Option(d.department_name, d.department_id));
        });
        openModal('admin-modal');
    } catch (error) {
        alert('Could not load departments.');
    }
}

function openEditDepartmentModal(id, name) {
    const form = document.getElementById('department-edit-form');
    form.querySelector('input[name="department_id"]').value = id;
    form.querySelector('input[name="name"]').value = name;
    openModal('department-edit-modal');
}

function openResetPasswordModal(id, name) {
    const form = document.getElementById('reset-password-form');
    form.reset();
    form.querySelector('input[name="admin_id"]').value = id;
    document.getElementById('reset-admin-name').textContent = name;
    openModal('reset-password-modal');
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

async function loadViolationAnalytics() {
    const container = document.getElementById('violation-summary-cards');
    container.innerHTML = '<div class="spinner"></div>';
    loadViolationHistory();
    const status = document.getElementById('sa-violation-filter-status').value;
    
    try {
        let url = '/superadmin/violations/stats';
        if (status) url += `?status=${status}`;
        const stats = await apiRequest(url);
        
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
        
        if (!alertsHtml) alertsHtml = '<p style="color:#666; padding:10px;">No critical alerts at this moment.</p>';
        alertsContainer.innerHTML = alertsHtml;

        // 4. Recent Violations Table
        const recentBody = document.getElementById('recent-violations-full-body');
        recentBody.innerHTML = stats.recent.map(v => `
            <tr>
                <td><strong>${v.student_name}</strong> <span style="font-size:0.8em; color:#666;">(${v.usn})</span></td>
                <td><span class="dept-badge">${v.department_name}</span></td>
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

async function loadViolationHistory(page = 1) {
    const tbody = document.getElementById('violation-history-body');
    const pagination = document.getElementById('history-pagination');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading...</td></tr>';
    const status = document.getElementById('history-filter-status').value;
    const search = document.getElementById('history-filter-search').value;

    try {
        const queryParams = new URLSearchParams({ page, limit: 10 });
        if (status) queryParams.append('status', status);
        if (search) queryParams.append('search', search);

        const data = await apiRequest(`/superadmin/violations/history?${queryParams.toString()}`);
        
        if (data.history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No history found.</td></tr>';
            pagination.innerHTML = '';
            return;
        }

        tbody.innerHTML = data.history.map(v => `
            <tr>
                <td><strong>${v.student_name}</strong> <span style="font-size:0.8em; color:#666;">(${v.usn})</span></td>
                <td><span class="dept-badge">${v.department_name}</span></td>
                <td>${v.exam_name}</td>
                <td><span style="color:#DC2626;">${v.violation_type}</span></td>
                <td><span class="status-badge ${v.review_status === 'Resolved' ? 'active' : 'inactive'}">${v.review_status}</span></td>
                <td>${new Date(v.timestamp).toLocaleString()}</td>
                <td><small>${v.admin_remarks || '-'}</small></td>
            </tr>
        `).join('');

        pagination.innerHTML = `<button onclick="loadViolationHistory(${page-1})" ${page===1?'disabled':''}>&laquo;</button> <span style="padding:5px;">Page ${page}</span> <button onclick="loadViolationHistory(${page+1})" ${page===data.total_pages?'disabled':''}>&raquo;</button>`;
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="7" style="color:red; text-align:center;">Error: ${error.message}</td></tr>`;
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