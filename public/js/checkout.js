import { app, db } from './firebase-config.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { translations } from './translations.js';
import { escapeHTML } from './sanitize.js';

document.addEventListener('DOMContentLoaded', () => {
    const auth = getAuth(app);
    let currentUser = null;
    let checkoutCart = [];
    
    let selectedPaymentMethod = 'card';
    const COD_FEE = 2.50;

    const autofillContainer = document.getElementById('autofill-container');
    const autofillToggle = document.getElementById('autofill-toggle');
    const errorContainer = document.getElementById('checkout-error');
    
    const fnInput = document.getElementById('checkout-fn');
    const lnInput = document.getElementById('checkout-ln');
    const emailInput = document.getElementById('checkout-email');
    const addressInput = document.getElementById('checkout-address');
    const cityInput = document.getElementById('checkout-city');
    const countryInput = document.getElementById('checkout-country');
    const zipInput = document.getElementById('checkout-zip');
    const phoneInput = document.getElementById('checkout-phone');
    
    const invoiceToggle = document.getElementById('invoice-toggle');
    const invoiceFieldsContainer = document.getElementById('invoice-fields-container');
    const vatInput = document.getElementById('checkout-vat');
    const taxOfficeInput = document.getElementById('checkout-tax-office');
    const companyNameInput = document.getElementById('checkout-company-name');
    const activityInput = document.getElementById('checkout-activity');
    const invoiceInputs = [vatInput, taxOfficeInput, companyNameInput, activityInput];

    const checkoutForm = document.getElementById('checkout-form');
    const submitBtn = document.getElementById('submit-checkout-btn');
    
    const paymentRadios = document.querySelectorAll('input[name="payment_method"]');
    const codFeeRow = document.getElementById('cod-fee-row');
    const subtotalEl = document.getElementById('checkout-subtotal');
    const totalEl = document.getElementById('checkout-total');

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            autofillContainer.classList.remove('hidden');
            autofillContainer.classList.add('flex');
            await loadCheckoutCart(user);
        } else {
            currentUser = null;
            autofillContainer.classList.add('hidden');
            autofillContainer.classList.remove('flex');
            await loadCheckoutCart(null);
        }
    });

    async function loadCheckoutCart(user) {
        if (user) {
            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) {
                    checkoutCart = userDoc.data().cart || [];
                }
            } catch (error) {
                console.error("Error fetching user cart for checkout:", error);
            }
        } else {
            checkoutCart = JSON.parse(localStorage.getItem('aura_cart')) || [];
        }
        renderCheckoutSummary(checkoutCart);
    }

    window.updateCheckoutCartQty = async function(index, change) {
        const item = checkoutCart[index];
        const newQty = item.quantity + change;
        
        if (newQty <= 0) {
            checkoutCart.splice(index, 1);
        } else if (newQty <= (item.stock || 0)) {
            item.quantity = newQty;
        }
        
        if (currentUser) {
            try {
                const userRef = doc(db, "users", currentUser.uid);
                await updateDoc(userRef, { cart: checkoutCart });
            } catch (error) {
                console.error("Error updating cart quantity:", error);
            }
        } else {
            localStorage.setItem('aura_cart', JSON.stringify(checkoutCart));
        }
        
        renderCheckoutSummary(checkoutCart);
        
        if (typeof window.syncGlobalCart === 'function') {
            window.syncGlobalCart(checkoutCart);
        }
    };

    function renderCheckoutSummary(cartItems) {
        const container = document.getElementById('checkout-items-container');
        
        if (cartItems.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8">
                    <p class="text-stone-500 font-sans text-sm mb-4">Your cart is currently empty.</p>
                    <a href="collection.html" class="font-sans text-xs tracking-widest uppercase border-b border-stone-900 text-stone-900 pb-1 hover:text-stone-600 transition-colors">Return to Shop</a>
                </div>
            `;
            subtotalEl.textContent = '€0';
            totalEl.textContent = '€0';
            
            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
            submitBtn.textContent = 'Cart is empty';
            return;
        }

        let html = '';
        let cartTotal = 0;

        cartItems.forEach((item, index) => {
            const itemTotal = item.price * item.quantity;
            cartTotal += itemTotal;
            const disablePlus = item.quantity >= (item.stock || 0);
            
            html += `
                <div class="flex items-center gap-5">
                    <div class="relative flex-shrink-0 overflow-visible">
                        <div class="w-16 h-20 bg-stone-100 rounded-sm overflow-hidden border border-stone-200">
                            <img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.title)}" class="w-full h-full object-cover">
                        </div>
                        <span class="absolute -top-2 -right-2 w-5 h-5 bg-stone-900 text-white text-[11px] font-medium rounded-full flex items-center justify-center z-20 shadow-sm pointer-events-none">${escapeHTML(item.quantity)}</span>
                    </div>
                    <div class="flex-1 flex justify-between items-center">
                        <div class="flex flex-col">
                            <h4 class="font-serif text-stone-900 text-sm md:text-base">${escapeHTML(item.title)}</h4>
                            <p class="font-sans text-stone-500 text-xs mt-1">€${escapeHTML(item.price.toLocaleString())} each</p>
                            <div class="flex items-center gap-3 mt-2">
                                <button onclick="window.updateCheckoutCartQty(${index}, -1)" type="button" class="w-6 h-6 flex items-center justify-center border border-stone-300 text-stone-500 hover:text-stone-900 hover:border-stone-900 rounded-sm transition-colors">-</button>
                                <span class="font-sans text-sm text-stone-900 w-4 text-center">${escapeHTML(item.quantity)}</span>
                                <button onclick="window.updateCheckoutCartQty(${index}, 1)" type="button" class="w-6 h-6 flex items-center justify-center border border-stone-300 text-stone-500 hover:text-stone-900 hover:border-stone-900 rounded-sm transition-colors ${disablePlus ? 'opacity-50 cursor-not-allowed' : ''}" ${disablePlus ? 'disabled' : ''}>+</button>
                            </div>
                        </div>
                        <div class="font-sans text-stone-900 text-sm font-medium ml-4">
                            €${escapeHTML(itemTotal.toLocaleString())}
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        subtotalEl.textContent = `€${cartTotal.toLocaleString()}`;
        
        submitBtn.disabled = false;
        submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        
        updateTotals(cartTotal);
    }

    function updateTotals(baseCartTotal) {
        if (baseCartTotal === undefined) {
            baseCartTotal = checkoutCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        }
        
        const currentLang = localStorage.getItem('aura_lang') || 'en';
        let finalTotal = baseCartTotal;

        if (selectedPaymentMethod === 'cod') {
            finalTotal += COD_FEE;
            codFeeRow.classList.remove('hidden');
            codFeeRow.classList.add('flex');
            submitBtn.textContent = translations[currentLang]?.checkout?.place_order_btn || translations['en'].checkout.place_order_btn;
        } else {
            codFeeRow.classList.add('hidden');
            codFeeRow.classList.remove('flex');
            submitBtn.textContent = translations[currentLang]?.checkout?.pay_with_card_btn || translations['en'].checkout.pay_with_card_btn;
        }

        totalEl.textContent = `€${finalTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    paymentRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            selectedPaymentMethod = e.target.value;
            updateTotals();
        });
    });

    invoiceToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            invoiceFieldsContainer.classList.remove('hidden');
            invoiceInputs.forEach(input => input.setAttribute('required', 'true'));
        } else {
            invoiceFieldsContainer.classList.add('hidden');
            invoiceInputs.forEach(input => {
                input.removeAttribute('required');
                input.value = ''; 
            });
        }
    });

    autofillToggle.addEventListener('change', async (e) => {
        if (e.target.checked && currentUser) {
            try {
                const userDoc = await getDoc(doc(db, "users", currentUser.uid));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    fnInput.value = data.firstName || '';
                    lnInput.value = data.lastName || '';
                    emailInput.value = data.email || currentUser.email || '';
                    phoneInput.value = data.phone || '';

                    if (data.addresses && data.addresses.length > 0) {
                        const defaultAddress = data.addresses.find(a => a.isDefault) || data.addresses[0];
                        addressInput.value = defaultAddress.street || '';
                        cityInput.value = defaultAddress.city || '';
                        countryInput.value = defaultAddress.country || '';
                        zipInput.value = defaultAddress.zip || '';
                    } else {
                        addressInput.value = data.address || '';
                        cityInput.value = data.city || '';
                        countryInput.value = data.country || '';
                        zipInput.value = data.postalCode || data.zip || '';
                    }
                }
            } catch (error) {
                console.error("Error fetching user data for autofill:", error);
            }
        } else {
            fnInput.value = '';
            lnInput.value = '';
            emailInput.value = '';
            phoneInput.value = '';
            addressInput.value = '';
            cityInput.value = '';
            countryInput.value = '';
            zipInput.value = '';
        }
    });

    function showError(message) {
        errorContainer.textContent = message;
        errorContainer.classList.remove('hidden');
        errorContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function hideError() {
        errorContainer.textContent = '';
        errorContainer.classList.add('hidden');
    }

    async function clearCart() {
        checkoutCart = [];
        if (currentUser) {
            try {
                await updateDoc(doc(db, "users", currentUser.uid), { cart: [] });
            } catch (error) {
                console.error("Error clearing user cart:", error);
            }
        } else {
            localStorage.removeItem('aura_cart');
        }
        if (typeof window.syncGlobalCart === 'function') {
            window.syncGlobalCart([]);
        }
    }

    checkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();

        const nameRegex = /^[a-zA-Zα-ωΑ-ΩάέήίόύώΆΈΉΊΌΎΏ\s]+$/;
        const phoneRegex = /^\+?\d+$/;

        if (!nameRegex.test(fnInput.value.trim())) {
            showError("First name can only contain letters.");
            return;
        }
        if (!nameRegex.test(lnInput.value.trim())) {
            showError("Last name can only contain letters.");
            return;
        }
        if (!phoneRegex.test(phoneInput.value.trim())) {
            showError("Phone number can only contain numbers and an optional leading '+'.");
            return;
        }

        const baseCartTotal = checkoutCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        if (baseCartTotal <= 0) {
            showError("Your cart is empty or the total is invalid.");
            return;
        }

        const finalTotalAmount = selectedPaymentMethod === 'cod' ? baseCartTotal + COD_FEE : baseCartTotal;

        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Processing...';
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-70', 'cursor-not-allowed');

        // ==========================================================
        // SECURITY FIX: Google reCAPTCHA v3 — Anti Stock-Exhaustion
        // ==========================================================
        // Generates a fresh, single-use token bound to the 'checkout'
        // action. The backend independently verifies this token with
        // Google BEFORE performing any stock decrement or DB write.
        // ==========================================================
        let recaptchaToken;
        try {
            recaptchaToken = await new Promise((resolve, reject) => {
                if (typeof grecaptcha === 'undefined') {
                    reject(new Error('reCAPTCHA not loaded'));
                    return;
                }
                grecaptcha.ready(() => {
                    grecaptcha.execute('6Lcp654tAAAAAIE9s-4N5ThVCBKZwkxsBOnHxm-7', { action: 'checkout' })
                        .then(resolve)
                        .catch(reject);
                });
            });
        } catch (recaptchaError) {
            console.error("reCAPTCHA generation failed:", recaptchaError);
            showError("Security check failed to load. Please disable adblockers and try again.");
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
            return;
        }

        try {
            const isInvoice = invoiceToggle.checked;
            const invoiceData = isInvoice ? {
                isRequired: true,
                vat: vatInput.value.trim(),
                taxOffice: taxOfficeInput.value.trim(),
                companyName: companyNameInput.value.trim(),
                activity: activityInput.value.trim()
            } : { isRequired: false };

            const response = await fetch('/api/create-payment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    items: checkoutCart.map(item => ({ id: item.id, quantity: item.quantity })),
                    paymentMethod: selectedPaymentMethod,
                    customer: {
                        firstName: fnInput.value.trim(),
                        lastName: lnInput.value.trim(),
                        email: emailInput.value.trim(),
                        phone: phoneInput.value.trim(),
                        address: addressInput.value.trim(),
                        city: cityInput.value.trim(),
                        zip: zipInput.value.trim(),
                        country: countryInput.value
                    },
                    invoice: invoiceData,
                    userId: currentUser ? currentUser.uid : null,
                    recaptchaToken
                })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || "Failed to process order.");
            }

            const sessionOrderData = {
                orderId: data.orderId,
                customer: {
                    firstName: fnInput.value.trim(),
                    lastName: lnInput.value.trim(),
                    email: emailInput.value.trim(),
                    phone: phoneInput.value.trim(),
                    address: addressInput.value.trim(),
                    city: cityInput.value.trim(),
                    zip: zipInput.value.trim(),
                    country: countryInput.value
                },
                paymentMethod: selectedPaymentMethod,
                items: checkoutCart,
                totalAmount: finalTotalAmount
            };
            sessionStorage.setItem('aura_last_order', JSON.stringify(sessionOrderData));
            sessionStorage.removeItem('aura_order_email_sent');

            if (selectedPaymentMethod === 'cod') {
                await clearCart();
                window.location.href = 'success.html';
            } else {
                window.location.href = `https://demo.vivapayments.com/web/checkout?ref=${data.orderCode}`;
            }
            
        } catch (error) {
            console.error("Payment Error:", error);
            showError(error.message || "Could not initiate payment. Please try again later.");
            
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
        }
    });
});
