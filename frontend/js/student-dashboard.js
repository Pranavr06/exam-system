document.addEventListener("DOMContentLoaded", () => {
    requireAuth("student");
    loadUserProfile();
    showSection('dashboard');
});

async function loadUserProfile() {
    try {
        const profile = await apiRequest('/student/profile');
        document.getElementById('nav-user').textContent = profile.name;
    } catch (error) {
        console.error("Failed to load profile", error);
    }
}

let navHistory = [];
let isNavigatingBack = false;

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

    document.querySelectorAll('.form-container').forEach(div => div.classList.remove('active'));
    document.querySelectorAll('.sidebar button').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(`${sectionName}-section`).classList.add('active');
    document.querySelector(`.sidebar button[data-section="${sectionName}"]`).classList.add('active');

    updateBreadcrumb(sectionName);

    if (sectionName === 'dashboard') loadDashboardStats();
    if (sectionName === 'upcoming') loadUpcomingExams();
    if (sectionName === 'history') loadExamHistory();
    if (sectionName === 'academic') loadAcademicInfo();
    if (sectionName === 'violations') loadViolations();
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
        'upcoming': 'Upcoming Exams',
        'history': 'Exam History',
        'academic': 'Academic Profile',
        'violations': 'Violations'
    };

    const name = sectionNames[section] || section.charAt(0).toUpperCase() + section.slice(1);
    
    const backButtonHtml = navHistory.length > 0 
        ? `<button class="back-btn" onclick="goBack()" title="Go Back"><i class="fas fa-arrow-left"></i></button>` 
        : '';

    breadcrumb.innerHTML = `
        <   <span class="separator">/</span>
            <span class="current">${name}</span>
        </div>
    `;
}

async function loadDashboardStats() {
    const container = document.getElementById('student-stats-container');
    container.innerHTML = '<div class="spinner"></div>';
    
    try {
        const stats = await apiRequest('/student/dashboard/stats');
        
        container.innerHTML = `
            <div class="stat-card" onclick="showSection('upcoming')">
                <div class="stat-value">${stats.upcoming_exams}</div>
                <div class="stat-label">Upcoming Exams</div>
                <div class="stat-icon">📅</div>
            </div>
            <div class="stat-card" onclick="showSection('history')">
                <div class="stat-value">${stats.completed_exams}</div>
                <div class="stat-label">Completed</div>
                <div class="stat-icon">✅</div>
            </div>
            <div class="stat-card" onclick="showSection('history')">
                <div class="stat-value">${stats.average_score}%</div>
                <div class="stat-label">Average Score</div>
                <div class="stat-icon">📊</div>
            </div>
            <div class="stat-card" onclick="showSection('violations')" style="border-bottom: 4px solid ${stats.violations > 0 ? '#dc3545' : '#28a745'};">
                <div class="stat-value" style="color: ${stats.violations > 0 ? '#dc3545' : '#28a745'};">${stats.violations}</div>
                <div class="stat-label">Violations</div>
                <div class="stat-icon">⚠️</div>
            </div>
        `;

        renderPerformanceChart(stats.performance);
        loadUpcomingExams(true); // Load preview table
        
        // Render Recent Results Table
        const resultsBody = document.querySelector('#dashboard-results-table tbody');
        if (resultsBody) {
            if (stats.recent_results.length === 0) {
                resultsBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#666;">No recent results.</td></tr>';
            } else {
                resultsBody.innerHTML = stats.recent_results.slice(0, 5).map(r => `
                    <tr>
                        <td><strong>${r.exam_name}</strong></td>
                        <td>${r.subject_name}</td>
                        <td>${r.obtained_marks} / ${r.max_marks}</td>
                        <td><span class="status-badge ${r.result_status === 'Pass' ? 'active' : 'inactive'}" style="background:${r.result_status === 'Pass' ? '#d1fae5' : '#fee2e2'}; color:${r.result_status === 'Pass' ? '#065f46' : '#b91c1c'};">${r.result_status}</span></td>
                    </tr>
                `).join('');
            }
        }

    } catch (error) {
        console.error("Failed to load stats", error);
        container.innerHTML = '<p style="color:red">Failed to load dashboard data.</p>';
    }
}

let perfChart = null;
function renderPerformanceChart(data) {
    const ctx = document.getElementById('studentPerformanceChart');
    if (!ctx) return;

    if (perfChart) perfChart.destroy();

    const labels = data.map(d => d.subject_name);
    const scores = data.map(d => parseFloat(d.score).toFixed(1));

    perfChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Score (%)',
                data: scores,
                backgroundColor: 'rgba(54, 162, 235, 0.6)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true, max: 100 } },
            plugins: { legend: { display: false } }
        }
    });
}

async function loadUpcomingExams(isPreview = false) {
    const tableId = isPreview ? 'dashboard-upcoming-table' : 'upcoming-exams-table';
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="${isPreview ? 4 : 6}" style="text-align:center;">Loading...</td></tr>`;

    try {
        const exams = await apiRequest('/student/exams/upcoming');
        
        if (exams.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${isPreview ? 4 : 6}" style="text-align:center;">No upcoming exams.</td></tr>`;
            return;
        }

        const displayExams = isPreview ? exams.slice(0, 3) : exams;

        tbody.innerHTML = displayExams.map(e => {
            const examDate = new Date(e.date);
            const now = new Date();
            const isToday = examDate.toDateString() === now.toDateString();
            
            // Logic for Start Button:
            // 1. Exam must be 'active'
            // 2. Current time must be >= Exam Start Time
            // 3. Current time must be < Exam End Time (Start + Duration)
            
            const endTime = new Date(examDate.getTime() + e.duration * 60000);
            const isWithinWindow = now >= examDate && now < endTime;
            // An exam can be started if it's 'active' (manually published) or 'scheduled' and the time is right.
            const canStart = (e.status === 'active' || e.status === 'scheduled') && isWithinWindow;
            const isMissed = !canStart && now > endTime && e.attempt_status !== 'IN_PROGRESS';

            // Allow link for resumable exams too
            const nameLink = (canStart || e.attempt_status === 'IN_PROGRESS') ? `<a href="exam-interface.html?exam_id=${e.exam_id}" style="color:#2563EB; font-weight:bold; text-decoration:underline;">${e.exam_name}</a>` : `<strong>${e.exam_name}</strong>`;
            
            let actionBtn = '';
            const isCenter = e.mode === 'CENTER';

            if (e.attempt_status === 'IN_PROGRESS') {
                const actionFunc = isCenter ? `openPasswordModal(${e.exam_id})` : `startExam(${e.exam_id})`;
                actionBtn = `<button onclick="${actionFunc}" class="submit-btn" style="background-color:#ffc107; color:black; padding: 5px 10px; font-size: 0.8rem;">Resume</button>`;
            } else if (canStart) {
                const actionFunc = isCenter ? `openPasswordModal(${e.exam_id})` : `startExam(${e.exam_id})`;
                actionBtn = `<button onclick="${actionFunc}" class="submit-btn" style="padding: 5px 10px; font-size: 0.8rem;">Start Exam</button>`;
            } else if (isMissed) {
                actionBtn = `<span style="color:#e53e3e; font-weight:500; font-size:0.9rem;">Missed</span>`;
            } else {
                actionBtn = `<span style="color:#718096; font-size:0.9rem;">Scheduled</span>`;
            }

            if (isPreview) {
                return `
                    <tr>
                        <td>${nameLink}</td>
                        <td>${e.subject_name}</td>
                        <td>${examDate.toLocaleDateString()} ${examDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                        <td>${actionBtn}</td>
                    </tr>
                `;
            } else {
                return `
                    <tr>
                        <td>${nameLink}</td>
                        <td>${e.subject_name}</td>
                        <td>${examDate.toLocaleString()}</td>
                        <td>${e.duration} mins</td>
                        <td><span class="status-badge ${e.status}">${e.status}</span></td>
                        <td>${actionBtn}</td>
                    </tr>
                `;
            }
        }).join('');

    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="${isPreview ? 4 : 6}" style="color:red; text-align:center;">Error loading exams.</td></tr>`;
    }
}

async function loadExamHistory() {
    const tbody = document.querySelector('#history-exams-table tbody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';

    try {
        const history = await apiRequest('/student/exams/history');
        
        if (history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No exam history found.</td></tr>';
            return;
        }

        tbody.innerHTML = history.map(h => `
            <tr>
                <td><strong>${h.exam_name}</strong></td>
                <td>${h.subject_name}</td>
                <td><strong>${h.obtained_marks}</strong> / ${h.max_marks}</td>
                <td><span style="color:${h.result_status === 'Finalized' ? 'green' : 'orange'}">${h.result_status}</span></td>
                <td>${new Date(h.generated_time).toLocaleDateString()}</td>
            </tr>
        `).join('');

    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="5" style="color:red; text-align:center;">Error loading history.</td></tr>';
    }
}

function openPasswordModal(examId) {
    document.getElementById('exam-password-modal').style.display = 'flex';
    document.getElementById('modal-exam-id').value = examId;
    document.getElementById('exam-password-input').focus();
}

function closePasswordModal() {
    document.getElementById('exam-password-modal').style.display = 'none';
    document.getElementById('exam-password-input').value = '';
}

async function startExam(examId) {
    try {
        // This creates the attempt record on the backend before redirecting
        await apiRequest(`/student/exams/start`, 'POST', { exam_id: examId });
        window.location.href = `exam-interface.html?exam_id=${examId}`;
    } catch (error) {
        alert("Error starting exam: " + error.message);
    }
}

async function startCenterExam() {
    const examId = document.getElementById('modal-exam-id').value;
    const password = document.getElementById('exam-password-input').value.trim();

    try {
        // The start endpoint will validate the password
        await apiRequest(`/student/exams/start`, 'POST', { exam_id: parseInt(examId), password: password });
        window.location.href = `exam-interface.html?exam_id=${examId}`;
    } catch (error) {
        alert("Error: " + error.message);
    }
}

async function loadAcademicInfo() {
    const profileContainer = document.getElementById('academic-profile-details');
    const subjectsBody = document.querySelector('#academic-subjects-table tbody');
    
    try {
        const data = await apiRequest('/student/academic-info');
        const info = data.info;
        
        if (info) {
            profileContainer.innerHTML = `
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #f1f5f9; padding:8px 0;"><span>Name:</span> <strong>${info.name}</strong></div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #f1f5f9; padding:8px 0;"><span>USN:</span> <strong>${info.usn}</strong></div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #f1f5f9; padding:8px 0;"><span>Email:</span> <strong>${info.email}</strong></div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #f1f5f9; padding:8px 0;"><span>Department:</span> <strong>${info.department_name}</strong></div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid #f1f5f9; padding:8px 0;"><span>Section:</span> <strong>${info.section_name}</strong></div>
                <div style="display:flex; justify-content:space-between; padding:8px 0;"><span>Batch / Sem:</span> <strong>${info.batch_year} / Sem ${info.semester}</strong></div>
            `;
        }

        if (data.subjects.length === 0) {
            subjectsBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No subjects assigned yet.</td></tr>';
        } else {
            subjectsBody.innerHTML = data.subjects.map(s => `
                <tr>
                    <td><strong>${s.subject_name}</strong></td>
                    <td>${s.teacher_name}</td>
                    <td><a href="mailto:${s.teacher_email}" style="color:#3182ce; text-decoration:none;">${s.teacher_email}</a></td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error("Failed to load academic info", error);
        profileContainer.innerHTML = '<p style="color:red">Error loading profile.</p>';
    }
}

async function loadViolations() {
    const tbody = document.querySelector('#violations-table tbody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>';
    try {
        const violations = await apiRequest('/student/violations');
        if (violations.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No violations recorded. Good job!</td></tr>';
            return;
        }
        tbody.innerHTML = violations.map(v => `
            <tr>
                <td><span style="color:#e53e3e; font-weight:bold;">${v.violation_type}</span></td>
                <td>Exam ID: ${v.exam_id}</td> <!-- Ideally fetch exam name -->
                <td>${new Date(v.timestamp).toLocaleString()}</td>
                <td>${v.evidence_data ? 'Captured' : 'N/A'}</td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="4" style="color:red; text-align:center;">Error loading violations.</td></tr>';
    }
}