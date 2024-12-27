document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.querySelector('.login-form');
    const emailInput = loginForm.querySelector('input[name="email"]');
    const passwordInput = loginForm.querySelector('input[name="password"]');

    // Create error message elements
    const emailError = document.createElement('div');
    emailError.className = 'error-message';
    const passwordError = document.createElement('div');
    passwordError.className = 'error-message';

    // Insert error messages after inputs
    emailInput.parentNode.appendChild(emailError);
    passwordInput.parentNode.appendChild(passwordError);

    loginForm.addEventListener('submit', function(e) {
        let isValid = true;
        
        // Reset error messages
        emailError.textContent = '';
        passwordError.textContent = '';
        
        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailInput.value.trim()) {
            emailError.textContent = 'Email is required';
            isValid = false;
        } else if (!emailRegex.test(emailInput.value.trim())) {
            emailError.textContent = 'Please enter a valid email address';
            isValid = false;
        }

        // Password validation
        if (!passwordInput.value) {
            passwordError.textContent = 'Password is required';
            isValid = false;
        } else if (passwordInput.value.length < 6) {
            passwordError.textContent = 'Password must be at least 6 characters long';
            isValid = false;
        }

        if (!isValid) {
            e.preventDefault();
        }
    });

    // Real-time validation
    emailInput.addEventListener('input', function() {
        emailError.textContent = '';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (this.value.trim() && !emailRegex.test(this.value.trim())) {
            emailError.textContent = 'Please enter a valid email address';
        }
    });

    passwordInput.addEventListener('input', function() {
        passwordError.textContent = '';
        if (this.value && this.value.length < 6) {
            passwordError.textContent = 'Password must be at least 6 characters long';
        }
    });
});
