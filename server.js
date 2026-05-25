require('dotenv').config();
const express = require('express');
const getProgress = require('./api/get-progress');
const saveScore = require('./api/save-score');
const logEvent = require('./api/log-event');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

// CORS Middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Serve static assets from workspace directory
app.use(express.static(__dirname));

// Middleware helper to mock Vercel serverless request/response objects
const runHandler = (handler) => {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error('Handler Error:', err);
      res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  };
};

// Map routes
app.get('/api/tts', async (req, res) => {
  const text = req.query.text;
  if (!text) {
    return res.status(400).json({ error: "Text parameter is required" });
  }
  
  const apiKey = process.env.ELEVEN_LABS_API_KEY;
  const voiceId = process.env.VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  
  if (!apiKey) {
    console.error("ElevenLabs API key is missing in environment variables");
    return res.status(500).json({ error: "TTS configuration error" });
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("ElevenLabs API returned error:", errText);
      return res.status(502).json({ error: "ElevenLabs API error", details: errText });
    }

    const buffer = await response.arrayBuffer();
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.byteLength
    });
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("Failed to generate TTS:", error);
    res.status(500).json({ error: "Internal server error during TTS generation" });
  }
});

app.get('/api/get-progress', runHandler(getProgress));
app.post('/api/save-score', runHandler(saveScore));
app.post('/api/log-event', runHandler(logEvent));

// Default index route for visual verification
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    app: 'NumberOrder Quest Backend API Server',
    endpoints: [
      { path: '/api/get-progress', method: 'GET', queryParams: ['userId'], desc: 'Retrieve or initialize user progress profile' },
      { path: '/api/save-score', method: 'POST', bodyParams: ['userId', 'score', 'seed', 'answers'], desc: 'Post new score record and update user progress metrics' },
      { path: '/api/log-event', method: 'POST', bodyParams: ['event', 'data', 'userId'], desc: 'Record analytics event logs' }
    ]
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server is running locally on http://localhost:${PORT}`);
  console.log(`Try accessing http://localhost:${PORT}/ in your browser or sending API requests to verify.`);
  console.log('Use Ctrl+C to stop the server when done.\n');
});
