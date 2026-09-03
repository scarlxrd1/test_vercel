import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { phone, excludeUid } = req.body;
        
        if (!phone || typeof phone !== 'string') {
            return res.status(400).json({ error: 'A valid phone number is required.' });
        }

        const usersRef = adminDb.collection('users');
        const snapshot = await usersRef.where('phone', '==', phone.trim()).get();

        let exists = false;
        
        snapshot.forEach(doc => {
            if (doc.id !== excludeUid) {
                exists = true;
            }
        });

        return res.status(200).json({ exists });
        
    } catch (error) {
        console.error('Error checking phone uniqueness:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
