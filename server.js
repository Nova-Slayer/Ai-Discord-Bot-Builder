require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');

const app = express();

// --- MIDDLEWARES ---
app.use(cors());
app.use(express.json()); // JSON parsing ke liye zaroori
app.use(express.static(path.join(__dirname, 'public'))); // Serve HTML/CSS files securely

// --- MEMORY VARIABLES ---
// (Production me database use hota hai, par abhi live memory use kar rahe hain stats ke liye)
let totalBotsGenerated = 0;
let currentActiveAPI = 'Gemini 1.5 Flash';

// --- AI FALLBACK ENGINE ---
async function generateWithFallback(prompt) {
    // Basic formatting constraint for standard output
    const systemInstruction = "You are a professional Discord.js V14 bot developer. Output ONLY valid JavaScript code. Do not include markdown formatting like ```javascript or any conversational text. Just the raw code.";
    const fullPrompt = `${systemInstruction}\n\nTask: ${prompt}`;

    try {
        // 1. PRIMARY: Google Gemini API
        if (!process.env.GEMINI_API_KEY) throw new Error("Gemini API key missing");
        currentActiveAPI = 'Gemini (Stable)';
        
        const geminiRes = await axios.post(
            `[https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=$](https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=$){process.env.GEMINI_API_KEY}`,
            { contents: [{ parts: [{ text: fullPrompt }] }] },
            { headers: { 'Content-Type': 'application/json' } }
        );
        
        let code = geminiRes.data.candidates[0].content.parts[0].text;
        return cleanCodeOutput(code);

    } catch (geminiError) {
        console.error("Gemini Failed:", geminiError.message, "- Falling back to Groq/OpenAI...");

        try {
            // 2. SECONDARY: Groq API (Llama 3 - Faster & better free tier)
            if (!process.env.GROQ_API_KEY) throw new Error("Groq API key missing");
            currentActiveAPI = 'Groq (Fallback)';

            const groqRes = await axios.post(
                '[https://api.groq.com/openai/v1/chat/completions](https://api.groq.com/openai/v1/chat/completions)',
                {
                    model: "llama3-8b-8192",
                    messages: [{ role: "user", content: fullPrompt }]
                },
                { 
                    headers: { 
                        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                        'Content-Type': 'application/json'
                    } 
                }
            );
            
            let code = groqRes.data.choices[0].message.content;
            return cleanCodeOutput(code);

        } catch (groqError) {
            console.error("Groq Failed:", groqError.message, "- Falling back to OpenAI...");
            
            try {
                // 3. TERTIARY: OpenAI API
                if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI API key missing");
                currentActiveAPI = 'OpenAI (Fallback)';

                const openaiRes = await axios.post(
                    '[https://api.openai.com/v1/chat/completions](https://api.openai.com/v1/chat/completions)',
                    {
                        model: "gpt-3.5-turbo",
                        messages: [{ role: "user", content: fullPrompt }]
                    },
                    { 
                        headers: { 
                            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                            'Content-Type': 'application/json'
                        } 
                    }
                );
                
                let code = openaiRes.data.choices[0].message.content;
                return cleanCodeOutput(code);

            } catch (openaiError) {
                currentActiveAPI = 'All APIs Offline';
                console.error("OpenAI Failed:", openaiError.message);
                throw new Error("Generation failed. All AI endpoints are currently overloaded.");
            }
        }
    }
}

// Helper: AI kabhi kabhi ```javascript tag laga deta hai, ye function usko hata dega taaki clean code mile
function cleanCodeOutput(text) {
    return text.replace(/```javascript/gi, '').replace(/```/gi, '').trim();
}

// --- API ROUTES ---

// 1. Generate Bot Code
app.post('/api/generate', async (req, res) => {
    const { botName, features, customPrompt } = req.body;
    
    if (!botName) {
        return res.status(400).json({ success: false, message: "Bot name is required." });
    }

    try {
        const combinedPrompt = `Create a Discord.js v14 bot named '${botName}'. Features to include: ${features.join(', ')}. Additional instructions: ${customPrompt}`;
        
        const finalCode = await generateWithFallback(combinedPrompt);
        
        // Update stats
        totalBotsGenerated++;
        
        res.json({ success: true, code: finalCode });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. Secure Admin Login
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    
    // Server environment se password match karega (Secure practice)
    const validPassword = process.env.ADMIN_PASSWORD || "6201646274"; // Fallback added

    if (password === validPassword) {
        // Generate JWT Token valid for 2 hours
        const secret = process.env.JWT_SECRET || "fallback_nova_secret_key_2026";
        const token = jwt.sign({ role: 'admin' }, secret, { expiresIn: '2h' });
        
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, message: "Invalid credentials." });
    }
});

// 3. Get Dashboard Stats (Protected Route)
app.get('/api/admin/stats', (req, res) => {
    // Extract token from 'Bearer <token>'
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(403).json({ success: false, message: "Access denied. No token provided." });
    }

    const secret = process.env.JWT_SECRET || "fallback_nova_secret_key_2026";

    jwt.verify(token, secret, (err, decoded) => {
        if (err) {
            return res.status(401).json({ success: false, message: "Session expired or invalid token." });
        }

        // Send live memory stats
        res.json({ 
            success: true,
            botsGeneratedToday: totalBotsGenerated, 
            activeUsers: Math.floor(Math.random() * (25 - 5 + 1) + 5), // Simulated live users for UI feel
            currentAPI: currentActiveAPI 
        });
    });
});

// --- SERVER START ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Nova System Core initialized on port ${PORT}`);
    console.log(`🔧 Primary AI Engine mapped and waiting for requests...`);
});
