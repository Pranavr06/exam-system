class IdleDetector {
    constructor(timeoutMinutes = 5) {
        this.timeoutMs = timeoutMinutes * 60 * 1000;
        this.lastActivity = Date.now();
        this.isModalVisible = false;
        this.checkInterval = null;

        this.initUI();
        this.bindEvents();
        this.startChecking();
    }

    bindEvents() {
        const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
        this.activityHandler = () => this.updateActivity();
        
        events.forEach(event => {
            document.addEventListener(event, this.activityHandler, { passive: true });
        });

        // Handle tab switching / returning to the window
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.checkIdle();
            }
        });
    }

    updateActivity() {
        // Only update activity if the modal is not currently blocking the screen
        if (!this.isModalVisible) {
            this.lastActivity = Date.now();
        }
    }

    startChecking() {
        // Check every second to accurately handle browser background throttling
        this.checkInterval = setInterval(() => this.checkIdle(), 1000);
    }

    checkIdle() {
        if (this.isModalVisible) return; // Prevent multiple popups stacking
        
        if (Date.now() - this.lastActivity >= this.timeoutMs) {
            this.showModal();
        }
    }

    initUI() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'idle-detector-overlay';
        this.overlay.style.cssText = `
            display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.6); z-index: 99999;
            align-items: center; justify-content: center; backdrop-filter: blur(3px);
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: white; padding: 25px 30px; border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3); text-align: center; max-width: 400px;
            font-family: Arial, sans-serif;
        `;

        const title = document.createElement('h3');
        title.textContent = 'Session Inactive';
        title.style.cssText = 'margin-top: 0; color: #2c3e50; font-size: 1.25rem;';

        const message = document.createElement('p');
        message.textContent = 'You have been inactive for a while. Do you want to extend your session or logout?';
        message.style.cssText = 'color: #4a5568; margin-bottom: 25px; line-height: 1.5; font-size: 0.95rem;';

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display: flex; gap: 15px; justify-content: center;';

        const extendBtn = document.createElement('button');
        extendBtn.textContent = 'Extend Session';
        extendBtn.style.cssText = `
            padding: 10px 20px; background: #3182ce; color: white; border: none;
            border-radius: 4px; cursor: pointer; font-weight: bold; transition: background 0.2s;
        `;
        extendBtn.onmouseover = () => extendBtn.style.background = '#2b6cb0';
        extendBtn.onmouseout = () => extendBtn.style.background = '#3182ce';
        extendBtn.onclick = () => this.extendSession();

        const logoutBtn = document.createElement('button');
        logoutBtn.textContent = 'Logout';
        logoutBtn.style.cssText = `
            padding: 10px 20px; background: #e2e8f0; color: #4a5568; border: none;
            border-radius: 4px; cursor: pointer; font-weight: bold; transition: background 0.2s;
        `;
        logoutBtn.onmouseover = () => logoutBtn.style.background = '#cbd5e0';
        logoutBtn.onmouseout = () => logoutBtn.style.background = '#e2e8f0';
        logoutBtn.onclick = () => {
            // Use the global logout function defined in auth.js
            if (typeof logout === 'function') logout();
        };

        btnContainer.appendChild(logoutBtn);
        btnContainer.appendChild(extendBtn);
        modal.appendChild(title);
        modal.appendChild(message);
        modal.appendChild(btnContainer);
        this.overlay.appendChild(modal);
        document.body.appendChild(this.overlay);
    }

    async extendSession() {
        try {
            // Refresh token via backend if apiRequest is available
            if (typeof apiRequest === 'function') {
                const res = await apiRequest('/auth/refresh', 'POST');
                if (res && res.access_token) localStorage.setItem('access_token', res.access_token);
            }
        } catch (error) {
            console.warn("Session refresh endpoint not found or failed. Extending local session only.", error);
        } finally {
            this.lastActivity = Date.now();
            this.isModalVisible = false;
            this.overlay.style.display = 'none';
        }
    }
}

// Initialize globally when the document loads (only if a user is logged in)
document.addEventListener("DOMContentLoaded", () => {
    if (localStorage.getItem('access_token')) {
        window.idleDetector = new IdleDetector(5); // 5 Minutes
    }
});