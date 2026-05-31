        const loginForm = document.getElementById('loginForm');
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const submitBtn = document.getElementById('submitBtn');
        const errorMessage = document.getElementById('errorMessage');
        const successMessage = document.getElementById('successMessage');
        const spinner = document.getElementById('spinner');
        const btnText = document.getElementById('btnText');

        // ─── FORM SUBMISSION ───────────────────────────────────────
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Clear previous messages
            errorMessage.style.display = 'none';
            successMessage.style.display = 'none';

            const email = emailInput.value.trim();
            const password = passwordInput.value;

            // Simple validation
            if (!email || !password) {
                showError('Please fill in all fields');
                return;
            }

            // Disable button and show spinner
            submitBtn.disabled = true;
            spinner.style.display = 'inline-block';
            btnText.textContent = 'Logging in...';

            try {
                // POST to your backend /api/auth/login endpoint
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email, password }),
                });

                const data = await response.json();

                if (!response.ok) {
                    // Backend returned an error (4xx, 5xx)
                    showError(data.error || 'Login failed. Please try again.');
                    resetButton();
                    return;
                }

                // Success! Store JWT token
                if (data.token) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));

                    showSuccess('Login successful! Redirecting...');
                    
                    // Redirect to dashboard after brief delay
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 1000);
                } else {
                    showError('No token received from server');
                    resetButton();
                }

            } catch (err) {
                console.error('Login error:', err);
                showError('Network error. Please check your connection and try again.');
                resetButton();
            }
        });

        // ─── HELPER FUNCTIONS ───────────────────────────────────────
        function showError(message) {
            errorMessage.textContent = message;
            errorMessage.style.display = 'block';
        }

        function showSuccess(message) {
            successMessage.textContent = message;
            successMessage.style.display = 'block';
        }

        function resetButton() {
            submitBtn.disabled = false;
            spinner.style.display = 'none';
            btnText.textContent = 'Login';
        }

        // ─── AUTO-FOCUS EMAIL ON LOAD ───────────────────────────────
        window.addEventListener('load', () => {
            emailInput.focus();
        });
