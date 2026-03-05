function requireAuth(role) {
    const token = localStorage.getItem('access_token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.role !== role) {
            alert('Access Denied. You do not have the required role.');
            logout();
        }
        // Check token expiration
        if (Date.now() >= payload.exp * 1000) {
            alert('Session expired. Please log in again.');
            logout();
        }
    } catch (e) {
        console.error("Token parsing error:", e);
        logout();
    }
}

function logout() {
    localStorage.clear();
    window.location.href = 'login.html';
}