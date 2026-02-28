document.addEventListener("DOMContentLoaded", () => {
    requireAuth("student");
    // TODO: Implement a function to fetch and display available exams
    // loadAvailableExams(); 
});

async function startExam() {
    // This should be triggered by a button on a specific exam, not a prompt
    const exam_id = prompt("Enter exam ID to start:");
    if (!exam_id) return;

    try {
        const result = await apiRequest(
            `/student/exams/start?exam_id=${exam_id}`,
            "POST"
        );
        // TODO: Redirect to the exam attempt page
        alert(result.message);
        // window.location.href = `exam-attempt.html?exam_id=${exam_id}`;

    } catch (error) {
        alert("Failed to start exam: " + error.message);
    }
}