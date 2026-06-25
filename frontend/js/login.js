async function login(event) {
    console.log("Login initiated...");
    
    // Prevent default form submission which causes page reload
    if (event) event.preventDefault();

    // UI Elements
    const btn = document.getElementById("login-btn");
    const btnText = document.getElementById("btn-text");
    const btnIcon = document.getElementById("btn-icon");
    const btnSpinner = document.getElementById("btn-spinner");
    const errorBox = document.getElementById("login-error");
    const errorText = document.getElementById("error-text");

    // Reset UI
    if (errorBox) errorBox.style.display = "none";
    if (btn) { btn.disabled = true; }
    if (btnText) btnText.textContent = "Signing in...";
    if (btnIcon) btnIcon.style.display = "none";
    if (btnSpinner) btnSpinner.style.display = "inline-block";

    // Clear any existing tokens to prevent CORS issues with Authorization headers
    localStorage.clear();

    const role = document.getElementById("role").value;
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!role) {
        if (errorBox && errorText) {
            errorText.textContent = "Please select a role.";
            errorBox.style.display = "flex";
        } else {
            alert("Please select a role.");
        }
        resetButton();
        return;
    }

    // Normalize role to match backend routes and auth checks (e.g., "Super Admin" -> "super_admin")
    const normalizedRole = role.toLowerCase().replace(/\s+/g, '_');

    // Handle URL prefix difference for Super Admin (role: super_admin, route: /superadmin/...)
    const urlPrefix = normalizedRole === 'super_admin' ? 'superadmin' : normalizedRole;

    try {
        const data = await apiRequest(
            `/${urlPrefix}/login?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
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
        let errorMessage = error.message;
        try {
            const errorObj = JSON.parse(errorMessage);
            if (errorObj.detail) {
                errorMessage = errorObj.detail;
            }
        } catch (e) {
            // Not JSON, keep original message
        }

        if (errorBox && errorText) {
            errorText.textContent = errorMessage;
            errorBox.style.display = "flex";
        } else {
            alert(errorMessage);
        }
        resetButton();
    }

    function resetButton() {
        if (btn) { btn.disabled = false; }
        if (btnText) btnText.textContent = "Sign In";
        if (btnIcon) btnIcon.style.display = "inline-block";
        if (btnSpinner) btnSpinner.style.display = "none";
    }
}

function toggleLoginPassword(btn) {
    const passwordInput = document.getElementById("password");
    const icon = btn.querySelector("i");

    if (passwordInput.type === "password") {
        passwordInput.type = "text";
        // Switch to Eye Off icon
        if (icon) {
            icon.classList.remove("fa-eye");
            icon.classList.add("fa-eye-slash");
        }
    } else {
        passwordInput.type = "password";
        // Switch back to Eye icon
        if (icon) {
            icon.classList.remove("fa-eye-slash");
            icon.classList.add("fa-eye");
        }
    }
}

function showForgotPasswordModal(event) {
    if (event) event.preventDefault();
    Swal.fire({
        title: 'Password Reset',
        html: '<p style="color: #475569; font-size: 15px; margin-bottom: 10px;">For security reasons, self-service password resets are disabled.</p><p style="color: #475569; font-size: 15px;">Please contact your Department Administrator to receive a temporary password. If necessary, contact the Examination Cell or System Administrator.</p>',
        icon: 'info',
        confirmButtonText: 'Understood',
        confirmButtonColor: '#2563eb',
        background: '#ffffff',
        customClass: {
            title: 'swal2-title-custom',
            popup: 'swal2-popup-custom'
        },
        allowOutsideClick: () => {
            const popup = Swal.getPopup();
            popup.classList.remove('shake-modal');
            void popup.offsetWidth; // Trigger DOM reflow to restart animation
            popup.classList.add('shake-modal');
            
            const btn = Swal.getConfirmButton();
            btn.classList.remove('highlight-understood-btn');
            void btn.offsetWidth; // Trigger DOM reflow for button animation
            btn.classList.add('highlight-understood-btn');
            
            return false; // Prevent closing
        }
    });
}
