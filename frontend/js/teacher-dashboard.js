document.addEventListener("DOMContentLoaded", () => {
    requireAuth("teacher");
});

async function handleCreateExam(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Convert numeric strings to integers
    data.subject_id = parseInt(data.subject_id);
    data.duration = parseInt(data.duration);

    try {
        const result = await apiRequest("/teacher/exams/create", "POST", data);

        alert("Success: " + (result.message || "Exam created successfully"));
        form.reset();
    } catch (error) {
        console.error("API Error:", error);
        try {
            const errorObj = JSON.parse(error.message);
            alert("Error: " + (errorObj.detail || "Operation failed"));
        } catch (e) {
            alert("Error: " + error.message);
        }
    }
}