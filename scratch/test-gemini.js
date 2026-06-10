import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const key = process.env.VITE_GEMINI_API_KEY;
console.log('Using Key:', key);

if (!key) {
  console.error('No GEMINI API key found in .env');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: key });

async function run() {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: 'Hello, respond with a JSON object containing {"status": "ok"}',
      config: {
        responseMimeType: 'application/json',
      }
    });
    console.log('Response:', response.text);
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
