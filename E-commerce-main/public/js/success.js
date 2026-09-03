import { app, db } from './firebase-config.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. CLEAR CART LOGIC
    // ==========================================
    
    // Immediately clear local storage carts
    localStorage.removeItem('cart');
    localStorage.removeItem('aura_cart');

    // Clear global cart array if the function exists
    if (typeof window.syncGlobalCart === 'function') {
        window.syncGlobalCart([]);
    }

    // Clear Firestore cart for authenticated users
    const auth = getAuth(app);
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userRef = doc(db, "users", user.uid);
                await updateDoc(userRef, { cart: [] });
            } catch (error) {
                console.error("Error clearing user cart in Firestore:", error);
            }
        }
    });

    // ==========================================
    // 2. EMAILJS ORDER CONFIRMATION
    // ==========================================
    
    // Initialize EmailJS
    if (typeof emailjs !== 'undefined') {
        emailjs.init("VjioTcL168a56Y0fO");
    }

    const orderData = JSON.parse(sessionStorage.getItem('aura_last_order'));

    if (orderData && !sessionStorage.getItem('aura_order_email_sent') && typeof emailjs !== 'undefined') {
        try {
            let itemsHtmlTable = '';
            
            if (orderData.items && Array.isArray(orderData.items)) {
                orderData.items.forEach(item => {
                    itemsHtmlTable += `
<table style="width: 100%; border-collapse: collapse">
  <tr style="vertical-align: top">
    <td style="padding: 24px 8px 0 4px; display: inline-block; width: max-content">
      <img style="height: 64px; object-fit: cover; border-radius: 4px;" height="64px" width="64px" src="${item.image || 'https://via.placeholder.com/64'}" alt="${item.title}" />
    </td>
    <td style="padding: 24px 8px 0 8px; width: 100%">
      <div style="font-weight: bold; color: #333;">${item.title}</div>
      <div style="font-size: 14px; color: #888; padding-top: 4px">Ποσότητα: ${item.quantity}</div>
    </td>
    <td style="padding: 24px 4px 0 0; white-space: nowrap">
      <strong>€${(item.price * item.quantity).toFixed(2)}</strong>
    </td>
  </tr>
</table>`;
                });
            }

            // Format payment method
            let paymentString = "Αντικαταβολή";
            if (orderData.paymentMethod === 'card') {
                paymentString = "Πιστωτική/Χρεωστική";
            }

            // Prepare Template Params
            const templateParams = {
                to_name: `${orderData.customer.firstName} ${orderData.customer.lastName}`.trim(),
                to_email: orderData.customer.email,
                order_id: orderData.orderId,
                payment_method: paymentString,
                shipping_address: `${orderData.customer.address}, ${orderData.customer.city} ${orderData.customer.zip}`,
                items_html: itemsHtmlTable,
                total_amount: `€${(orderData.totalAmount || 0).toFixed(2)}`
            };

            // Send Email
            emailjs.send("service_c24ml8x", "template_7qgdnhq", templateParams)
                .then(() => {
                    console.log("Order confirmation email sent successfully.");
                    sessionStorage.setItem('aura_order_email_sent', 'true');
                })
                .catch((error) => {
                    console.error("Failed to send order confirmation email:", error);
                });
                
        } catch (error) {
            console.error("Error processing order for email confirmation:", error);
        }
    }
});
