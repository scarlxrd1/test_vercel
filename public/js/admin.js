import { app, db } from './firebase-config.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, getDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const auth = getAuth(app);
    
    // Initialize EmailJS
    if (typeof emailjs !== 'undefined') {
        emailjs.init("YOUR_PUBLIC_KEY"); // Replace with actual EmailJS Public Key
    }

    // UI Views
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    
    // Login Elements
    const loginForm = document.getElementById('admin-login-form');
    const loginEmailInput = document.getElementById('admin-email');
    const loginPasswordInput = document.getElementById('admin-password');
    const loginError = document.getElementById('login-error');
    const loginBtn = document.getElementById('login-submit-btn');
    
    // Navigation & Layout Elements
    const navOrders = document.getElementById('nav-orders');
    const navProducts = document.getElementById('nav-products');
    const navCustomers = document.getElementById('nav-customers');
    const navSupport = document.getElementById('nav-support');
    
    const ordersSection = document.getElementById('orders-section');
    const productsSection = document.getElementById('products-section');
    const customersSection = document.getElementById('customers-section');
    const supportSection = document.getElementById('support-section');
    
    const logoutBtn = document.getElementById('logout-btn');
    const mobileLogoutBtn = document.getElementById('mobile-logout-btn');

    // Orders Elements & State
    let allOrders = [];
    let filteredOrders = [];
    const ordersTableBody = document.getElementById('orders-table-body');
    const orderSearchId = document.getElementById('order-search-id');
    const orderSearchEmail = document.getElementById('order-search-email');
    const orderSearchDate = document.getElementById('order-search-date');
    const orderSearchResetBtn = document.getElementById('order-search-reset-btn');
    const exportPdfBtn = document.getElementById('export-pdf-btn');

    // Top Scrollbar Elements
    const topScroll = document.getElementById('top-scroll-container');
    const topScrollContent = document.getElementById('top-scroll-content');
    const tableWrapper = document.getElementById('orders-table-wrapper');
    const ordersTable = document.getElementById('orders-table');

    // Products Elements
    const productsTableBody = document.getElementById('products-table-body');
    const toggleAddProductBtn = document.getElementById('toggle-add-product-btn');
    const addProductContainer = document.getElementById('add-product-container');
    const addProductForm = document.getElementById('add-product-form');
    const cancelAddBtn = document.getElementById('cancel-add-btn');

    // Edit Modal Elements
    const editModal = document.getElementById('edit-modal');
    const editModalBackdrop = document.getElementById('edit-modal-backdrop');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const editProductForm = document.getElementById('edit-product-form');
    
    // Customers Elements
    const customersTableBody = document.getElementById('customers-table-body');

    // Support Elements
    const supportTableBody = document.getElementById('support-table-body');

    // Dynamic Images Elements
    const addImageBtn = document.getElementById('add-image-btn');
    const addImageInputsContainer = document.getElementById('add-image-inputs');
    const editAddImageBtn = document.getElementById('edit-add-image-btn');
    const editImageInputsContainer = document.getElementById('edit-image-inputs');

    // State Variables
    let productsList = [];

    // ==========================================
    // 1. AUTHENTICATION & SECURITY LOCK
    // ==========================================
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userDocRef = doc(db, "users", user.uid);
                const userDocSnap = await getDoc(userDocRef);

                if (userDocSnap.exists() && userDocSnap.data().role === 'admin') {
                    showDashboardView();
                    fetchOrders();
                    fetchProducts();
                    fetchCustomers();
                    fetchSupportTickets();
                } else {
                    alert("Άρνηση Πρόσβασης: Μη εξουσιοδοτημένος λογαριασμός.");
                    await signOut(auth);
                    showLoginView();
                }
            } catch (error) {
                console.error("Error verifying admin role:", error);
                alert("Άρνηση Πρόσβασης: Αδυναμία επαλήθευσης.");
                await signOut(auth);
                showLoginView();
            }
        } else {
            showLoginView();
        }
    });

    function showDashboardView() {
        loginView.classList.add('hidden');
        dashboardView.classList.remove('hidden');
        dashboardView.classList.add('flex');
    }

    function showLoginView() {
        dashboardView.classList.add('hidden');
        dashboardView.classList.remove('flex');
        loginView.classList.remove('hidden');
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.classList.add('hidden');
        
        const originalText = loginBtn.textContent;
        loginBtn.textContent = 'Γίνεται σύνδεση...';
        loginBtn.disabled = true;

        try {
            await signInWithEmailAndPassword(auth, loginEmailInput.value.trim(), loginPasswordInput.value);
            loginForm.reset();
        } catch (error) {
            console.error("Login error:", error);
            loginError.textContent = "Λανθασμένα στοιχεία διαχειριστή. Δοκιμάστε ξανά.";
            loginError.classList.remove('hidden');
            loginBtn.textContent = originalText;
            loginBtn.disabled = false;
        }
    });

    const performLogout = async () => {
        await signOut(auth);
    };

    if (logoutBtn) logoutBtn.addEventListener('click', performLogout);
    if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', performLogout);

    // ==========================================
    // 2. DASHBOARD NAVIGATION
    // ==========================================
    function resetNavStyles() {
        [navOrders, navProducts, navCustomers, navSupport].forEach(btn => {
            btn.classList.replace('text-neutral-900', 'text-neutral-400');
            btn.classList.replace('border-neutral-900', 'border-transparent');
            btn.classList.remove('font-semibold');
        });
        
        [ordersSection, productsSection, customersSection, supportSection].forEach(sec => {
            sec.classList.add('hidden');
        });
    }

    navOrders.addEventListener('click', () => {
        resetNavStyles();
        navOrders.classList.replace('text-neutral-400', 'text-neutral-900');
        navOrders.classList.replace('border-transparent', 'border-neutral-900');
        navOrders.classList.add('font-semibold');
        ordersSection.classList.remove('hidden');
        syncScrollWidths(); // Re-sync top scrollbar when orders tab becomes visible
    });

    navProducts.addEventListener('click', () => {
        resetNavStyles();
        navProducts.classList.replace('text-neutral-400', 'text-neutral-900');
        navProducts.classList.replace('border-transparent', 'border-neutral-900');
        navProducts.classList.add('font-semibold');
        productsSection.classList.remove('hidden');
    });

    navCustomers.addEventListener('click', () => {
        resetNavStyles();
        navCustomers.classList.replace('text-neutral-400', 'text-neutral-900');
        navCustomers.classList.replace('border-transparent', 'border-neutral-900');
        navCustomers.classList.add('font-semibold');
        customersSection.classList.remove('hidden');
    });

    navSupport.addEventListener('click', () => {
        resetNavStyles();
        navSupport.classList.replace('text-neutral-400', 'text-neutral-900');
        navSupport.classList.replace('border-transparent', 'border-neutral-900');
        navSupport.classList.add('font-semibold');
        supportSection.classList.remove('hidden');
    });

    // ==========================================
    // 3. ORDERS MANAGEMENT (Search, Filter, PDF, Scroll Sync)
    // ==========================================
    
    // Sync Top Scrollbar
    function syncScrollWidths() {
        if (ordersTable && topScrollContent && !ordersSection.classList.contains('hidden')) {
            topScrollContent.style.width = ordersTable.offsetWidth + 'px';
        }
    }
    
    window.addEventListener('resize', syncScrollWidths);

    let isSyncingLeftScroll = false;
    let isSyncingRightScroll = false;

    topScroll.addEventListener('scroll', function(e) {
        if (!isSyncingLeftScroll) {
            isSyncingRightScroll = true;
            tableWrapper.scrollLeft = this.scrollLeft;
        }
        isSyncingLeftScroll = false;
    });

    tableWrapper.addEventListener('scroll', function(e) {
        if (!isSyncingRightScroll) {
            isSyncingLeftScroll = true;
            topScroll.scrollLeft = this.scrollLeft;
        }
        isSyncingRightScroll = false;
    });

    async function fetchOrders() {
        ordersTableBody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-neutral-400">Φόρτωση παραγγελιών...</td></tr>`;
        try {
            const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            
            allOrders = [];
            querySnapshot.forEach((docSnap) => {
                allOrders.push({ id: docSnap.id, ...docSnap.data() });
            });
            
            filteredOrders = [...allOrders];
            renderOrdersTable();
        } catch (error) {
            console.error("Error fetching orders:", error);
            ordersTableBody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-500">Σφάλμα φόρτωσης παραγγελιών.</td></tr>`;
        }
    }

    function applyOrderFilters() {
        const idTerm = orderSearchId.value.trim().toLowerCase();
        const emailTerm = orderSearchEmail.value.trim().toLowerCase();
        const dateTerm = orderSearchDate.value; // YYYY-MM-DD format

        filteredOrders = allOrders.filter(order => {
            const matchId = order.id.toLowerCase().includes(idTerm);
            const matchEmail = (order.customer?.email || '').toLowerCase().includes(emailTerm);
            
            let matchDate = true;
            if (dateTerm && order.createdAt) {
                const d = order.createdAt.toDate();
                const orderDateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                matchDate = (orderDateStr === dateTerm);
            } else if (dateTerm && !order.createdAt) {
                matchDate = false;
            }

            return matchId && matchEmail && matchDate;
        });

        renderOrdersTable();
    }

    // Attach Filter Listeners
    orderSearchId.addEventListener('input', applyOrderFilters);
    orderSearchEmail.addEventListener('input', applyOrderFilters);
    orderSearchDate.addEventListener('change', applyOrderFilters);

    orderSearchResetBtn.addEventListener('click', () => {
        orderSearchId.value = '';
        orderSearchEmail.value = '';
        orderSearchDate.value = '';
        filteredOrders = [...allOrders];
        renderOrdersTable();
    });

    function renderOrdersTable() {
        if (filteredOrders.length === 0) {
            ordersTableBody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-neutral-400">Δεν βρέθηκαν παραγγελίες με αυτά τα κριτήρια.</td></tr>`;
            syncScrollWidths();
            return;
        }

        let html = '';
        filteredOrders.forEach((order) => {
            const id = order.id;
            const dateObj = order.createdAt ? order.createdAt.toDate() : new Date();
            const dateStr = dateObj.toLocaleDateString('el-GR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit' });
            
            const customer = order.customer || {};
            
            // Document Type & Invoice Data
            let docTypeBadge = order.documentType === 'invoice' || (order.invoice && order.invoice.isRequired) 
                ? `<span class="inline-block mt-2 px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-[10px] uppercase font-bold tracking-wider">Τιμολόγιο B2B</span>`
                : `<span class="inline-block mt-2 px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] uppercase font-bold tracking-wider">Απόδειξη Λιανικής</span>`;

            let invoiceBlock = '';
            if (order.invoice && order.invoice.isRequired) {
                invoiceBlock = `
                    <div class="mt-2 p-3 bg-white border border-gray-200 rounded-sm text-xs text-neutral-600 shadow-sm">
                        <strong class="text-neutral-900 block mb-1">Στοιχεία Τιμολογίου</strong>
                        Επωνυμία: ${order.invoice.companyName}<br>
                        ΑΦΜ: ${order.invoice.vat} | ΔΟΥ: ${order.invoice.taxOffice}<br>
                        Δραστηριότητα: ${order.invoice.activity}
                    </div>
                `;
            }

            const customerStr = `${customer.firstName || ''} ${customer.lastName || ''}<br><span class="text-xs text-neutral-400">${customer.email || ''}</span><br><span class="text-xs text-neutral-400">${customer.phone || ''}</span><br>${docTypeBadge}${invoiceBlock}`;
            
            let itemsStr = (order.items || []).map(i => `${i.quantity}x [${i.sku || i.title}]`).join('<br>');
            
            let paymentBadge = '';
            if (order.paymentMethod === 'cod') {
                paymentBadge = `<span class="block mt-1 text-[10px] text-neutral-500 uppercase tracking-widest">Αντικαταβολή (+2.50€)</span>`;
            } else if (order.paymentMethod === 'card') {
                paymentBadge = `<span class="block mt-1 text-[10px] text-neutral-500 uppercase tracking-widest">Πιστωτική / Χρεωστική Κάρτα</span>`;
            } else {
                paymentBadge = `<span class="block mt-1 text-[10px] text-neutral-500 uppercase tracking-widest">N/A</span>`;
            }

            let trackingHtml = `
                <div class="flex flex-col items-start gap-1">
                    <input type="text" class="tracking-input border-b border-gray-300 py-1 text-xs w-28 bg-transparent focus:outline-none focus:border-neutral-900" value="${order.trackingNumber || ''}" placeholder="Αριθμός...">
                    <button class="save-tracking-btn text-[10px] text-blue-500 hover:text-blue-700 transition-colors uppercase tracking-widest mt-1" data-id="${id}">Αποθήκευση</button>
                </div>
            `;

            let statusBadge = '';
            if(order.status === 'pending') statusBadge = `<span class="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-[10px] uppercase font-bold tracking-wider">Εκκρεμεί</span>`;
            else if(order.status === 'paid') statusBadge = `<span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-[10px] uppercase font-bold tracking-wider">Πληρώθηκε</span>`;
            else if(order.status === 'shipped') statusBadge = `<span class="px-2 py-1 bg-green-100 text-green-800 rounded text-[10px] uppercase font-bold tracking-wider">Απεστάλη</span>`;
            else statusBadge = `<span class="px-2 py-1 bg-gray-100 text-gray-600 rounded text-[10px] uppercase font-bold tracking-wider">${order.status}</span>`;

            html += `
                <tr class="hover:bg-neutral-50 transition-colors align-top border-b border-gray-100">
                    <td class="p-4">
                        <div class="flex items-center gap-2">
                            <span class="font-mono text-xs text-neutral-900">${id}</span>
                            <button class="copy-id-btn text-neutral-400 hover:text-neutral-900 transition-colors" data-id="${id}" title="Αντιγραφή ID">
                                <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                            </button>
                        </div>
                    </td>
                    <td class="p-4 text-sm">${dateStr}</td>
                    <td class="p-4 text-sm">${customerStr}</td>
                    <td class="p-4 text-xs text-neutral-500">${itemsStr}</td>
                    <td class="p-4 text-sm font-medium">
                        €${(order.totalAmount || 0).toLocaleString('el-GR')}
                        ${paymentBadge}
                    </td>
                    <td class="p-4">${trackingHtml}</td>
                    <td class="p-4">${statusBadge}</td>
                    <td class="p-4 text-right space-y-2 flex flex-col items-end">
                        <button class="update-order-btn text-blue-500 hover:text-blue-700 transition-colors underline underline-offset-4 text-[10px] tracking-widest uppercase" data-id="${id}" data-status="paid">Σήμανση ως Πληρωμένη</button>
                        <button class="update-order-btn text-green-500 hover:text-green-700 transition-colors underline underline-offset-4 text-[10px] tracking-widest uppercase" data-id="${id}" data-status="shipped">Σήμανση ως Απεσταλμένη</button>
                    </td>
                </tr>
            `;
        });
        ordersTableBody.innerHTML = html;
        syncScrollWidths(); // Sync the top scrollbar length to the new table size
    }

    // PDF Export Logic
    exportPdfBtn.addEventListener('click', async () => {
        const originalText = exportPdfBtn.innerHTML;
        exportPdfBtn.innerHTML = 'Εξαγωγή...';
        exportPdfBtn.disabled = true;

        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert("Η βιβλιοθήκη PDF δεν φορτώθηκε σωστά. Δοκιμάστε ξανά.");
            exportPdfBtn.innerHTML = originalText;
            exportPdfBtn.disabled = false;
            return;
        }

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('landscape');
            
            // Load custom font for Greek characters
            const fontUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf";
            const response = await fetch(fontUrl);
            const buffer = await response.arrayBuffer();
            const base64Font = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
            
            doc.addFileToVFS("Roboto-Regular.ttf", base64Font);
            doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
            doc.setFont("Roboto");
            
            doc.setFontSize(16);
            doc.text("AURA Store - Αναφορά Παραγγελιών", 14, 15);
            
            doc.setFontSize(10);
            doc.text(`Ημερομηνία: ${new Date().toLocaleString('el-GR')}`, 14, 22);
            doc.text(`Σύνολο Παραγγελιών: ${filteredOrders.length}`, 14, 27);
            const totalSum = filteredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
            doc.text(`Συνολική Αξία: ${totalSum.toLocaleString('el-GR')} EUR`, 14, 32);

            const tableData = filteredOrders.map(o => {
                const dateStr = o.createdAt ? o.createdAt.toDate().toLocaleDateString('el-GR') : '';
                const customerStr = `${o.customer?.firstName || ''} ${o.customer?.lastName || ''}\n${o.customer?.email || ''}`;
                const itemsStr = (o.items || []).map(i => `${i.quantity}x [${i.sku || i.title}]`).join('\n');
                const payment = o.paymentMethod === 'cod' ? 'Αντικαταβολή' : (o.paymentMethod === 'card' ? 'Κάρτα' : 'N/A');
                const total = `${(o.totalAmount || 0).toLocaleString('el-GR')} EUR`;
                const status = o.status === 'pending' ? 'Εκκρεμεί' : (o.status === 'paid' ? 'Πληρώθηκε' : (o.status === 'shipped' ? 'Απεστάλη' : o.status));
                
                return [o.id, dateStr, customerStr, itemsStr, payment, total, status];
            });

            doc.autoTable({
                startY: 40,
                head: [['ID', 'Ημερομηνία', 'Πελάτης', 'Προϊόντα', 'Πληρωμή', 'Σύνολο', 'Κατάσταση']],
                body: tableData,
                styles: { fontSize: 8, font: 'Roboto' },
            });

            doc.save('aura_orders_report.pdf');
        } catch (error) {
            console.error("PDF Export Error:", error);
            alert("Σφάλμα κατά την εξαγωγή του PDF.");
        } finally {
            exportPdfBtn.innerHTML = originalText;
            exportPdfBtn.disabled = false;
        }
    });

    ordersTableBody.addEventListener('click', async (e) => {
        // Copy Order ID
        const copyBtn = e.target.closest('.copy-id-btn');
        if (copyBtn) {
            const id = copyBtn.getAttribute('data-id');
            try {
                await navigator.clipboard.writeText(id);
                const originalSvg = copyBtn.innerHTML;
                copyBtn.innerHTML = `<svg class="w-4 h-4 text-green-600 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
                setTimeout(() => {
                    copyBtn.innerHTML = originalSvg;
                }, 2000);
            } catch (err) {
                console.error('Failed to copy ID: ', err);
            }
            return;
        }

        // Save Tracking Number & Trigger EmailJS
        if (e.target.classList.contains('save-tracking-btn')) {
            const btn = e.target;
            const orderId = btn.getAttribute('data-id');
            const inputEl = btn.previousElementSibling;
            const newTracking = inputEl.value.trim();

            const originalText = btn.textContent;
            btn.textContent = '...';
            btn.disabled = true;

            try {
                // 1. Update Firestore
                await updateDoc(doc(db, "orders", orderId), { trackingNumber: newTracking });
                
                // 2. Update local arrays to keep UI in sync without re-fetching everything
                const orderIndex = allOrders.findIndex(o => o.id === orderId);
                let order = null;
                if(orderIndex !== -1) {
                    allOrders[orderIndex].trackingNumber = newTracking;
                    order = allOrders[orderIndex];
                }
                const filteredIndex = filteredOrders.findIndex(o => o.id === orderId);
                if(filteredIndex !== -1) filteredOrders[filteredIndex].trackingNumber = newTracking;

                // 3. Trigger EmailJS Notification
                if (order && typeof emailjs !== 'undefined') {
                    try {
                        const itemsSummary = (order.items || []).map(i => `${i.quantity}x [${i.sku || 'N/A'}] ${i.title}`).join('\n');
                        const paymentMethodStr = order.paymentMethod === 'cod' ? 'Αντικαταβολή' : (order.paymentMethod === 'card' ? 'Πιστωτική / Χρεωστική Κάρτα' : 'N/A');
                        
                        const templateParams = {
                            to_name: `${order.customer?.firstName || ''} ${order.customer?.lastName || ''}`.trim(),
                            to_email: order.customer?.email || '',
                            order_id: orderId,
                            tracking_number: newTracking,
                            payment_method: paymentMethodStr,
                            items_summary: itemsSummary,
                            total_amount: `€${(order.totalAmount || 0).toLocaleString('el-GR')}`
                        };

                        await emailjs.send("YOUR_SERVICE_ID", "YOUR_TRACKING_TEMPLATE_ID", templateParams);
                        btn.textContent = 'Ενημερώθηκε & Εστάλη ✓';
                    } catch (emailError) {
                        console.error("Failed to send tracking email:", emailError);
                        alert("Ο κωδικός αποθηκεύτηκε, αλλά το email απέτυχε να σταλεί.");
                        btn.textContent = 'Ενημερώθηκε ✓';
                    }
                } else {
                    btn.textContent = 'Ενημερώθηκε ✓';
                }

                // 4. UI Reset
                btn.classList.replace('text-blue-500', 'text-green-600');
                setTimeout(() => {
                    btn.textContent = 'Αποθήκευση';
                    btn.classList.replace('text-green-600', 'text-blue-500');
                    btn.disabled = false;
                }, 3000);

            } catch (error) {
                console.error("Error saving tracking:", error);
                alert("Σφάλμα αποθήκευσης. Δοκιμάστε ξανά.");
                btn.textContent = originalText;
                btn.disabled = false;
            }
            return;
        }

        // Update Order Status
        if (e.target.classList.contains('update-order-btn')) {
            const orderId = e.target.getAttribute('data-id');
            const newStatus = e.target.getAttribute('data-status');
            
            if (confirm(`Είστε σίγουροι ότι θέλετε να αλλάξετε την κατάσταση σε '${newStatus === 'paid' ? 'Πληρώθηκε' : 'Απεστάλη'}';`)) {
                try {
                    await updateDoc(doc(db, "orders", orderId), { status: newStatus });
                    await fetchOrders(); // Full refresh to ensure consistency
                } catch (error) {
                    console.error("Error updating order status:", error);
                    alert("Σφάλμα κατά την ενημέρωση της παραγγελίας.");
                }
            }
        }
    });

    // ==========================================
    // 4. PRODUCTS CRUD OPERATIONS
    // ==========================================
    async function fetchProducts() {
        productsTableBody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-neutral-400">Φόρτωση προϊόντων...</td></tr>`;
        try {
            const querySnapshot = await getDocs(collection(db, "products"));
            productsList = [];
            querySnapshot.forEach((doc) => {
                productsList.push({ id: doc.id, ...doc.data() });
            });
            renderProductsTable();
        } catch (error) {
            console.error("Error fetching products:", error);
            productsTableBody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-500">Σφάλμα φόρτωσης προϊόντων.</td></tr>`;
        }
    }

    function renderProductsTable() {
        if (productsList.length === 0) {
            productsTableBody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-neutral-400">Δεν βρέθηκαν προϊόντα.</td></tr>`;
            return;
        }

        productsTableBody.innerHTML = productsList.map(product => {
            const statusBadge = product.status === 'hidden'
                ? `<span class="px-2 py-1 bg-gray-200 text-gray-600 rounded text-[10px] uppercase font-bold tracking-wider">Κρυφό</span>`
                : `<span class="px-2 py-1 bg-green-100 text-green-800 rounded text-[10px] uppercase font-bold tracking-wider">Ενεργό</span>`;
                
            const stockBadge = product.stock <= 0
                ? `<span class="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-bold">Εξαντλήθηκε</span>`
                : `<span class="px-2 py-1 bg-gray-100 rounded text-xs">${product.stock} τεμ</span>`;

            return `
                <tr class="hover:bg-neutral-50 transition-colors border-b border-gray-100">
                    <td class="p-4">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 bg-gray-100 rounded-sm overflow-hidden flex-shrink-0">
                                <img src="${product.image || ''}" alt="${product.title}" class="w-full h-full object-cover">
                            </div>
                            <span class="font-serif font-medium">${product.title}</span>
                        </div>
                    </td>
                    <td class="p-4 text-neutral-500 font-mono text-xs">${product.sku || 'N/A'}</td>
                    <td class="p-4 capitalize text-neutral-500">${product.categories || 'N/A'}</td>
                    <td class="p-4">€${(product.price || 0).toLocaleString('el-GR')}</td>
                    <td class="p-4">${stockBadge}</td>
                    <td class="p-4">${statusBadge}</td>
                    <td class="p-4 text-right space-x-3">
                        <button class="edit-product-btn text-neutral-400 hover:text-neutral-900 transition-colors underline underline-offset-4 text-xs tracking-widest uppercase" data-id="${product.id}">
                            Επεξεργασία
                        </button>
                        <button class="delete-product-btn text-red-400 hover:text-red-700 transition-colors underline underline-offset-4 text-xs tracking-widest uppercase" data-id="${product.id}">
                            Διαγραφή
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Dynamic Image Inputs Logic
    addImageBtn.addEventListener('click', () => {
        const currentInputs = addImageInputsContainer.querySelectorAll('.add-image-input');
        if (currentInputs.length >= 10) {
            alert("Μέγιστο όριο 10 εικόνων.");
            return;
        }
        const inputHTML = `
            <div class="flex gap-2 items-center">
                <input type="url" required class="add-image-input w-full bg-transparent border-b border-gray-300 py-2 focus:outline-none focus:border-neutral-900" placeholder="Επιπλέον URL Εικόνας">
                <button type="button" class="text-red-400 hover:text-red-700 font-bold text-xl remove-image-btn">&times;</button>
            </div>
        `;
        addImageInputsContainer.insertAdjacentHTML('beforeend', inputHTML);
    });

    addImageInputsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-image-btn')) {
            e.target.parentElement.remove();
        }
    });

    editAddImageBtn.addEventListener('click', () => {
        const currentInputs = editImageInputsContainer.querySelectorAll('.edit-image-input');
        if (currentInputs.length >= 10) {
            alert("Μέγιστο όριο 10 εικόνων.");
            return;
        }
        const inputHTML = `
            <div class="flex gap-2 items-center">
                <input type="url" required class="edit-image-input w-full bg-transparent border-b border-gray-300 py-2 focus:outline-none focus:border-neutral-900" placeholder="Επιπλέον URL Εικόνας">
                <button type="button" class="text-red-400 hover:text-red-700 font-bold text-xl remove-image-btn">&times;</button>
            </div>
        `;
        editImageInputsContainer.insertAdjacentHTML('beforeend', inputHTML);
    });

    editImageInputsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-image-btn')) {
            e.target.parentElement.remove();
        }
    });

    // Toggle Add Product Form
    toggleAddProductBtn.addEventListener('click', () => {
        addProductContainer.classList.remove('hidden');
        toggleAddProductBtn.classList.add('hidden');
    });

    cancelAddBtn.addEventListener('click', () => {
        addProductContainer.classList.add('hidden');
        toggleAddProductBtn.classList.remove('hidden');
        addProductForm.reset();
        addImageInputsContainer.innerHTML = `
            <div class="flex gap-2 items-center">
                <input type="url" required class="add-image-input w-full bg-transparent border-b border-gray-300 py-2 focus:outline-none focus:border-neutral-900" placeholder="URL Κύριας Εικόνας">
            </div>
        `;
    });

    // Add New Product
    addProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submit-add-btn');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Αποθήκευση...';
        submitBtn.disabled = true;

        try {
            const inputs = Array.from(document.querySelectorAll('.add-image-input'));
            const images = inputs.map(input => input.value.trim()).filter(val => val !== '');
            const primaryImage = images[0] || '';
            const hoverImage = images[1] || primaryImage;
            
            const newProduct = {
                title: document.getElementById('add-title').value.trim(),
                sku: document.getElementById('add-sku').value.trim(),
                price: parseFloat(document.getElementById('add-price').value),
                stock: parseInt(document.getElementById('add-stock').value),
                categories: document.getElementById('add-category').value,
                estimated_dispatch: document.getElementById('add-dispatch').value,
                status: document.getElementById('add-status').value,
                description: document.getElementById('add-description').value.trim(),
                materials: document.getElementById('add-materials').value.trim(),
                care: document.getElementById('add-care').value.trim(),
                dimensions: document.getElementById('add-dimensions').value.trim(),
                image: primaryImage,
                hoverImage: hoverImage,
                images: images
            };

            await addDoc(collection(db, "products"), newProduct);
            
            cancelAddBtn.click(); // resets form and UI
            await fetchProducts(); // Refresh list
        } catch (error) {
            console.error("Error adding product:", error);
            alert("Σφάλμα κατά την προσθήκη του προϊόντος.");
        } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });

    // Event Delegation for Edit & Delete Buttons
    productsTableBody.addEventListener('click', async (e) => {
        const productId = e.target.getAttribute('data-id');
        
        if (e.target.classList.contains('edit-product-btn')) {
            openEditModal(productId);
        } else if (e.target.classList.contains('delete-product-btn')) {
            if (confirm("Είστε σίγουροι ότι θέλετε να διαγράψετε αυτό το προϊόν; Η ενέργεια δεν μπορεί να αναιρεθεί.")) {
                try {
                    await deleteDoc(doc(db, "products", productId));
                    await fetchProducts(); // Refresh UI instantly
                } catch (error) {
                    console.error("Error deleting product:", error);
                    alert("Σφάλμα διαγραφής.");
                }
            }
        }
    });

    function openEditModal(id) {
        const product = productsList.find(p => p.id === id);
        if (!product) return;

        // Populate Modal
        document.getElementById('edit-id').value = product.id;
        document.getElementById('edit-title').value = product.title;
        document.getElementById('edit-sku').value = product.sku || '';
        document.getElementById('edit-price').value = product.price || 0;
        document.getElementById('edit-stock').value = product.stock || 0;
        
        // Handle selects safely
        const categorySelect = document.getElementById('edit-category');
        if([...categorySelect.options].some(o => o.value === product.categories)) {
            categorySelect.value = product.categories;
        }
        
        const dispatchSelect = document.getElementById('edit-dispatch');
        if([...dispatchSelect.options].some(o => o.value === product.estimated_dispatch)) {
            dispatchSelect.value = product.estimated_dispatch;
        } else {
            dispatchSelect.value = "2-3 estimated days"; // Fallback
        }

        const statusSelect = document.getElementById('edit-status');
        if([...statusSelect.options].some(o => o.value === product.status)) {
            statusSelect.value = product.status;
        } else {
            statusSelect.value = "active"; // Default fallback
        }

        document.getElementById('edit-description').value = product.description || product.desc || '';
        document.getElementById('edit-materials').value = product.materials || '';
        document.getElementById('edit-care').value = product.care || product.customCare || '';
        document.getElementById('edit-dimensions').value = product.dimensions || '';

        // Populate images
        editImageInputsContainer.innerHTML = '';
        let images = product.images || [];
        if (images.length === 0) {
            if (product.image) images.push(product.image);
            if (product.hoverImage && product.hoverImage !== product.image) images.push(product.hoverImage);
        }
        if (images.length === 0) images.push(''); // at least one empty input

        images.forEach((imgUrl, index) => {
            let removeBtn = index === 0 ? '' : `<button type="button" class="text-red-400 hover:text-red-700 font-bold text-xl remove-image-btn">&times;</button>`;
            const inputHTML = `
                <div class="flex gap-2 items-center">
                    <input type="url" required class="edit-image-input w-full bg-transparent border-b border-gray-300 py-2 focus:outline-none focus:border-neutral-900" placeholder="${index === 0 ? 'URL Κύριας Εικόνας' : 'Επιπλέον URL Εικόνας'}" value="${imgUrl}">
                    ${removeBtn}
                </div>
            `;
            editImageInputsContainer.insertAdjacentHTML('beforeend', inputHTML);
        });

        // Show Modal
        editModal.classList.remove('hidden');
    }

    function closeEditModal() {
        editModal.classList.add('hidden');
        editProductForm.reset();
        editImageInputsContainer.innerHTML = '';
    }

    closeModalBtn.addEventListener('click', closeEditModal);
    editModalBackdrop.addEventListener('click', closeEditModal);

    // Save Edited Product
    editProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveBtn = document.getElementById('save-modal-btn');
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'Αποθήκευση...';
        saveBtn.disabled = true;

        const id = document.getElementById('edit-id').value;
        try {
            const inputs = Array.from(document.querySelectorAll('.edit-image-input'));
            const images = inputs.map(input => input.value.trim()).filter(val => val !== '');
            const primaryImage = images[0] || '';
            const hoverImage = images[1] || primaryImage;

            const productRef = doc(db, "products", id);
            await updateDoc(productRef, {
                title: document.getElementById('edit-title').value.trim(),
                sku: document.getElementById('edit-sku').value.trim(),
                price: parseFloat(document.getElementById('edit-price').value),
                stock: parseInt(document.getElementById('edit-stock').value),
                categories: document.getElementById('edit-category').value,
                estimated_dispatch: document.getElementById('edit-dispatch').value,
                status: document.getElementById('edit-status').value,
                description: document.getElementById('edit-description').value.trim(),
                materials: document.getElementById('edit-materials').value.trim(),
                care: document.getElementById('edit-care').value.trim(),
                dimensions: document.getElementById('edit-dimensions').value.trim(),
                image: primaryImage,
                hoverImage: hoverImage,
                images: images
            });

            closeEditModal();
            await fetchProducts(); // Refresh list
        } catch (error) {
            console.error("Error updating product:", error);
            alert("Σφάλμα αποθήκευσης.");
        } finally {
            saveBtn.textContent = originalText;
            saveBtn.disabled = false;
        }
    });

    // ==========================================
    // 5. CUSTOMERS DIRECTORY
    // ==========================================
    async function fetchCustomers() {
        customersTableBody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-neutral-400">Φόρτωση πελατών...</td></tr>`;
        try {
            const querySnapshot = await getDocs(collection(db, "users"));
            const users = [];
            querySnapshot.forEach((doc) => {
                users.push(doc.data());
            });

            if (users.length === 0) {
                customersTableBody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-neutral-400">Δεν βρέθηκαν πελάτες.</td></tr>`;
                return;
            }

            customersTableBody.innerHTML = users.map(user => {
                const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Μη διαθέσιμο';
                
                // Combine Address and Postal Code/Zip
                const postalCode = user.postalCode || user.zip || '';
                const fullAddress = `${user.address || ''}, ${postalCode}`.replace(/^, | , $/g, '').trim();
                const displayAddress = fullAddress && fullAddress !== ',' ? fullAddress : 'Μη διαθέσιμο';

                return `
                    <tr class="hover:bg-neutral-50 transition-colors border-b border-gray-100">
                        <td class="p-4 font-medium">${fullName}</td>
                        <td class="p-4 text-neutral-500">${user.email || 'N/A'}</td>
                        <td class="p-4 text-neutral-500">${user.phone || 'N/A'}</td>
                        <td class="p-4 text-neutral-500">${displayAddress}</td>
                    </tr>
                `;
            }).join('');
            
        } catch (error) {
            console.error("Error fetching customers:", error);
            customersTableBody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-red-500">Σφάλμα φόρτωσης.</td></tr>`;
        }
    }

    // ==========================================
    // 6. SUPPORT TICKETS MANAGEMENT
    // ==========================================
    async function fetchSupportTickets() {
        supportTableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-neutral-400">Φόρτωση αιτημάτων...</td></tr>`;
        try {
            const querySnapshot = await getDocs(collection(db, "support_tickets"));
            let tickets = [];
            
            querySnapshot.forEach((doc) => {
                tickets.push({ id: doc.id, ...doc.data() });
            });

            // Sort by timestamp descending (newest first)
            tickets.sort((a, b) => {
                const timeA = a.timestamp ? a.timestamp.toMillis() : Date.now();
                const timeB = b.timestamp ? b.timestamp.toMillis() : Date.now();
                return timeB - timeA;
            });

            if (tickets.length === 0) {
                supportTableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-neutral-400">Δεν βρέθηκαν αιτήματα.</td></tr>`;
                return;
            }

            supportTableBody.innerHTML = tickets.map(ticket => {
                const badgeHtml = ticket.isRegistered 
                    ? `<span class="px-2 py-1 bg-green-100 text-green-800 rounded text-[10px] uppercase font-bold tracking-wider">Εγγεγραμμένος</span>`
                    : `<span class="px-2 py-1 bg-gray-200 text-gray-700 rounded text-[10px] uppercase font-bold tracking-wider">Επισκέπτης</span>`;

                const dateObj = ticket.timestamp ? ticket.timestamp.toDate() : new Date();
                const dateStr = dateObj.toLocaleDateString('el-GR', { month: 'short', day: 'numeric', year: 'numeric' });

                return `
                    <tr class="hover:bg-neutral-50 transition-colors align-top border-b border-gray-100">
                        <td class="p-4">
                            <div class="flex flex-col gap-1">
                                <span class="font-medium text-neutral-900">${ticket.senderName || 'N/A'}</span>
                                <span class="text-neutral-500 text-xs">${ticket.senderEmail || 'N/A'}</span>
                                <span class="text-neutral-500 text-xs">${ticket.senderPhone || 'N/A'}</span>
                                <span class="text-neutral-400 text-xs mt-1 max-w-[200px] truncate" title="${ticket.senderAddress || ''}">${ticket.senderAddress || 'N/A'}</span>
                            </div>
                        </td>
                        <td class="p-4">
                            <div class="flex flex-col gap-1">
                                <span class="text-neutral-900 font-medium">${ticket.issueType || 'Γενική Ερώτηση'}</span>
                                <span class="text-neutral-400 text-xs">${dateStr}</span>
                            </div>
                        </td>
                        <td class="p-4">
                            <div class="text-neutral-600 text-sm max-w-sm whitespace-pre-wrap">${ticket.message || 'Χωρίς μήνυμα.'}</div>
                        </td>
                        <td class="p-4">
                            ${badgeHtml}
                        </td>
                        <td class="p-4 text-right">
                            <button class="delete-ticket-btn text-red-400 hover:text-red-700 transition-colors underline underline-offset-4 text-xs tracking-widest uppercase" data-id="${ticket.id}">
                                Επίλυση (Διαγραφή)
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
            
        } catch (error) {
            console.error("Error fetching support tickets:", error);
            supportTableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-500">Σφάλμα φόρτωσης.</td></tr>`;
        }
    }

    // Event Delegation for Delete/Resolve Ticket Button
    supportTableBody.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-ticket-btn')) {
            const ticketId = e.target.getAttribute('data-id');
            if (confirm("Είστε σίγουροι ότι θέλετε να επισημάνετε αυτό το αίτημα ως επιλυμένο; Αυτό θα διαγράψει μόνιμα την εγγραφή.")) {
                try {
                    await deleteDoc(doc(db, "support_tickets", ticketId));
                    await fetchSupportTickets(); // Refresh UI instantly
                } catch (error) {
                    console.error("Error deleting ticket:", error);
                    alert("Σφάλμα διαγραφής.");
                }
            }
        }
    });
});
