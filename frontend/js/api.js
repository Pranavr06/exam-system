const API_BASE = "https://exam-system-2k9t.onrender.com";

function showLoading() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.style.display = 'flex';
}

function hideLoading() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.style.display = 'none';
}

async function apiRequest(endpoint, method = "GET", body = null) {
    showLoading();
    const token = localStorage.getItem("access_token");

    const options = {
        method: method,
        headers: {
            "Accept": "application/json",
        },
        mode: 'cors', // Explicitly request CORS
    };

    if (token) {
        options.headers["Authorization"] = `Bearer ${token}`;
    }

    if (body) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
    }

    try {
        console.log(`[API] Fetching: ${API_BASE}${endpoint}`);
        const response = await fetch(`${API_BASE}${endpoint}`, options);

        if (!response.ok) {
            const error = await response.text();
            throw new Error(error);
        }

        return await response.json();
    } catch (error) {
        console.error("[API] Request Failed:", error);
        if (error.message === "Failed to fetch") {
            throw new Error("Cannot connect to server. Ensure backend is running on port 8000 and CORS is configured.");
        }
        throw error;
    } finally {
        hideLoading();
    }
}
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar') || document.querySelector('.exam-sidebar');
    const overlay = document.getElementById('mobile-overlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('open');
}
