import axios from 'axios';
import { env } from '../config/env.js';

export async function diagnoseGemini() {
  if (!env.GOOGLE_AI_KEY) {
    console.log('ℹ️ No hay GOOGLE_AI_KEY configurada.');
    return;
  }

  console.log('🔍 Diagnosticando modelos de Gemini disponibles...');
  
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${env.GOOGLE_AI_KEY}`;
    const res = await axios.get(url);
    const models = res.data.models || [];
    
    console.log('✅ Modelos encontrados en v1beta:');
    models.forEach((m: any) => {
      console.log(`- ${m.name} (Soporta: ${m.supportedGenerationMethods.join(', ')})`);
    });
  } catch (error: any) {
    console.error('❌ Error consultando modelos en v1beta:', error.response?.data?.error?.message || error.message);
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1/models?key=${env.GOOGLE_AI_KEY}`;
    const res = await axios.get(url);
    const models = res.data.models || [];
    
    console.log('✅ Modelos encontrados en v1:');
    models.forEach((m: any) => {
      console.log(`- ${m.name}`);
    });
  } catch (error: any) {
    console.error('❌ Error consultando modelos en v1:', error.response?.data?.error?.message || error.message);
  }
}
