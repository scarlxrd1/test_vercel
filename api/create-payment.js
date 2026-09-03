import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        }),
    });
}
const adminDb = getFirestore();
const COD_FEE_CENTS = 250; 

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method Not Allowed' });
        }

        const { items, paymentMethod, customer, invoice, userId, recaptchaToken } = req.body;

        // ---------- 0. reCAPTCHA v3 verification ----------
        // MUST run first, before any Firestore read/write, so that
        // scripted COD-spam requests are rejected at zero cost to
        // our database (stock exhaustion mitigation).
        if (!recaptchaToken || typeof recaptchaToken !== 'string') {
            return res.status(400).json({ error: 'Security verification token is missing.' });
        }

        const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
        if (!recaptchaSecret) {
            console.error('RECAPTCHA_SECRET_KEY is not configured on the server.');
            return res.status(500).json({ error: 'Server misconfiguration. Please contact support.' });
        }

        let recaptchaData;
        try {
            const recaptchaVerifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `secret=${recaptchaSecret}&response=${recaptchaToken}`
            });
            recaptchaData = await recaptchaVerifyRes.json();
        } catch (recaptchaFetchError) {
            console.error('reCAPTCHA verification request failed:', recaptchaFetchError);
            return res.status(400).json({ error: 'Security verification failed. Please try again.' });
        }

        if (!recaptchaData || !recaptchaData.success || (typeof recaptchaData.score === 'number' && recaptchaData.score < 0.5)) {
            console.warn('reCAPTCHA verification rejected:', recaptchaData);
            return res.status(400).json({ error: 'Security verification failed. Please refresh the page and try again.' });
        }

        // ---------- 1. Basic shape validation ----------
        if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
            return res.status(400).json({ error: 'Invalid cart.' });
        }
        if (!customer || !customer.email || !customer.firstName || !customer.lastName) {
            return res.status(400).json({ error: 'Missing customer details.' });
        }
        if (!['card', 'cod'].includes(paymentMethod)) {
            return res.status(400).json({ error: 'Invalid payment method.' });
        }

        const nameRegex = /^[a-zA-Zα-ωΑ-ΩάέήίόύώΆΈΉΊΌΎΏ\s]+$/;
        const phoneRegex = /^\+?\d+$/;
        if (!nameRegex.test(customer.firstName.trim()) || !nameRegex.test(customer.lastName.trim())) {
            return res.status(400).json({ error: 'Invalid name.' });
        }
        if (!phoneRegex.test((customer.phone || '').trim())) {
            return res.status(400).json({ error: 'Invalid phone.' });
        }

        // ---------- 2. Recompute EVERY price/stock server-side from Firestore ----------
        let subtotalCents = 0;
        const verifiedItems = [];

        for (const rawItem of items) {
            const productId = String(rawItem.id || '');
            const quantity = parseInt(rawItem.quantity, 10);
            
            if (!productId || !Number.isInteger(quantity) || quantity <= 0 || quantity > 20) {
                return res.status(400).json({ error: 'Invalid item in cart.' });
            }

            const productSnap = await adminDb.collection('products').doc(productId).get();
            if (!productSnap.exists) {
                return res.status(400).json({ error: `Product ${productId} no longer exists.` });
            }
            
            const product = productSnap.data();
            if (product.status === 'hidden') {
                return res.status(400).json({ error: `Product "${product.title}" is unavailable.` });
            }
            if (typeof product.stock !== 'number' || product.stock < quantity) {
                return res.status(400).json({ error: `Insufficient stock for "${product.title}".` });
            }

            const unitPriceCents = Math.round(Number(product.price) * 100);
            if (!Number.isFinite(unitPriceCents) || unitPriceCents <= 0) {
                return res.status(400).json({ error: `Invalid price for "${product.title}".` });
            }

            subtotalCents += unitPriceCents * quantity;
            verifiedItems.push({
                id: productId,
                title: product.title,
                sku: product.sku || '',
                price: unitPriceCents / 100, 
                quantity,
                image: product.image || ''
            });
        }

        const codFeeCents = paymentMethod === 'cod' ? COD_FEE_CENTS : 0;
        const totalCents = subtotalCents + codFeeCents;
        
        if (totalCents <= 0) {
            return res.status(400).json({ error: 'Order total must be greater than zero.' });
        }

        // ---------- 3. Decrement stock atomically ----------
        await adminDb.runTransaction(async (tx) => {
            for (const item of verifiedItems) {
                const ref = adminDb.collection('products').doc(item.id);
                const snap = await tx.get(ref);
                const currentStock = snap.data().stock || 0;
                if (currentStock < item.quantity) {
                    throw new Error(`Insufficient stock for "${item.title}".`);
                }
                tx.update(ref, { stock: currentStock - item.quantity });
            }
        });

        // ---------- 4. Create the order server-side ----------
        const orderRef = await adminDb.collection('orders').add({
            customer: {
                firstName: customer.firstName.trim(),
                lastName: customer.lastName.trim(),
                email: String(customer.email).trim(),
                phone: customer.phone.trim(),
                address: (customer.address || '').trim(),
                city: (customer.city || '').trim(),
                zip: (customer.zip || '').trim(),
                country: customer.country || ''
            },
            items: verifiedItems,
            totalAmount: totalCents / 100,
            paymentMethod,
            codFee: codFeeCents / 100,
            invoice: invoice && invoice.isRequired ? invoice : { isRequired: false },
            documentType: invoice && invoice.isRequired ? 'invoice' : 'receipt',
            status: paymentMethod === 'cod' ? 'confirmed' : 'pending',
            createdAt: FieldValue.serverTimestamp(),
            userId: userId || null
        });

        // ---------- 5. Cash on Delivery ----------
        if (paymentMethod === 'cod') {
            return res.status(200).json({ success: true, orderId: orderRef.id, cod: true });
        }

        // ---------- 6. Card payment Viva Wallet ----------
        const clientId = process.env.VIVA_CLIENT_ID;
        const clientSecret = process.env.VIVA_CLIENT_SECRET;
        const sourceCode = process.env.VIVA_SOURCE_CODE;
        
        if (!clientId || !clientSecret || !sourceCode) {
            throw new Error('Payment gateway is not configured.');
        }

        const tokenCredentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const tokenResponse = await fetch('https://demo-accounts.vivapayments.com/connect/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${tokenCredentials}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        });

        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok || !tokenData.access_token) {
            throw new Error('Payment gateway authentication failed.');
        }

        const orderResponse = await fetch('https://demo-api.vivapayments.com/checkout/v2/orders', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: totalCents,
                customerTrns: `AURA Order ${orderRef.id}`,
                merchantTrns: orderRef.id,
                customer: {
                    email: customer.email,
                    fullName: `${customer.firstName} ${customer.lastName}`,
                    phone: customer.phone
                },
                sourceCode
            })
        });

        const orderText = await orderResponse.text();
        if (!orderResponse.ok) {
            throw new Error('Payment provider rejected the order.');
        }

        const vivaOrderData = JSON.parse(orderText);
        await orderRef.update({ vivaOrderCode: vivaOrderData.orderCode });
        
        return res.status(200).json({ success: true, orderCode: vivaOrderData.orderCode, orderId: orderRef.id });

    } catch (error) {
        console.error('Backend Error:', error);
        return res.status(400).json({ error: 'We could not process your order. Please try again.' });
    }
}
