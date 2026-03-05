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

function showSection(sectionName) {
    document.querySelectorAll('.form-container').forEach(div => div.classList.remove('active'));
    document.querySelectorAll('.sidebar button').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(`${sectionName}-section`).classList.add('active');
    document.querySelector(`.sidebar button[data-section="${sectionName}"]`).classList.add('active');

    if (sectionName === 'dashboard') loadDashboardStats();
    if (sectionName === 'upcoming') loadUpcomingExams();
    if (sectionName === 'history') loadExamHistory();
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
            <div class="stat-card">
                <div class="stat-value">${stats.average_score}%</div>
                <div class="stat-label">Average Score</div>
                <div class="stat-icon">📊</div>
            </div>
            <div class="stat-card" style="border-bottom: 4px solid ${stats.violations > 0 ? '#dc3545' : '#28a745'};">
                <div class="stat-value" style="color: ${stats.violations > 0 ? '#dc3545' : '#28a745'};">${stats.violations}</div>
                <div class="stat-label">Violations</div>
                <div class="stat-icon">⚠️</div>
            </div>
        `;

        renderPerformanceChart(stats.performance);
        loadUpcomingExams(true); // Load preview table

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
            const canStart = e.status === 'active' && now >= examDate && now < endTime;
            const isMissed = now > endTime;

            let actionBtn = '';
            if (e.attempt_status === 'IN_PROGRESS') {
                actionBtn = `<button onclick="startExam(${e.exam_id})" class="submit-btn" style="background-color:#ffc107; color:black; padding: 5px 10px; font-size: 0.8rem;">Resume</button>`;
            } else if (canStart) {
                actionBtn = `<button onclick="startExam(${e.exam_id})" class="submit-btn" style="padding: 5px 10px; font-size: 0.8rem;">Start Exam</button>`;
            } else if (isMissed) {
                actionBtn = `<span style="color:red; font-weight:bold;">Missed</span>`;
            } else {
                actionBtn = `<span style="color:gray;">Wait for start</span>`;
            }

            if (isPreview) {
                return `
                    <tr>
                        <td><strong>${e.exam_name}</strong></td>
                        <td>${e.subject_name}</td>
                        <td>${examDate.toLocaleDateString()} ${examDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                        <td>${actionBtn}</td>
                    </tr>
                `;
            } else {
                return `
                    <tr>
                        <td><strong>${e.exam_name}</strong></td>
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

function startExam(examId) {
    // Redirect to exam interface (to be implemented)
    window.location.href = `exam-interface.html?exam_id=${examId}`;
}