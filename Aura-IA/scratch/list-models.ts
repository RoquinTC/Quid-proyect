import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY || '');

async function listModels() {
  try {
    const result = await genAI.listModels();
    console.log("Modelos disponibles:");
    result.models.forEach(m => console.log(`- ${m.name}`));
  } catch (e) {
    console.error("Error listando modelos:", e);
  }
}

listModels();
