function requireAuth(role = null) {
    const token = localStorage.getItem("access_token");
    const userRole = localStorage.getItem("role");

    if (!token) {
        window.location.href = "login.html";
        return;
    }

    if (role && userRole !== role) {
        alert("Unauthorized access");
        window.location.href = "login.html";
    }
}

function logout() {
    localStorage.clear();
    window.location.href = "login.html";
}