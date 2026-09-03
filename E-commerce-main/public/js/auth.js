import { app, db } from './firebase-config.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { translations } from './translations.js';

document.addEventListener('DOMContentLoaded', () => {
    const auth = getAuth(app);
    let isLoginMode = true;

    // DOM Elements
    const form = document.getElementById('auth-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const forgotPasswordContainer = document.getElementById('forgot-password-container');
    const forgotPasswordBtn = document.getElementById('forgot-password-btn');
    
    const registerFieldsContainer = document.getElementById('register-fields');
    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');
    const phoneInput = document.getElementById('phone');
    const addressInput = document.getElementById('address');
    const cityInput = document.getElementById('city');
    const countryInput = document.getElementById('country');
    const postalCodeInput = document.getElementById('postalCode');
    
    const allRegisterInputs = [firstNameInput, lastNameInput, phoneInput, addressInput, cityInput, countryInput, postalCodeInput];

    const titleEl = document.getElementById('auth-title');
    const subtitleEl = document.getElementById('auth-subtitle');
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleBtn = document.getElementById('toggle-mode-btn');
    const togglePrefix = document.getElementById('toggle-text-prefix');
    const errorContainer = document.getElementById('auth-error');

    // Toggle Mode Listener
    toggleBtn.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        
        form.reset();
        hideError();

        if (isLoginMode) {
            const currentLang = localStorage.getItem('aura_lang') || 'en';
            titleEl.textContent = translations[currentLang]?.auth?.sign_in_title || translations['en'].auth.sign_in_title;
            subtitleEl.textContent = translations[currentLang]?.auth?.sign_in_subtitle || translations['en'].auth.sign_in_subtitle;
            submitBtn.textContent = translations[currentLang]?.auth?.sign_in_btn || translations['en'].auth.sign_in_btn;
            togglePrefix.textContent = translations[currentLang]?.auth?.no_account || translations['en'].auth.no_account;
            toggleBtn.textContent = translations[currentLang]?.auth?.create_one || translations['en'].auth.create_one;
            
            registerFieldsContainer.classList.add('hidden');
            registerFieldsContainer.classList.remove('flex');
            allRegisterInputs.forEach(input => {
                if (input) input.removeAttribute('required');
            });
            
            forgotPasswordContainer.classList.remove('hidden');
        } else {
            const currentLang = localStorage.getItem('aura_lang') || 'en';
            titleEl.textContent = currentLang === 'el' ? 'Δημιουργία Λογαριασμού' : 'Create Account';
            subtitleEl.textContent = currentLang === 'el' ? 'Γίνετε μέλος της AURA για μια απρόσκοπτη εμπειρία.' : 'Join AURA for a seamless experience.';
            submitBtn.textContent = currentLang === 'el' ? 'Δημιουργία Λογαριασμού' : 'Create Account';
            togglePrefix.textContent = currentLang === 'el' ? 'Έχετε ήδη λογαριασμό;' : 'Already have an account?';
            toggleBtn.textContent = currentLang === 'el' ? 'Σύνδεση' : 'Sign in';
            
            registerFieldsContainer.classList.remove('hidden');
            registerFieldsContainer.classList.add('flex');
            allRegisterInputs.forEach(input => {
                if (input) input.setAttribute('required', 'true');
            });
            
            forgotPasswordContainer.classList.add('hidden');
        }
    });

    forgotPasswordBtn.addEventListener('click', async () => {
        hideError();
        const email = emailInput.value.trim();
        const currentLang = localStorage.getItem('aura_lang') || 'en';
        
        if (!email) {
            const emptyEmailMsg = currentLang === 'el' 
                ? "Παρακαλούμε εισάγετε τη διεύθυνση email σας στο παραπάνω πεδίο για να επαναφέρετε τον κωδικό σας." 
                : "Please enter your email address in the field above to reset your password.";
            showError(emptyEmailMsg);
            return;
        }

        const originalText = forgotPasswordBtn.textContent;
        forgotPasswordBtn.textContent = currentLang === 'el' ? 'Αποστολή...' : 'Sending...';
        forgotPasswordBtn.disabled = true;

        try {
            await sendPasswordResetEmail(auth, email);
        } catch (error) {
            console.error("Password Reset Event Triggered");
        } finally {
            // Generic message to prevent enumeration
            const successMsg = currentLang === 'el' 
                ? "Εάν υπάρχει λογαριασμός με αυτό το email, έχει σταλεί ένας σύνδεσμος επαναφοράς." 
                : "If an account exists with this email, a reset link has been sent.";
            showSuccess(successMsg);
            forgotPasswordBtn.textContent = originalText;
            forgotPasswordBtn.disabled = false;
        }
    });

    // Form Submission & Backend Validation
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();

        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const currentLang = localStorage.getItem('aura_lang') || 'en';

        if (!isLoginMode) {
            const nameRegex = /^[a-zA-Zα-ωΑ-ΩάέήίόύώΆΈΉΊΌΎΏ\s]+$/;
            const phoneRegex = /^\+?\d+$/;

            if (!nameRegex.test(firstNameInput.value.trim())) {
                showError(currentLang === 'el' ? "Το όνομα μπορεί να περιέχει μόνο γράμματα." : "First name can only contain letters.");
                return;
            }
            if (!nameRegex.test(lastNameInput.value.trim())) {
                showError(currentLang === 'el' ? "Το επώνυμο μπορεί να περιέχει μόνο γράμματα." : "Last name can only contain letters.");
                return;
            }
            if (!phoneRegex.test(phoneInput.value.trim())) {
                showError(currentLang === 'el' ? "Ο αριθμός τηλεφώνου μπορεί να περιέχει μόνο αριθμούς και προαιρετικά το σύμβολο '+' στην αρχή." : "Phone number can only contain numbers and an optional leading '+'.");
                return;
            }
            if (password.length <= 6) {
                showError(currentLang === 'el' ? "Ο κωδικός πρόσβασης πρέπει να είναι μεγαλύτερος από 6 χαρακτήρες." : "Password must be greater than 6 characters.");
                return;
            }
        }

        const originalBtnText = submitBtn.textContent;
        submitBtn.textContent = currentLang === 'el' ? 'Επεξεργασία...' : 'Processing...';
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-70', 'cursor-not-allowed');

        try {
            if (isLoginMode) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                const phoneToCheck = phoneInput.value.trim();
                
                // 1. Check Phone Number Uniqueness securely via backend
                try {
                    const phoneCheckRes = await fetch('/api/check-phone', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone: phoneToCheck })
                    });
                    
                    if (!phoneCheckRes.ok) throw new Error('Phone check failed');
                    
                    const phoneCheckData = await phoneCheckRes.json();
                    
                    if (phoneCheckData.exists) {
                        const phoneExistsError = translations[currentLang]?.auth?.error_phone_exists || 
                            (currentLang === 'el' ? 'Αυτός ο αριθμός τηλεφώνου χρησιμοποιείται ήδη από άλλον λογαριασμό.' : 'This phone number is already in use by another account.');
                        
                        showError(phoneExistsError);
                        submitBtn.textContent = originalBtnText;
                        submitBtn.disabled = false;
                        submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
                        return;
                    }
                } catch (phoneCheckError) {
                    console.error("Error verifying phone uniqueness:", phoneCheckError);
                    showError(currentLang === 'el' ? "Προέκυψε σφάλμα κατά τον έλεγχο ασφαλείας. Παρακαλώ δοκιμάστε ξανά." : "A security check error occurred. Please try again.");
                    submitBtn.textContent = originalBtnText;
                    submitBtn.disabled = false;
                    submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
                    return;
                }

                // 2. Google reCAPTCHA v3 Verification
                let token;
                try {
                    token = await new Promise((resolve, reject) => {
                        if (typeof grecaptcha === 'undefined') {
                            reject(new Error('reCAPTCHA not loaded'));
                            return;
                        }
                        grecaptcha.ready(() => {
                            grecaptcha.execute('6Lcp654tAAAAAIE9s-4N5ThVCBKZwkxsBOnHxm-7', { action: 'register' })
                                .then(resolve)
                                .catch(reject);
                        });
                    });
                } catch (recaptchaError) {
                    console.error("reCAPTCHA generation failed:", recaptchaError);
                    showError(currentLang === 'el' ? "Αποτυχία φόρτωσης reCAPTCHA. Απενεργοποιήστε τυχόν adblockers." : "reCAPTCHA failed to load. Please disable adblockers.");
                    submitBtn.textContent = originalBtnText;
                    submitBtn.disabled = false;
                    submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
                    return;
                }

                const captchaRes = await fetch('/api/verify-captcha', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                const captchaData = await captchaRes.json();
                
                if (!captchaData.success) {
                    showError(currentLang === 'el' ? "Η επαλήθευση ασφαλείας απέτυχε. Παρακαλώ δοκιμάστε ξανά." : "Security validation failed. Please try again.");
                    submitBtn.textContent = originalBtnText;
                    submitBtn.disabled = false;
                    submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
                    return;
                }

                // 3. Create User in Firebase Auth
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // 4. Create User Document in Firestore
                await setDoc(doc(db, "users", user.uid), {
                    firstName: firstNameInput.value.trim(),
                    lastName: lastNameInput.value.trim(),
                    phone: phoneToCheck,
                    address: addressInput.value.trim(),
                    city: cityInput.value.trim(),
                    country: countryInput.value,
                    postalCode: postalCodeInput.value.trim(),
                    email: email,
                    cart: [], 
                    role: "customer",
                    createdAt: new Date().toISOString()
                });

                // 5. Send Welcome Email via EmailJS REST API
                try {
                    const emailPayload = {
                        service_id: "service_c24ml8x",
                        template_id: "template_y5ko9jj",
                        user_id: "VjioTcL168a56Y0fO",
                        template_params: {
                            user_name: firstNameInput.value.trim(),
                            user_email: email
                        }
                    };

                    await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(emailPayload)
                    });
                } catch (emailError) {
                    console.error("Failed to send welcome email:", emailError);
                }
            }
            
            // Redirect after successful login/registration
            window.location.href = 'index.html';

        } catch (error) {
            console.error("Authentication Error:", error);
            showError(getFriendlyErrorMessage(error.code));
            submitBtn.textContent = originalBtnText;
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
        }
    });

    function showError(message) {
        errorContainer.textContent = message;
        errorContainer.className = "mb-6 p-4 bg-red-50 border border-red-100 text-red-600 text-sm font-sans rounded-sm text-center";
        errorContainer.classList.remove('hidden');
    }

    function showSuccess(message) {
        errorContainer.textContent = message;
        errorContainer.className = "mb-6 p-4 bg-green-50 border border-green-100 text-green-600 text-sm font-sans rounded-sm text-center";
        errorContainer.classList.remove('hidden');
    }

    function hideError() {
        errorContainer.textContent = '';
        errorContainer.className = "hidden mb-6 p-4 text-sm font-sans rounded-sm text-center";
    }

    function getFriendlyErrorMessage(errorCode) {
        const currentLang = localStorage.getItem('aura_lang') || 'en';
        const isEl = currentLang === 'el';

        switch (errorCode) {
            case 'auth/invalid-email': 
                return isEl ? 'Παρακαλώ εισάγετε μια έγκυρη διεύθυνση email.' : 'Please enter a valid email address.';
            case 'auth/user-disabled': 
                return isEl ? 'Αυτός ο λογαριασμός έχει απενεργοποιηθεί από τον διαχειριστή.' : 'This account has been disabled by an administrator.';
            case 'auth/user-not-found': 
                return isEl ? 'Μη έγκυρο email ή κωδικός πρόσβασης. Παρακαλώ δοκιμάστε ξανά.' : 'Invalid email or password. Please try again.';
            case 'auth/wrong-password': 
                return isEl ? 'Μη έγκυρο email ή κωδικός πρόσβασης. Παρακαλώ δοκιμάστε ξανά.' : 'Invalid email or password. Please try again.';
            case 'auth/invalid-credential':
                return isEl ? 'Μη έγκυρο email ή κωδικός πρόσβασης. Παρακαλώ δοκιμάστε ξανά.' : 'Invalid email or password. Please try again.';
            case 'auth/email-already-in-use': 
                return isEl ? 'Υπάρχει ήδη λογαριασμός με αυτήν τη διεύθυνση email.' : 'An account already exists with this email address.';
            case 'auth/weak-password': 
                return isEl ? 'Ο κωδικός πρόσβασής σας πρέπει να έχει μήκος τουλάχιστον 6 χαρακτήρες.' : 'Your password must be at least 6 characters long.';
            case 'auth/missing-password':
                return isEl ? 'Παρακαλώ εισάγετε τον κωδικό πρόσβασής σας.' : 'Please enter your password.';
            case 'auth/network-request-failed':
                return isEl ? 'Σφάλμα δικτύου. Παρακαλώ ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.' : 'Network error. Please check your connection and try again.';
            default: 
                return isEl ? 'Προέκυψε ένα απροσδόκητο σφάλμα. Παρακαλώ δοκιμάστε ξανά αργότερα.' : 'An unexpected error occurred. Please try again later.';
        }
    }
});
