import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

function getEnv(key: string, required: boolean = true, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (required && !value) {
    throw new Error(`Falta la variable de entorno obligatoria: ${key}`);
  }
  return value || '';
}

export const env = {
  TELEGRAM_BOT_TOKEN: getEnv('TELEGRAM_BOT_TOKEN'),
  TELEGRAM_ALLOWED_USER_IDS: getEnv('TELEGRAM_ALLOWED_USER_IDS')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .map(Number),

  GROQ_API_KEY: getEnv('GROQ_API_KEY'),
  OPENROUTER_API_KEY: getEnv('OPENROUTER_API_KEY', false),
  GOOGLE_AI_KEY: getEnv('GOOGLE_AI_KEY', false),
  TAVILY_API_KEY: getEnv('TAVILY_API_KEY', false),

  GITHUB_TOKEN: getEnv('GITHUB_TOKEN', false),
  GITHUB_USER: getEnv('GITHUB_USER', false),
  GITHUB_REPO: getEnv('GITHUB_REPO', false),

  LOCAL_AI_BASE_URL: getEnv('LOCAL_AI_BASE_URL', false),
  LOCAL_AI_MODEL_EXECUTIVE: getEnv('LOCAL_AI_MODEL_EXECUTIVE', false, 'gemma4:e2b'),
  LOCAL_AI_MODEL_ANALYST: getEnv('LOCAL_AI_MODEL_ANALYST', false, 'qwen2.5-coder:7b'),
  LOCAL_AI_MODEL_ENGINEER: getEnv('LOCAL_AI_MODEL_ENGINEER', false, 'qwen2.5-coder:7b'),
  LOCAL_AI_MODEL_REASONER: getEnv('LOCAL_AI_MODEL_REASONER', false, 'deepseek-r1:1.5b'),
  LOCAL_AI_MODEL_SENSES: getEnv('LOCAL_AI_MODEL_SENSES', false, 'llava:7b'),
  LOCAL_AI_MODEL_FAST_ACTION: getEnv('LOCAL_AI_MODEL_FAST_ACTION', false, 'llama3.2:1b'),

  ELEVENLABS_API_KEY: getEnv('ELEVENLABS_API_KEY', false),
  ELEVENLABS_VOICE_ID: getEnv('ELEVENLABS_VOICE_ID', false, '21m00Tcm4TlvDq8ikWAM'),

  FIREBASE_SERVICE_ACCOUNT_JSON: getEnv('FIREBASE_SERVICE_ACCOUNT_JSON', false),
  GOOGLE_CREDENTIALS_JSON: getEnv('GOOGLE_CREDENTIALS_JSON', false),
  DATABASE_URL: getEnv('DATABASE_URL', false, 'file:/data/db/custom.db'),
};

console.log('--- Diagnóstico de Variables ---');
console.log('TELEGRAM_BOT_TOKEN:', env.TELEGRAM_BOT_TOKEN ? '✅' : '❌');
console.log('GROQ_API_KEY:', env.GROQ_API_KEY ? '✅' : '❌');
console.log('GOOGLE_AI_KEY:', env.GOOGLE_AI_KEY ? '✅' : '❌');
console.log('TAVILY_API_KEY:', env.TAVILY_API_KEY ? '✅' : '❌');
console.log('FIREBASE:', env.FIREBASE_SERVICE_ACCOUNT_JSON ? '✅' : '❌');
console.log('GOOGLE_AUTH:', (env.GOOGLE_CREDENTIALS_JSON || fs.existsSync('./credentials.json')) ? '✅' : '❌');
console.log('GITHUB_TOKEN:', env.GITHUB_TOKEN ? '✅' : '❌');
console.log('--- Orquesta de Especialistas ---');
console.log('EJECUTIVO (Gemma):', env.LOCAL_AI_MODEL_EXECUTIVE);
console.log('ANALISTA/INGENIERO (Qwen):', env.LOCAL_AI_MODEL_ANALYST);
console.log('RAZONADOR (DeepSeek):', env.LOCAL_AI_MODEL_REASONER);
console.log('SENTIDOS (LLaVA):', env.LOCAL_AI_MODEL_SENSES);
console.log('--------------------------------');