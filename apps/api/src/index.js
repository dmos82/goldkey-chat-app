require('dotenv').config();
const express = require('express');
const openaiHelper = require('./utils/openaiHelper');

const app = express();
const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// Add JSON parsing middleware
app.use(express.json());

app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

// Test endpoint for OpenAI functionality - DEVELOPMENT ONLY
app.post('/api/test/openai', async (req, res) => {
  try {
    const { text, type } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    if (type === 'embedding') {
      const embedding = await openaiHelper.generateEmbedding(text);
      return res.json({ 
        embedding: embedding.slice(0, 5), // Only send first 5 values to avoid large response
        dimensions: embedding.length,
      });
    } else if (type === 'chat') {
      const completion = await openaiHelper.getChatCompletion(text);
      return res.json({ completion });
    } else {
      return res.status(400).json({ error: 'Invalid type. Must be "embedding" or "chat"' });
    }
  } catch (error) {
    console.error('Error in OpenAI test endpoint:', error);
    res.status(500).json({ 
      error: 'OpenAI API Error',
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

app.listen(port, () => {
  console.log(`GKCHATTY API server running at http://localhost:${port}`);
}); 