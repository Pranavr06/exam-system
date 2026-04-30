// frontend/js/proctoring-client.js

class ProctoringSystem {
    constructor(examId, studentId, examMode) {
        this.examId = examId;
        this.studentId = studentId;
        this.examMode = examMode; // "ONLINE" or "CENTER"
        
        this.videoElement = document.getElementById('proctor-video'); // Expects a specific video element
        this.screenVideoElement = null; // Background screen stream
        this.canvas = document.createElement('canvas');
        this.context = this.canvas.getContext('2d');
        
        this.isProctoringActive = false;
        this.proctorInterval = null;
        // Use dynamic backend URL or fallback to localhost
        this.apiEndpoint = (window.API_BASE_URL || 'http://localhost:8000') + '/proctor/detect';
        this.currentQuestionId = null;
        this.lastTabSwitch = 0;
    }

    async start() {
        if (this.examMode === "ONLINE" && !this.videoElement) {
            console.error("Proctoring video element with id 'proctor-video' not found.");
            alert("A critical UI component for proctoring is missing. Please contact support.");
            return;
        }

        this.isProctoringActive = true;
        this.setupSecurityListeners();

        if (this.examMode === "ONLINE") {
            try {
                this.videoElement.style.display = 'block'; // Force visible so browser decodes frames
                await this.initWebcam();
                await this.initScreenShare();
                // 1 frame per second interval
                this.proctorInterval = setInterval(() => this.captureAndSend("FRAME"), 1000);
            } catch (err) {
                this.stop();
                console.error("Webcam initialization failed:", err);
                alert("Webcam Error: " + err.message + "\n\nPlease ensure no other app (like Zoom/Teams) is using the camera, and that you have granted browser permissions.");
                window.location.href = 'student-dashboard.html';
            }
        } else if (this.examMode === "CENTER") {
            try {
                if (this.videoElement) this.videoElement.style.display = 'none';
                await this.initScreenShare();
                // No interval needed for CENTER mode, we only listen for TAB_SWITCH
            } catch (err) {
                this.stop();
                console.error("Screen share init error:", err);
                alert("Screen Share Error: " + err.message + "\n\nScreen sharing is strictly required for this center-based exam.");
                window.location.href = 'student-dashboard.html';
            }
        }
    }

    stop() {
        this.isProctoringActive = false;
        if (this.proctorInterval) {
            clearInterval(this.proctorInterval);
            this.proctorInterval = null;
        }
        if (this.screenVideoElement && this.screenVideoElement.srcObject) {
            this.screenVideoElement.srcObject.getTracks().forEach(track => track.stop());
            this.screenVideoElement.srcObject = null;
        }
        this.removeSecurityListeners();
    }

    async initWebcam() {
        try {
            // 1. Initial request to ensure permissions are granted and labels are readable
            let stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            
            // 2. Get all available cameras
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoCameras = devices.filter(device => device.kind === 'videoinput');
            
            // 3. Look for a genuine laptop/desktop webcam (ignore mobile links/virtual cams)
            let preferredDeviceId = null;
            for (let cam of videoCameras) {
                const label = cam.label.toLowerCase();
                if (!label.includes("phone") && !label.includes("mobile") && !label.includes("iphone") && !label.includes("android") && !label.includes("virtual") && !label.includes("obs")) {
                    preferredDeviceId = cam.deviceId;
                    break; // Found a physical desktop/laptop webcam
                }
            }

            // 4. Switch to the preferred physical camera if found
            if (preferredDeviceId) {
                stream.getTracks().forEach(track => track.stop());
                stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { deviceId: { exact: preferredDeviceId }, width: { ideal: 640 }, height: { ideal: 480 } }, 
                    audio: false 
                });
            }

            this.videoElement.srcObject = stream;
            await this.videoElement.play();
        } catch (err) {
            console.error("Webcam init error:", err);
            throw err;
        }
    }

    async initScreenShare() {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { displaySurface: "monitor" },
                audio: false
            });
            
            const track = stream.getVideoTracks()[0];
            const settings = track.getSettings();
            if (settings.displaySurface && settings.displaySurface !== "monitor") {
                track.stop();
                throw new Error("You MUST select 'Entire Screen'. Specific Windows or Tabs are not allowed for proctoring.");
            }
            
            this.screenVideoElement = document.createElement('video');
            this.screenVideoElement.srcObject = stream;
            this.screenVideoElement.muted = true;
            this.screenVideoElement.playsInline = true;
            await this.screenVideoElement.play();

            track.onended = () => {
                if (this.isProctoringActive) {
                    alert("Screen sharing was stopped. Your exam is terminating.");
                    this.stop();
                    if (typeof submitExam === 'function') submitExam(true, "Exam terminated due to screen share disconnect.");
                }
            };
        } catch (err) {
            console.error("Screen share init error:", err);
            throw new Error(err.message || "Screen sharing is strictly required for this exam.");
        }
    }

    showWarning(violations) {
        let warningMsg = "";
        let isCritical = false;
        
        if (violations.includes("NO_PERSON") || violations.includes("FOCUS_LOSS")) {
            warningMsg = "Face not detected or focus lost! Please stay in the frame.";
            isCritical = true;
        } else if (violations.includes("TAB_SWITCH")) {
            warningMsg = "Do not switch tabs or leave the exam window!";
            isCritical = true;
        } else if (violations.includes("MULTI_PERSON")) {
            warningMsg = "Multiple people detected in the frame!";
            isCritical = true;
        } else if (violations.includes("PHONE") || violations.includes("MOBILE_DETECTED")) {
            warningMsg = "Mobile phone detected!";
            isCritical = true;
        } else {
            return; 
        }

        // 1. Persistent Log inside the right panel
        const alertsList = document.getElementById('alerts-list');
        if (alertsList) {
            const alertCard = document.createElement('div');
            alertCard.className = `proctoring-alert ${isCritical ? 'danger' : 'warning'}`;
            const time = new Date().toLocaleTimeString();
            alertCard.innerHTML = `<strong>[${time}]</strong> ${warningMsg}`;
            alertsList.prepend(alertCard);
        }

        // 2. High-priority Toast Overlay (Top center)
        let toast = document.getElementById('proctor-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'proctor-toast';
            toast.style.cssText = `
                position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                background: var(--danger); color: white; padding: 12px 24px; border-radius: 8px;
                font-weight: bold; z-index: 10000; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                transition: opacity 0.3s;
            `;
            document.body.appendChild(toast);
        }
        
        toast.textContent = warningMsg;
        toast.style.opacity = '1';
        
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
    }

    setupSecurityListeners() {
        this.visibilityChangeHandler = () => {
            if (document.hidden && this.isProctoringActive) {
                this.captureAndSend("TAB_SWITCH");
            }
        };

        this.blurHandler = () => {
            if (this.isProctoringActive) {
                this.captureAndSend("TAB_SWITCH");
            }
        };

        document.addEventListener("visibilitychange", this.visibilityChangeHandler);
        window.addEventListener("blur", this.blurHandler);
    }

    removeSecurityListeners() {
        document.removeEventListener("visibilitychange", this.visibilityChangeHandler);
        window.removeEventListener("blur", this.blurHandler);
    }

    async captureAndSend(eventType) {
        if (!this.isProctoringActive) return;

        // Throttle TAB_SWITCH to prevent double uploads when both blur and visibilitychange fire
        if (eventType === "TAB_SWITCH") {
            const now = Date.now();
            if (now - this.lastTabSwitch < 3000) return; 
            this.lastTabSwitch = now;
        }

        const formData = new FormData();
        formData.append("exam_id", this.examId);
        formData.append("student_id", this.studentId);
        formData.append("exam_mode", this.examMode);
        formData.append("event_type", eventType);
        if (this.currentQuestionId) {
            formData.append("question_id", this.currentQuestionId);
        }

        // Capture Screen Evidence for BOTH Online (FRAME) and Center mode (TAB_SWITCH)
        if (this.screenVideoElement && this.screenVideoElement.readyState >= 2) {
            const sCanvas = document.createElement('canvas');
            const sCtx = sCanvas.getContext('2d');
            sCanvas.width = this.screenVideoElement.videoWidth || 1280;
            sCanvas.height = this.screenVideoElement.videoHeight || 720;
            sCtx.drawImage(this.screenVideoElement, 0, 0, sCanvas.width, sCanvas.height);
            
            const screenBlob = await new Promise(resolve => sCanvas.toBlob(resolve, 'image/jpeg', 0.6));
            if (screenBlob) {
                formData.append("evidence_image", screenBlob, "evidence.jpg");
            }
        }

        // Handle Webcam image exclusively for ONLINE mode
        if (this.examMode === "ONLINE" && this.videoElement && this.videoElement.readyState >= 2) {
            this.canvas.width = this.videoElement.videoWidth || 640;
            this.canvas.height = this.videoElement.videoHeight || 480;
            this.context.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);
            
            const blob = await new Promise(resolve => this.canvas.toBlob(resolve, 'image/jpeg', 0.7));
            if (blob) {
                formData.append("image", blob, "webcam.jpg");
            }
        }

        try {
            const token = localStorage.getItem('access_token');
            const response = await fetch(this.apiEndpoint, {
                method: "POST",
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `Server error: ${response.status}`);
            }

            const data = await response.json();

            // Blur or hide exam content if a major violation is detected
            const examContainer = document.querySelector('.exam-layout') || document.querySelector('.exam-container');
            const violations = data.violations || [];
            const shouldBlur = violations.includes("NO_PERSON") || violations.includes("TAB_SWITCH");

            if (shouldBlur) {
                if (examContainer) {
                    examContainer.style.filter = "blur(15px)";
                    examContainer.style.pointerEvents = "none";
                    examContainer.style.userSelect = "none";
                }
                
                // Auto-recover blur for TAB_SWITCH (critical for CENTER mode which has no 1-second interval)
                if (violations.includes("TAB_SWITCH")) {
                    setTimeout(() => {
                        if (examContainer) {
                            examContainer.style.filter = "none";
                            examContainer.style.pointerEvents = "auto";
                            examContainer.style.userSelect = "auto";
                        }
                    }, 3000);
                }
            } else {
                if (examContainer) {
                    examContainer.style.filter = "none";
                    examContainer.style.pointerEvents = "auto";
                    examContainer.style.userSelect = "auto";
                }
            }

            // Show real-time warnings to the student before termination happens
            if (violations.length > 0 && !data.terminate) {
                this.showWarning(violations);
            } else {
                const toast = document.getElementById('proctor-toast');
                if (toast) toast.style.opacity = '0'; // Clear toast instantly when back to normal
            }

            if (data.terminate) {
                this.stop();
                // The submitExam function should handle the final submission and redirection.
                if (typeof submitExam === 'function') {
                    submitExam(true, "Exam Terminated due to severe proctoring violations.");
                } else {
                    alert("Exam Terminated due to severe proctoring violations. You will be redirected.");
                    window.location.href = "student-dashboard.html";
                }
            }
        } catch (error) {
            console.error("Proctoring sync failed:", error);
        }
    }
}