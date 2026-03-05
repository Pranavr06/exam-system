async function login(event) {
    console.log("Login initiated...");
    
    // Prevent default form submission which causes page reload
    if (event) event.preventDefault();
    if (window.event) window.event.preventDefault();

    // Clear any existing tokens to prevent CORS issues with Authorization headers
    localStorage.clear();

    const role = document.getElementById("role").value;
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!role) {
        alert("Please select a role.");
        return;
    }

    // Normalize role to match backend routes and auth checks (e.g., "Super Admin" -> "super_admin")
    const normalizedRole = role.toLowerCase().replace(/\s+/g, '_');

    try {
        const data = await apiRequest(
            `/${normalizedRole}/login?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
            "POST",
            null
        );

        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("role", normalizedRole);
        localStorage.setItem("user_id", data.super_admin_id || data.admin_id || data.teacher_id || data.student_id);
        localStorage.setItem("userProfile", JSON.stringify({
            name: data.name,
            designation: data.designation || (normalizedRole === 'admin' ? 'Department Admin' : normalizedRole)
        }));

        if (normalizedRole === "super_admin") {
            window.location.href = "superadmin-dashboard.html";
        } else if (normalizedRole === "admin") {
            window.location.href = "admin-dashboard.html";
        } else if (normalizedRole === "teacher") {
            window.location.href = "teacher-dashboard.html";
        } else {
            window.location.href = "student-dashboard.html";
        }

    } catch (error) {
        alert(error.message);
    }
}

function toggleLoginPassword(btn) {
    const passwordInput = document.getElementById("password");
    if (passwordInput.type === "password") {
        passwordInput.type = "text";
        // Switch to Eye Off icon
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07-2.3 2.3"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
    } else {
        passwordInput.type = "password";
        // Switch back to Eye icon
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    }
}