        const createUserForm = document.getElementById('createUserForm');
        const fullNameInput = document.getElementById('fullName');
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirmPassword');
        const submitBtn = document.getElementById('submitBtn');
        const errorMessage = document.getElementById('errorMessage');
        const successMessage = document.getElementById('successMessage');
        const spinner = document.getElementById('spinner');
        const btnText = document.getElementById('btnText');
        const formSection = document.getElementById('formSection');
        const authError = document.getElementById('authError');

        // ─── CHECK AUTHENTICATION ON LOAD ───────────────────────────────
        window.addEventListener('load', () => {
            const token = localStorage.getItem('token');
            const userStr = localStorage.getItem('user');

            if (!token || !userStr) {
                // Not logged in
                authError.style.display = 'block';
                formSection.style.display = 'none';
                return;
            }

            // Logged in — show form and user info
            formSection.style.display = 'block';
            authError.style.display = 'none';

            try {
                const user = JSON.parse(userStr);
                document.getElementById('currentUserName').textContent = user.fullName || user.email;
                document.getElementById('userRole').textContent = user.role;
            } catch (err) {
                console.error('Error parsing user:', err);
            }

            fullNameInput.focus();
        });

        // ─── PASSWORD VALIDATION ON INPUT ───────────────────────────────
        passwordInput.addEventListener('input', validatePassword);

        function validatePassword() {
            const password = passwordInput.value;

            // Check length (8+)
            const lengthReq = document.getElementById('lengthReq');
            if (password.length >= 8) {
                lengthReq.classList.remove('unmet');
                lengthReq.classList.add('met');
                lengthReq.innerHTML = '<span class="requirement-icon">✓</span>At least 8 characters';
            } else {
                lengthReq.classList.remove('met');
                lengthReq.classList.add('unmet');
                lengthReq.innerHTML = '<span class="requirement-icon">✗</span>At least 8 characters';
            }

            // Check uppercase
            const upperReq = document.getElementById('upperReq');
            if (/[A-Z]/.test(password)) {
                upperReq.classList.remove('unmet');
                upperReq.classList.add('met');
                upperReq.innerHTML = '<span class="requirement-icon">✓</span>At least one uppercase letter';
            } else {
                upperReq.classList.remove('met');
                upperReq.classList.add('unmet');
                upperReq.innerHTML = '<span class="requirement-icon">✗</span>At least one uppercase letter';
            }

            // Check number
            const numberReq = document.getElementById('numberReq');
            if (/[0-9]/.test(password)) {
                numberReq.classList.remove('unmet');
                numberReq.classList.add('met');
                numberReq.innerHTML = '<span class="requirement-icon">✓</span>At least one number';
            } else {
                numberReq.classList.remove('met');
                numberReq.classList.add('unmet');
                numberReq.innerHTML = '<span class="requirement-icon">✗</span>At least one number';
            }
        }

        // ─── FORM SUBMISSION ───────────────────────────────────────────
        createUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            errorMessage.style.display = 'none';
            successMessage.style.display = 'none';

            const fullName = fullNameInput.value.trim();
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            // Validation
            if (!fullName || !email || !password || !confirmPassword) {
                showError('Please fill in all fields');
                return;
            }

            if (password !== confirmPassword) {
                showError('Passwords do not match');
                confirmPasswordInput.focus();
                return;
            }

            if (password.length < 8) {
                showError('Password must be at least 8 characters');
                return;
            }

            if (!/[A-Z]/.test(password)) {
                showError('Password must contain at least one uppercase letter');
                return;
            }

            if (!/[0-9]/.test(password)) {
                showError('Password must contain at least one number');
                return;
            }

            // Get token from localStorage
            const token = localStorage.getItem('token');
            if (!token) {
                showError('No authentication token found. Please log in again.');
                return;
            }

            // Disable button and show spinner
            submitBtn.disabled = true;
            spinner.style.display = 'inline-block';
            btnText.textContent = 'Creating...';

            try {
                const response = await fetch('/api/auth/create_user', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`  // ← Send JWT in header
                    },
                    body: JSON.stringify({ fullName, email, password }),
                });

                const data = await response.json();

                if (!response.ok) {
                    showError(data.error || 'Failed to create user');
                    resetButton();
                    return;
                }

                // Success!
                showSuccess(`✓ User "${fullName}" created successfully!`);
                
                // Reset form
                createUserForm.reset();
                validatePassword(); // Reset password requirements display
                resetButton();

                // Optional: Redirect after delay
                setTimeout(() => {
                    window.location.href = '/index.html';
                }, 2000);

            } catch (err) {
                console.error('Create user error:', err);
                showError('Network error. Please check your connection.');
                resetButton();
            }
        });

        // ─── HELPER FUNCTIONS ───────────────────────────────────────────
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
            btnText.textContent = 'Create User';
        }

        function logout() {
            if (confirm('Are you sure you want to log out?')) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login.html';
            }
        }

        function goBack() {
            window.location.href = '/dashboard.html';
        }
