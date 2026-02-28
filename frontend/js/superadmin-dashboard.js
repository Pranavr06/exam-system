document.addEventListener("DOMContentLoaded", () => {
    requireAuth("super_admin");
});

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
}

// Generic Form Handler
async function handleFormSubmit(event, endpoint) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Convert numeric strings to integers
    if (data.department_id) {
        data.department_id = parseInt(data.department_id);
    }

    try {
        // The create department endpoint expects { "name": "value" }
        const body = endpoint.includes('departments') ? { name: data.name } : data;
        
        const result = await apiRequest(endpoint, "POST", body);

        alert("Success: " + (result.message || "Operation completed"));
        form.reset();
    } catch (error) {
        console.error("API Error:", error);
        try {
            const errorObj = JSON.parse(error.message);
            let msg = errorObj.detail || "Operation failed";
            if (typeof msg === 'object') {
                msg = JSON.stringify(msg);
            }
            alert("Error: " + msg);
        } catch (e) {
            alert("Error: " + error.message);
        }
    }
}