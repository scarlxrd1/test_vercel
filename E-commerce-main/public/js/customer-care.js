import { app, db } from './firebase-config.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, addDoc, serverTimestamp, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const auth = getAuth(app);
    let currentUser = null;

    const supportForm = document.getElementById('support-form');
    const guestFields = document.getElementById('guest-fields');
    
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const phoneInput = document.getElementById('phone');
    const issueTypeInput = document.getElementById('issue-type');
    const messageInput = document.getElementById('message');
    const submitBtn = document.getElementById('submit-support-btn');

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            guestFields.classList.add('hidden');
            guestFields.classList.remove('flex');
            nameInput.removeAttribute('required');
            emailInput.removeAttribute('required');
            phoneInput.removeAttribute('required');
        } else {
            currentUser = null;
            guestFields.classList.remove('hidden');
            guestFields.classList.add('flex');
            nameInput.setAttribute('required', 'true');
            emailInput.setAttribute('required', 'true');
            phoneInput.setAttribute('required', 'true');
        }
    });

    supportForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Submitting Request...';
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-70', 'cursor-not-allowed');

        try {
            // Generate reCAPTCHA v3 token dynamically
            let token;
            try {
                token = await new Promise((resolve, reject) => {
                    if (typeof grecaptcha === 'undefined') {
                        reject(new Error('reCAPTCHA not loaded'));
                        return;
                    }
                    grecaptcha.ready(() => {
                        grecaptcha.execute('6Lcp654tAAAAAIE9s-4N5ThVCBKZwkxsBOnHxm-7', { action: 'support_ticket' })
                            .then(resolve)
                            .catch(reject);
                    });
                });
            } catch (recaptchaError) {
                console.error("reCAPTCHA generation failed:", recaptchaError);
                alert("reCAPTCHA failed to load. Please disable adblockers and try again.");
                submitBtn.textContent = originalText;
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
                alert("Security check failed. Please try again.");
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
                return;
            }

            let ticketPayload = {
                issueType: issueTypeInput.value,
                message: messageInput.value.trim(),
                timestamp: serverTimestamp()
            };

            if (currentUser) {
                const userDocRef = doc(db, "users", currentUser.uid);
                const userDocSnap = await getDoc(userDocRef);
                
                if (userDocSnap.exists()) {
                    const data = userDocSnap.data();
                    const fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'No Name Provided';
                    
                    ticketPayload = {
                        ...ticketPayload,
                        isRegistered: true,
                        userId: currentUser.uid,
                        senderName: fullName,
                        senderEmail: data.email || currentUser.email,
                        senderPhone: data.phone || 'N/A',
                        senderAddress: `${data.address || ''}, ${data.city || ''}, ${data.country || ''}`.replace(/^, | , $/g, '').trim() || 'N/A'
                    };
                } else {
                    ticketPayload = {
                        ...ticketPayload,
                        isRegistered: true,
                        userId: currentUser.uid,
                        senderName: 'Registered User',
                        senderEmail: currentUser.email,
                        senderPhone: 'N/A',
                        senderAddress: 'N/A'
                    };
                }
            } else {
                ticketPayload = {
                    ...ticketPayload,
                    isRegistered: false,
                    senderName: nameInput.value.trim(),
                    senderEmail: emailInput.value.trim(),
                    senderPhone: phoneInput.value.trim(),
                    senderAddress: 'Guest (No Address)'
                };
            }

            await addDoc(collection(db, "support_tickets"), ticketPayload);
            alert("Your request has been successfully submitted. Our team will contact you shortly.");
            supportForm.reset();

        } catch (error) {
            console.error("Error submitting support ticket:", error);
            alert("An error occurred while submitting your request. Please try again.");
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
        }
    });
});
