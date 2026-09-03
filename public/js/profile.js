import { app, db } from './firebase-config.js';
import { getAuth, onAuthStateChanged, signOut, EmailAuthProvider, reauthenticateWithCredential, verifyBeforeUpdateEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { translations } from './translations.js';
import { escapeHTML } from './sanitize.js';

document.addEventListener('DOMContentLoaded', () => {
    const auth = getAuth(app);
    let currentUser = null;
    let userAddresses = [];
    
    const userNameHeaderEl = document.getElementById('user-name-header');
    const profileNameEl = document.getElementById('profile-name');
    const profileEmailEl = document.getElementById('profile-email');
    const profilePhoneEl = document.getElementById('profile-phone');
    const logoutBtn = document.getElementById('logout-btn');

    const viewModeContainer = document.getElementById('profile-view-mode');
    const editModeContainer = document.getElementById('profile-edit-mode');
    const editProfileBtn = document.getElementById('edit-profile-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const saveEditBtn = document.getElementById('save-edit-btn');
    
    const editFirstNameInput = document.getElementById('edit-firstName');
    const editLastNameInput = document.getElementById('edit-lastName');
    const editPhoneInput = document.getElementById('edit-phone');
    
    const currentEmailDisplay = document.getElementById('current-email-display');

    const emailModal = document.getElementById('change-email-modal');
    const emailModalBackdrop = document.getElementById('change-email-backdrop');
    const openEmailModalBtn = document.getElementById('open-email-modal-btn');
    const closeEmailModalBtn = document.getElementById('close-email-modal-btn');
    const emailForm = document.getElementById('change-email-form');
    const newEmailInput = document.getElementById('new-email-input');
    const confirmPasswordInput = document.getElementById('confirm-password-input');
    const emailModalAlert = document.getElementById('email-modal-alert');
    const submitEmailModalBtn = document.getElementById('submit-email-modal-btn');

    const addressesGrid = document.getElementById('addresses-grid');
    const openAddAddressBtn = document.getElementById('open-add-address-btn');
    const addAddressModal = document.getElementById('add-address-modal');
    const addAddressBackdrop = document.getElementById('add-address-backdrop');
    const closeAddressModalBtn = document.getElementById('close-address-modal-btn');
    const addAddressForm = document.getElementById('add-address-form');
    const submitAddressBtn = document.getElementById('submit-address-modal-btn');

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await loadProfileData();
            await loadUserOrders();
        } else {
            window.location.replace('auth.html');
        }
    });

    async function loadProfileData() {
        try {
            const docRef = doc(db, "users", currentUser.uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                const firstName = data.firstName || '';
                const lastName = data.lastName || '';
                const fullName = `${firstName} ${lastName}`.trim();
                
                userNameHeaderEl.textContent = escapeHTML(fullName || currentUser.email);
                userNameHeaderEl.classList.remove('animate-pulse', 'bg-stone-200', 'text-transparent', 'rounded');
                
                profileNameEl.textContent = escapeHTML(fullName || 'Not provided');
                profileEmailEl.textContent = escapeHTML(data.email || currentUser.email);
                profilePhoneEl.textContent = escapeHTML(data.phone || 'Not provided');

                editFirstNameInput.value = firstName;
                editLastNameInput.value = lastName;
                editPhoneInput.value = data.phone || '';
                currentEmailDisplay.textContent = escapeHTML(currentUser.email);

                userAddresses = data.addresses || [];
                
                if (userAddresses.length === 0 && (data.address || data.city)) {
                    userAddresses.push({
                        id: Date.now().toString(),
                        street: data.address || '',
                        city: data.city || '',
                        zip: data.postalCode || data.zip || '',
                        country: data.country || '',
                        isDefault: true
                    });
                    await updateDoc(docRef, { addresses: userAddresses });
                }
                renderAddresses();
            } else {
                userNameHeaderEl.textContent = escapeHTML(currentUser.email);
                userNameHeaderEl.classList.remove('animate-pulse', 'bg-stone-200', 'text-transparent', 'rounded');
                profileNameEl.textContent = 'Not provided';
                profileEmailEl.textContent = escapeHTML(currentUser.email);
                profilePhoneEl.textContent = 'Not provided';
                currentEmailDisplay.textContent = escapeHTML(currentUser.email);
                renderAddresses();
            }
        } catch (error) {
            console.error("Error fetching user profile data:", error);
            userNameHeaderEl.textContent = 'Error loading data';
            userNameHeaderEl.classList.remove('animate-pulse', 'bg-stone-200', 'text-transparent', 'rounded');
        }
    }

    async function loadUserOrders() {
        const ordersContainer = document.getElementById('orders-list-container');
        if (!ordersContainer) return;

        try {
            const q = query(collection(db, "orders"), where("userId", "==", currentUser.uid));
            const snapshot = await getDocs(q);
            
            let orders = [];
            snapshot.forEach(doc => {
                orders.push({ id: doc.id, ...doc.data() });
            });

            orders.sort((a, b) => {
                const timeA = a.createdAt ? a.createdAt.toMillis() : 0;
                const timeB = b.createdAt ? b.createdAt.toMillis() : 0;
                return timeB - timeA;
            });

            const currentLang = localStorage.getItem('aura_lang') || 'en';
            const t = translations[currentLang].profile.orders || translations['en'].profile.orders;

            if (orders.length === 0) {
                ordersContainer.innerHTML = `
                    <div class="border border-stone-200 bg-white p-16 rounded-sm flex flex-col items-center justify-center text-center shadow-sm">
                        <svg class="w-12 h-12 text-stone-300 mb-4 stroke-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
                        <h3 class="font-sans text-stone-900 font-medium mb-2">${t.empty_title || 'No orders yet'}</h3>
                        <p class="font-sans text-sm text-stone-500 mb-6 max-w-sm">${t.empty_desc || 'When you place an order, it will appear here.'}</p>
                        <a href="collection.html" class="font-sans text-xs tracking-widest uppercase border-b border-stone-900 text-stone-900 pb-1 hover:text-stone-600 hover:border-stone-600 transition-colors">
                            ${t.explore_btn || 'Explore Collection'}
                        </a>
                    </div>
                `;
                return;
            }

            let html = '';
            orders.forEach(order => {
                const dateObj = order.createdAt ? order.createdAt.toDate() : new Date();
                const dateStr = dateObj.toLocaleDateString(currentLang === 'el' ? 'el-GR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                
                let statusLabel = t.status_pending || 'Pending Payment';
                let statusClasses = "bg-amber-50 text-amber-700 border-amber-100";
                
                if (order.status === 'paid' || order.status === 'confirmed') {
                    statusLabel = t.status_paid || 'Paid';
                    statusClasses = "bg-green-50 text-green-700 border-green-100";
                } else if (order.status === 'shipped') {
                    statusLabel = t.status_shipped || 'Shipped';
                    statusClasses = "bg-blue-50 text-blue-700 border-blue-100";
                }

                const statusBadge = `<span class="px-3 py-1 border rounded-sm text-[10px] uppercase font-bold tracking-wider ${statusClasses}">${statusLabel}</span>`;
                
                const paymentStr = order.paymentMethod === 'cod' 
                    ? (t.pay_cod || 'Cash on Delivery') 
                    : (order.paymentMethod === 'card' ? (t.pay_card || 'Credit / Debit Card') : 'N/A');
                
                const trackingHtml = order.trackingNumber 
                    ? `<span class="font-mono text-xs bg-stone-100 px-2 py-1 rounded-sm text-stone-900 border border-stone-200">${escapeHTML(order.trackingNumber)}</span>` 
                    : `<span class="font-sans text-sm text-stone-500 italic">${t.no_tracking || 'Pending Shipment'}</span>`;

                let itemsHtml = '';
                (order.items || []).forEach(item => {
                    const skuText = item.sku ? `<span class="text-stone-400 ml-2 font-mono text-xs tracking-wider">[${escapeHTML(item.sku)}]</span>` : '';
                    itemsHtml += `
                        <div class="flex items-center gap-4">
                            <div class="w-16 h-20 bg-stone-100 rounded-sm overflow-hidden flex-shrink-0 border border-stone-100">
                                <img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.title)}" class="w-full h-full object-cover">
                            </div>
                            <div class="flex-1 flex justify-between items-center">
                                <div>
                                    <h4 class="font-serif text-stone-900 text-sm md:text-base">${escapeHTML(item.title)} ${skuText}</h4>
                                    <p class="font-sans text-stone-500 text-xs mt-1">x${escapeHTML(item.quantity)}</p>
                                </div>
                                <div class="font-sans text-stone-900 text-sm font-medium">
                                    €${escapeHTML((item.price * item.quantity).toLocaleString())}
                                </div>
                            </div>
                        </div>
                    `;
                });

                html += `
                    <div class="bg-white border border-stone-200 rounded-sm shadow-sm overflow-hidden">
                        <div class="bg-stone-50/50 border-b border-stone-200 p-6 grid grid-cols-2 md:grid-cols-5 gap-4 items-start md:items-center">
                            <div class="col-span-2 md:col-span-1">
                                <p class="font-sans text-xs tracking-widest uppercase text-stone-500 mb-1">${t.order_no || 'Order #'} ${escapeHTML(order.id.slice(0,8).toUpperCase())}</p>
                                <p class="font-sans text-sm text-stone-900 font-medium">${escapeHTML(dateStr)}</p>
                            </div>
                            <div class="col-span-1">
                                <p class="font-sans text-xs tracking-widest uppercase text-stone-500 mb-1">${t.total || 'Total'}</p>
                                <p class="font-sans text-sm font-medium text-stone-900">€${escapeHTML((order.totalAmount || 0).toLocaleString())}</p>
                            </div>
                            <div class="col-span-1">
                                <p class="font-sans text-xs tracking-widest uppercase text-stone-500 mb-1">${t.payment_method || 'Payment Method'}</p>
                                <p class="font-sans text-sm font-medium text-stone-900">${paymentStr}</p>
                            </div>
                            <div class="col-span-2 md:col-span-1">
                                <p class="font-sans text-xs tracking-widest uppercase text-stone-500 mb-1">${t.tracking_no || 'Tracking Number'}</p>
                                ${trackingHtml}
                            </div>
                            <div class="col-span-2 md:col-span-1 text-left md:text-right">
                                ${statusBadge}
                            </div>
                        </div>
                        <div class="p-6 flex flex-col gap-6">
                            ${itemsHtml}
                        </div>
                    </div>
                `;
            });

            ordersContainer.innerHTML = html;

        } catch (error) {
            console.error("Error fetching orders:", error);
            ordersContainer.innerHTML = `<p class="text-red-500 font-sans text-sm p-4 bg-red-50 border border-red-100 rounded-sm text-center">Error loading order history.</p>`;
        }
    }

    editProfileBtn.addEventListener('click', () => {
        viewModeContainer.classList.add('hidden');
        editModeContainer.classList.remove('hidden');
        editModeContainer.classList.add('flex');
        editProfileBtn.classList.add('hidden');
    });

    cancelEditBtn.addEventListener('click', () => {
        editModeContainer.classList.add('hidden');
        editModeContainer.classList.remove('flex');
        viewModeContainer.classList.remove('hidden');
        editProfileBtn.classList.remove('hidden');
        loadProfileData(); 
    });

    editModeContainer.addEventListener('submit', async (e) => {
        e.preventDefault();
        const originalBtnText = saveEditBtn.textContent;
        const currentLang = localStorage.getItem('aura_lang') || 'en';
        saveEditBtn.textContent = currentLang === 'el' ? 'Αποθήκευση...' : 'Saving...';
        saveEditBtn.disabled = true;
        saveEditBtn.classList.add('opacity-70', 'cursor-not-allowed');

        try {
            const newPhone = editPhoneInput.value.trim();
            
            // 1. Enforce Phone Number Uniqueness securely via backend
            const phoneCheckRes = await fetch('/api/check-phone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    phone: newPhone, 
                    excludeUid: currentUser.uid 
                })
            });
            
            if (!phoneCheckRes.ok) throw new Error('Phone check failed');
            
            const phoneCheckData = await phoneCheckRes.json();
            
            if (phoneCheckData.exists) {
                const msg = translations[currentLang]?.auth?.error_phone_exists || 
                    (currentLang === 'el' 
                        ? "Αυτός ο αριθμός τηλεφώνου χρησιμοποιείται ήδη από άλλον λογαριασμό." 
                        : "This phone number is already in use by another account.");
                alert(msg);
                saveEditBtn.textContent = originalBtnText;
                saveEditBtn.disabled = false;
                saveEditBtn.classList.remove('opacity-70', 'cursor-not-allowed');
                return;
            }

            // 2. Proceed with updating profile
            const userRef = doc(db, "users", currentUser.uid);
            await updateDoc(userRef, {
                firstName: editFirstNameInput.value.trim(),
                lastName: editLastNameInput.value.trim(),
                phone: newPhone
            });
            await loadProfileData();
            cancelEditBtn.click(); 
        } catch (error) {
            console.error("Error updating profile:", error);
            const msg = currentLang === 'el' ? "Προέκυψε σφάλμα: " : "An error occurred: ";
            alert(msg + error.message);
        } finally {
            saveEditBtn.textContent = originalBtnText;
            saveEditBtn.disabled = false;
            saveEditBtn.classList.remove('opacity-70', 'cursor-not-allowed');
        }
    });

    function renderAddresses() {
        const currentLang = localStorage.getItem('aura_lang') || 'en';
        const t = translations[currentLang].profile.addresses || translations['en'].profile.addresses;

        if (userAddresses.length === 0) {
            addressesGrid.innerHTML = `
                <div class="col-span-1 md:col-span-2 border border-stone-200 bg-white p-16 rounded-sm flex flex-col items-center justify-center text-center shadow-sm">
                    <svg class="w-12 h-12 text-stone-300 mb-4 stroke-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
                    <h3 class="font-sans text-stone-900 font-medium mb-2">${t.empty_title || 'No addresses saved'}</h3>
                    <p class="font-sans text-sm text-stone-500 max-w-sm">${t.empty_desc || 'Save your shipping and billing addresses.'}</p>
                </div>
            `;
            return;
        }

        let html = '';
        userAddresses.forEach(address => {
            const badge = address.isDefault 
                ? `<span class="px-2 py-1 bg-stone-900 text-white text-[10px] uppercase tracking-widest rounded-sm">${t.primary || 'Primary'}</span>`
                : `<button class="set-default-btn text-[10px] uppercase tracking-widest text-stone-400 hover:text-stone-900 transition-colors" data-id="${escapeHTML(address.id)}">${t.set_default || 'Set as Default'}</button>`;

            html += `
                <div class="bg-white border ${address.isDefault ? 'border-stone-900' : 'border-stone-200'} p-8 rounded-sm shadow-sm flex flex-col justify-between">
                    <div>
                        <div class="flex justify-between items-start mb-4">
                            ${badge}
                            <button class="delete-address-btn text-stone-400 hover:text-red-600 transition-colors" data-id="${escapeHTML(address.id)}" title="${t.delete || 'Delete'}">
                                <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </div>
                        <p class="font-sans text-sm text-stone-900 leading-relaxed">
                            ${escapeHTML(address.street)}<br>
                            ${escapeHTML(address.city)}, ${escapeHTML(address.zip)}<br>
                            ${escapeHTML(address.country)}
                        </p>
                    </div>
                </div>
            `;
        });
        addressesGrid.innerHTML = html;
    }

    function closeAddressModal() {
        addAddressModal.classList.add('hidden');
        addAddressForm.reset();
    }

    openAddAddressBtn.addEventListener('click', () => {
        addAddressModal.classList.remove('hidden');
    });

    closeAddressModalBtn.addEventListener('click', closeAddressModal);
    addAddressBackdrop.addEventListener('click', closeAddressModal);

    addAddressForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentLang = localStorage.getItem('aura_lang') || 'en';
        const originalText = submitAddressBtn.textContent;
        submitAddressBtn.textContent = currentLang === 'el' ? 'Αποθήκευση...' : 'Saving...';
        submitAddressBtn.disabled = true;

        const newAddress = {
            id: Date.now().toString(),
            street: document.getElementById('new-street').value.trim(),
            city: document.getElementById('new-city').value.trim(),
            zip: document.getElementById('new-zip').value.trim(),
            country: document.getElementById('new-country').value,
            isDefault: userAddresses.length === 0
        };

        userAddresses.push(newAddress);

        try {
            await updateDoc(doc(db, "users", currentUser.uid), { addresses: userAddresses });
            renderAddresses();
            closeAddressModal();
        } catch (error) {
            console.error("Error saving address:", error);
            alert("An error occurred while saving the address.");
        } finally {
            submitAddressBtn.textContent = originalText;
            submitAddressBtn.disabled = false;
        }
    });

    addressesGrid.addEventListener('click', async (e) => {
        const setBtn = e.target.closest('.set-default-btn');
        const delBtn = e.target.closest('.delete-address-btn');

        if (setBtn) {
            const id = setBtn.getAttribute('data-id');
            userAddresses = userAddresses.map(addr => ({ ...addr, isDefault: addr.id === id }));
            try {
                await updateDoc(doc(db, "users", currentUser.uid), { addresses: userAddresses });
                renderAddresses();
            } catch (error) {
                console.error("Error updating default address:", error);
            }
        }

        if (delBtn) {
            const id = delBtn.getAttribute('data-id');
            const addressToDelete = userAddresses.find(a => a.id === id);
            userAddresses = userAddresses.filter(addr => addr.id !== id);

            if (addressToDelete && addressToDelete.isDefault && userAddresses.length > 0) {
                userAddresses[0].isDefault = true;
            }

            try {
                await updateDoc(doc(db, "users", currentUser.uid), { addresses: userAddresses });
                renderAddresses();
            } catch (error) {
                console.error("Error deleting address:", error);
            }
        }
    });

    function closeEmailModal() {
        emailModal.classList.add('hidden');
        emailForm.reset();
        emailModalAlert.classList.add('hidden');
        emailModalAlert.textContent = '';
    }

    openEmailModalBtn.addEventListener('click', () => {
        emailModal.classList.remove('hidden');
    });

    closeEmailModalBtn.addEventListener('click', closeEmailModal);
    emailModalBackdrop.addEventListener('click', closeEmailModal);

    emailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentLang = localStorage.getItem('aura_lang') || 'en';
        const newEmail = newEmailInput.value.trim();
        const password = confirmPasswordInput.value;

        if (!newEmail || !password) return;

        const originalText = submitEmailModalBtn.textContent;
        submitEmailModalBtn.textContent = currentLang === 'el' ? 'Επεξεργασία...' : 'Processing...';
        submitEmailModalBtn.disabled = true;
        submitEmailModalBtn.classList.add('opacity-70', 'cursor-not-allowed');
        
        emailModalAlert.classList.add('hidden');

        try {
            const credential = EmailAuthProvider.credential(currentUser.email, password);
            await reauthenticateWithCredential(currentUser, credential);
            await verifyBeforeUpdateEmail(currentUser, newEmail);

            const successMsg = translations[currentLang]?.profile?.email_modal?.success || translations['en'].profile.email_modal.success;
            emailModalAlert.textContent = successMsg;
            emailModalAlert.className = "mb-6 p-4 bg-green-50 border border-green-100 text-green-600 text-sm font-sans rounded-sm text-center";
            emailModalAlert.classList.remove('hidden');

            setTimeout(() => {
                closeEmailModal();
                loadProfileData(); 
            }, 3000);

        } catch (error) {
            console.error("Email Update Error:", error);
            let errorMsg = translations[currentLang]?.profile?.email_modal?.error_generic || translations['en'].profile.email_modal.error_generic;
            
            if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                errorMsg = translations[currentLang]?.profile?.email_modal?.error_password || translations['en'].profile.email_modal.error_password;
            }

            emailModalAlert.textContent = errorMsg;
            emailModalAlert.className = "mb-6 p-4 bg-red-50 border border-red-100 text-red-600 text-sm font-sans rounded-sm text-center";
            emailModalAlert.classList.remove('hidden');
        } finally {
            submitEmailModalBtn.textContent = originalText;
            submitEmailModalBtn.disabled = false;
            submitEmailModalBtn.classList.remove('opacity-70', 'cursor-not-allowed');
        }
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                const originalText = logoutBtn.textContent;
                const currentLang = localStorage.getItem('aura_lang') || 'en';
                logoutBtn.textContent = currentLang === 'el' ? 'Αποσύνδεση...' : 'Logging out...';
                await signOut(auth);
                window.location.href = 'index.html';
            } catch (error) {
                console.error('Error signing out:', error);
                const msg = localStorage.getItem('aura_lang') === 'el' 
                    ? "Προέκυψε σφάλμα κατά την αποσύνδεση. Παρακαλώ δοκιμάστε ξανά."
                    : "An error occurred while logging out. Please try again.";
                alert(msg);
                logoutBtn.textContent = originalText;
            }
        });
    }
});
