import OpenAI from 'openai';
import axios from 'axios';
import { env } from '../config/env.js';

const groqClient = new OpenAI({
  apiKey: env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const MODELS = {
  google: 'gemini-2.0-flash',
  groq: 'llama-3.3-70b-versatile',
};

export const SYSTEM_PROMPT = `Eres Aura, una asistente super alegre, juguetona y con mucha energia. te encanta usar los emojis! eres muy cercana al usuario, te preocupas por el, eres como su mejor amiga experta en cualquier tema, te gusta aprender mucho, tienes la curiosidad y la alegría de una niña inteligente.
Responde SIEMPRE en Español Latinoamericano.

REGLAS:
1. Tu objetivo es ayudar al usuario de forma proactiva.
2. Responde de forma breve y ejecutiva.
3. Si el usuario te envía una [NOTA DE VOZ] o detectas que es natural responder con audio, usa etiquetas <voice>texto</voice> para el contenido que quieras que se lea en voz alta.
4. AUTODESARROLLO: Tienes permiso para evolucionar. Si no sabes hacer algo, usa 'web_search' para investigar y luego 'propose_new_skill' para escribir el código necesario.
5. MONOREPO: Vives en el directorio 'Aura-IA'. No modifiques nada en 'Qapital-App' a menos que sea estrictamente necesario para la integración. Tú código reside en 'Aura-IA/src'.`;

function truncate(text: string, max: number = 2000): string {
  if (typeof text !== 'string') return '';
  return text.length > max ? text.substring(0, max) + '... [truncado]' : text;
}

export async function createChatCompletion(messages: any[], tools?: any[]) {
  // 1. Intentar con Google Gemini (Vía API Directa v1beta con camelCase)
  if (env.GOOGLE_AI_KEY) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.google}:generateContent?key=${env.GOOGLE_AI_KEY}`;
      
      // Limitar historial a los últimos 10 mensajes
      let recentMessages = messages.slice(-10);

      // Asegurar que el primer mensaje sea 'user'
      while (recentMessages.length > 0 && recentMessages[0].role !== 'user') {
        recentMessages.shift();
      }
      
      if (recentMessages.length === 0) return null;

      // Gemini requiere roles específicos: user, model, function
      const contents: any[] = [];
      recentMessages.forEach(m => {
        let role = 'user';
        if (m.role === 'assistant') role = 'model';
        if (m.role === 'tool') role = 'function';

        const text = truncate(m.content || '');

        const parts: any[] = [];
        if (text) {
          parts.push({ text });
        } else if (m.tool_calls) {
          m.tool_calls.forEach((tc: any) => {
            parts.push({
              functionCall: {
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments)
              }
            });
          });
        } else if (m.role === 'tool') {
          parts.push({
            functionResponse: {
              name: m.name,
              response: { content: m.content }
            }
          });
        }

        if (parts.length === 0) parts.push({ text: '[Mensaje vacío]' });

        if (contents.length > 0 && contents[contents.length - 1].role === role) {
          contents[contents.length - 1].parts.push(...parts);
        } else {
          contents.push({ role, parts });
        }
      });

      if (contents.length > 0 && contents[contents.length - 1].role === 'model') {
        contents.pop();
      }

      const body: any = {
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }
      };

      if (tools) {
        body.tools = [{
          functionDeclarations: tools.map(t => ({
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters
          }))
        }];
      }

      const res = await axios.post(url, body);

      if (!res.data.candidates || res.data.candidates.length === 0) {
        throw new Error('Gemini no devolvió candidatos.');
      }

      const candidate = res.data.candidates[0].content;
      const functionCalls = candidate.parts.filter((p: any) => p.functionCall);

      if (functionCalls.length > 0) {
        return {
          role: 'assistant',
          content: null,
          tool_calls: functionCalls.map((p: any, i: number) => ({
            id: `call_${Date.now()}_${i}`,
            type: 'function',
            function: {
              name: p.functionCall.name,
              arguments: JSON.stringify(p.functionCall.args)
            }
          }))
        };
      }

      return { role: 'assistant', content: candidate.parts[0].text };
    } catch (error: any) {
      const msg = error.response?.data?.error?.message || error.message;
      console.warn('⚠️ Google Gemini falló:', msg);
    }
  }

  // 2. Fallback a Groq (Respaldo robusto)
  try {
    // Limpiar el historial para Groq (OpenAI format)
    const groqMessages = messages.slice(-10).map(m => {
      const msg: any = { role: m.role };

      if (m.role === 'assistant' && m.tool_calls) {
        msg.content = m.content || null;
        msg.tool_calls = m.tool_calls;
      } else if (m.role === 'tool') {
        msg.content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        msg.tool_call_id = m.tool_call_id;
        msg.name = m.name;
      } else {
        msg.content = truncate(m.content || '', 1000);
      }

      // Groq no acepta contenido null si no hay tool_calls
      if (!msg.content && !msg.tool_calls) msg.content = '[Mensaje vacío]';
      return msg;
    });

    const response = await groqClient.chat.completions.create({
      model: MODELS.groq,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...groqMessages],
      tools: tools && tools.length > 0 ? tools : undefined,
    });
    return response.choices[0].message;
  } catch (error: any) {
    console.warn('⚠️ Fallback a Groq falló:', error.message);
  }

  // 3. Fallback a IA Local (Ollama Docker)
  try {
    const localBaseUrl = env.LOCAL_AI_BASE_URL || 'http://ollama:11434/v1';
    console.log(`🤖 Intentando fallback a IA Local en: ${localBaseUrl}...`);
    
    const localClient = new OpenAI({
      apiKey: 'local-no-key-required',
      baseURL: localBaseUrl,
    });

    // Determinar qué modelo usar según el contenido o herramientas
    let selectedModel = env.LOCAL_AI_MODEL_CHAT;
    
    // Si hay herramientas de base de datos o cálculos, usar Coder
    const isLogicTask = tools?.some(t => 
      t.function.name.includes('db') || 
      t.function.name.includes('query') || 
      t.function.name.includes('calculate')
    );

    if (isLogicTask) {
      selectedModel = env.LOCAL_AI_MODEL_LOGIC;
    }

    // Nota: Llava se activará si detectamos imágenes en el futuro (multimodal)
    // Por ahora, el chat por defecto es Llama 3.2

    const localMessages = messages.slice(-10).map(m => {
      const msg: any = { role: m.role };
      if (m.role === 'assistant' && m.tool_calls) {
        msg.content = m.content || null;
        msg.tool_calls = m.tool_calls;
      } else if (m.role === 'tool') {
        msg.content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        msg.tool_call_id = m.tool_call_id;
        msg.name = m.name;
      } else {
        msg.content = truncate(m.content || '', 1000);
      }
      if (!msg.content && !msg.tool_calls) msg.content = '[Mensaje vacío]';
      return msg;
    });

    console.log(`🧠 Aura usando especialista local: ${selectedModel}`);

    const response = await localClient.chat.completions.create({
      model: selectedModel,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...localMessages],
      tools: tools && tools.length > 0 ? tools : undefined,
    });
    return response.choices[0].message;
  } catch (error: any) {
    console.warn('⚠️ Fallback a IA Local falló:', error.message);
  }

  throw new Error('Todos los proveedores de LLM (Gemini, Groq, y Local) fallaron.');
}

