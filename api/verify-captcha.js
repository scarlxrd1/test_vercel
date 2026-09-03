export default async function handler(req, res) {

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { token } = req.body;

    if (!token) return res.status(400).json({ success: false });



    const secret = process.env.RECAPTCHA_SECRET_KEY;

    const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {

        method: 'POST',

        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },

        body: `secret=${secret}&response=${token}`

    });

    const data = await verifyRes.json();

    return res.status(200).json({ success: data.success && data.score > 0.5 });

} 

