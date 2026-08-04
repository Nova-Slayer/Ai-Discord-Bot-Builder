require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();

// --- MIDDLEWARES ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let totalBotsGenerated = 0;
let currentActiveAPI = 'Gemini 1.5 Flash';

// --- AI FALLBACK ENGINE (Using Native Fetch) ---
async function generateWithFallback(prompt) {
    const systemInstruction = "You are a professional Discord.js V14 bot developer. Output ONLY valid JavaScript code. Do not include markdown formatting like ```javascript or any conversational text. Just the raw code.";
    const fullPrompt = `${systemInstruction}\n\nTask: ${prompt}`;

    try {
        if (!process.env.GEMINI_API_KEY) throw new Error("Gemini API key missing");
        currentActiveAPI = 'Gemini (Stable)';
        
        // Automatically clean spaces and quotes from the key
        const geminiKey = process.env.GEMINI_API_KEY.replace(/['"]/g, '').trim(); 
        const geminiUrl = `[https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=$](https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=$){geminiKey}`;
        
        const response = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] })
        });
        
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const data = await response.json();
        return cleanCodeOutput(data.candidates[0].content.parts[0].text);

    } catch (geminiError) {
        console.error("Gemini Failed:", geminiError.message, "- Falling back to Groq...");
        
        try {
            if (!process.env.GROQ_API_KEY) throw new Error("Groq API key missing");
            currentActiveAPI = 'Groq (Fallback)';

            const groqKey = process.env.GROQ_API_KEY.replace(/['"]/g, '').trim();
            const response = await fetch('[https://api.groq.com/openai/v1/chat/completions](https://api.groq.com/openai/v1/chat/completions)', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${groqKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "llama3-8b-8192",
                    messages: [{ role: "user", content: fullPrompt }]
                })
            });

            if (!response.ok) throw new Error(`API Error: ${response.status}`);
            const data = await response.json();
            return cleanCodeOutput(data.choices[0].message.content);

        } catch (groqError) {
            console.error("Groq Failed:", groqError.message, "- Falling back to OpenAI...");
            
            try {
                if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI API key missing");
                currentActiveAPI = 'OpenAI (Fallback)';

                const openaiKey = process.env.OPENAI_API_KEY.replace(/['"]/g, '').trim();
                const response = await fetch('[https://api.openai.com/v1/chat/completions](https://api.openai.com/v1/chat/completions)', {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Bearer ${openaiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: "gpt-3.5-turbo",
                        messages: [{ role: "user", content: fullPrompt }]
                    })
                });

                if (!response.ok) throw new Error(`API Error: ${response.status}`);
                const data = await response.json();
                return cleanCodeOutput(data.choices[0].message.content);

            } catch (openaiError) {
                currentActiveAPI = 'All APIs Offline';
                console.error("OpenAI Failed:", openaiError.message);
                throw new Error("Generation failed. Please check your API keys.");
            }
        }
    }
}

// Clean markdown tags from code
function cleanCodeOutput(text) {
    return text.replace(/```javascript/gi, '').replace(/```/gi, '').trim();
}

// --- API ROUTES ---
app.post('/api/generate', async (req, res) => {
    const { botName, features, customPrompt } = req.body;
    if (!botName) return res.status(400).json({ success: false, message: "Bot name is required." });

    try {
        const combinedPrompt = `Create a Discord.js v14 bot named '${botName}'. Features to include: ${features.join(', ')}. Additional instructions: ${customPrompt}`;
        const finalCode = await generateWithFallback(combinedPrompt);
        
        totalBotsGenerated++;
        res.json({ success: true, code: finalCode });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin Route
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    const validPassword = process.env.ADMIN_PASSWORD || "6201646274"; 
    if (password === validPassword) {
        const secret = process.env.JWT_SECRET || "fallback_nova_secret_key_2026";
        const token = jwt.sign({ role: 'admin' }, secret, { expiresIn: '2h' });
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, message: "Invalid credentials." });
    }
});

// Stats Route
app.get('/api/admin/stats', (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(403).json({ success: false, message: "Access denied." });

    jwt.verify(token, process.env.JWT_SECRET || "fallback_nova_secret_key_2026", (err) => {
        if (err) return res.status(401).json({ success: false, message: "Session expired." });
        res.json({ 
            success: true,
            botsGeneratedToday: totalBotsGenerated, 
            activeUsers: Math.floor(Math.random() * (25 - 5 + 1) + 5), 
            currentAPI: currentActiveAPI 
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Nova System Core initialized on port ${PORT}`));
