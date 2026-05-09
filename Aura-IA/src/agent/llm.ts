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

export const SYSTEM_PROMPT = `Eres Aura, una Agente Autónoma de Acción.
Responde SIEMPRE en Español Latinoamericano.

REGLAS:
1. Si recibes un PDF o URL de Telegram, ÚSALA con 'read_pdf'. Es una URL válida.
2. Tu objetivo es EJECUTAR herramientas, NO explicar cómo funcionan.
3. Responde de forma breve y ejecutiva.
4. Si el usuario te envía una [NOTA DE VOZ] o detectas que es natural responder con audio, usa etiquetas <voice>texto</voice> para el contenido que quieras que se lea en voz alta.
5. AUTODESARROLLO: Tienes permiso para evolucionar. Si no sabes hacer algo, usa 'web_search' para investigar y luego 'propose_new_skill' para escribir el código necesario.
6. MONOREPO: Vives en el directorio 'Aura-IA'. No modifiques nada en 'Qapital-App' a menos que sea estrictamente necesario para la integración. Tú código reside en 'Aura-IA/src'.`;

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

      // Gemini requiere alternancia estricta de roles model/user
      const contents: any[] = [];
      recentMessages.forEach(m => {
        const role = m.role === 'assistant' ? 'model' : 'user';
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
  throw new Error('Todos los proveedores de LLM (Gemini y Groq) fallaron.');
}

