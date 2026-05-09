import { Bot, InputFile, InlineKeyboard } from 'grammy';
import { env } from '../config/env.js';
import { runAgentLoop } from '../agent/loop.js';
import { memory } from '../memory/db.js';
import { voiceService } from '../services/voice.js';
import { googleService } from '../services/google.js';

const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

// Configuración de comandos en el menú de Telegram
bot.api.setMyCommands([
  { command: 'start', description: 'Iniciar Aura' },
  { command: 'menu', description: 'Abrir panel de control' },
  { command: 'clear', description: 'Borrar historial de chat' },
  { command: 'google_auth', description: 'Vincular Google Calendar/Gmail' },
]);

// Middleware para verificar lista blanca de usuarios
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId || !env.TELEGRAM_ALLOWED_USER_IDS.includes(userId)) {
    console.warn(`[Seguridad] Usuario bloqueado intentó acceder: ${userId} (@${ctx.from?.username})`);
    return;
  }
  await next();
});

// Middleware para evitar procesar el mismo mensaje varias veces (duplicados por reintentos de Telegram)
bot.use(async (ctx, next) => {
  const updateId = ctx.update.update_id;
  const isProcessed = await memory.isUpdateProcessed(updateId);
  if (isProcessed) {
    console.log(`[Bot] Ignorando actualización duplicada: ${updateId}`);
    return;
  }
  await memory.markUpdateAsProcessed(updateId);
  await next();
});

// --- COMANDOS ---

bot.command('start', async (ctx) => {
  await ctx.reply('¡Hola! Soy Aura, tu asistente personal de IA. ¿En qué te puedo ayudar hoy?');
});

bot.command('menu', async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text('📧 Gmail', 'gmail_list').text('📅 Calendario', 'calendar_list').row()
    .text('🧠 Estado', 'aura_status').text('🗑️ Borrar Memoria', 'confirm_clear').row();
  
  await ctx.reply('🎮 **Panel de Control de Aura**\nElige una opción:', {
    reply_markup: keyboard,
    parse_mode: 'Markdown'
  });
});

bot.command(['clear', 'borrar'], async (ctx) => {
  const userId = ctx.from!.id;
  await memory.clearHistory(userId);
  await ctx.reply('🧹 He borrado nuestra memoria reciente. ¡Empecemos de cero!');
});

bot.command('google_auth', async (ctx) => {
  const url = await googleService.getAuthUrl();
  await ctx.reply('🔐 Para que pueda manejar tu Gmail y Calendario, necesito tu permiso.\n\n' +
    '1. Entra a este enlace:\n' + url + '\n\n' +
    '2. Inicia sesión y copia el código que te den.\n' +
    '3. Pégamelo aquí mismo.');
});

// --- MANEJADORES DE BOTONES ---

bot.callbackQuery('confirm_clear', async (ctx) => {
  const keyboard = new InlineKeyboard()
    .text('✅ SÍ, BORRAR TODO', 'do_clear')
    .text('❌ CANCELAR', 'cancel_clear');
  await ctx.editMessageText('⚠️ **¿Estás seguro?** Esta acción borrará toda nuestra memoria reciente y no se puede deshacer.', {
    reply_markup: keyboard,
    parse_mode: 'Markdown'
  });
});

bot.callbackQuery('do_clear', async (ctx) => {
  await memory.clearHistory(ctx.from.id);
  await ctx.editMessageText('🧹 Memoria borrada con éxito.');
});

bot.callbackQuery('cancel_clear', async (ctx) => {
  await ctx.editMessageText('Acción cancelada. Seguimos igual.');
});

// --- PROCESAMIENTO DE MENSAJES ---

async function processAndSendResponse(ctx: any, responseText: string) {
  const voiceMatch = responseText.match(/<voice>([\s\S]*?)<\/voice>/i);
  
  if (voiceMatch) {
    const voiceText = voiceMatch[1].trim();
    const cleanText = responseText.replace(/<voice>[\s\S]*?<\/voice>/i, '').trim();

    if (cleanText) {
      await ctx.reply(cleanText);
    }
    
    await ctx.replyWithChatAction('record_voice');
    const audioPath = await voiceService.textToSpeech(voiceText);
    if (audioPath) {
      await ctx.replyWithVoice(new InputFile(audioPath));
    } else {
      await ctx.reply(voiceText);
    }
  } else {
    await ctx.reply(responseText);
  }
}

bot.on('message:text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;

  // Manejo de código de Google
  if (text.startsWith('4/') && text.length > 20) {
    await ctx.reply('⏳ Validando código de Google...');
    await googleService.setTokenFromCode(userId, text);
    await ctx.reply('✅ ¡Listo! Ya tengo permiso para Google.');
    return;
  }

  // MENSAJE DE ESPERA UX
  const waitMsg = await ctx.reply('⏳ Estoy procesando tu solicitud, dame un momento...', {
    reply_to_message_id: ctx.message.message_id
  });

  try {
    await ctx.replyWithChatAction('typing');
    const responseText = await runAgentLoop(userId, text, ctx);
    
    // Borrar mensaje de espera antes de enviar la respuesta real
    try { await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch(e) {}
    
    await processAndSendResponse(ctx, responseText);
  } catch (error: any) {
    console.error('Error en el bucle del agente:', error);
    await ctx.api.editMessageText(ctx.chat.id, waitMsg.message_id, '❌ Lo siento, me he quedado sin tiempo o ha ocurrido un error. ¿Podrías intentar de nuevo?');
  }
});

bot.on('message:voice', async (ctx) => {
  const userId = ctx.from.id;
  const fileId = ctx.message.voice.file_id;

  const waitMsg = await ctx.reply('🎤 Recibido. Estoy escuchando y procesando...', {
    reply_to_message_id: ctx.message.message_id
  });

  try {
    const file = await ctx.api.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const transcription = await voiceService.transcribeAudio(fileUrl);
    
    await ctx.api.editMessageText(ctx.chat.id, waitMsg.message_id, `🎤 He entendido: "${transcription}"\n\n⏳ Pensando respuesta...`);
    
    await ctx.replyWithChatAction('typing');
    const responseText = await runAgentLoop(userId, `[NOTA DE VOZ]: ${transcription}`, ctx);
    
    try { await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch(e) {}
    
    await processAndSendResponse(ctx, responseText);
  } catch (error: any) {
    console.error('Error procesando voz:', error);
    await ctx.api.editMessageText(ctx.chat.id, waitMsg.message_id, '❌ Tuve un problema procesando tu nota de voz.');
  }
});

bot.on('message:document', async (ctx) => {
  const doc = ctx.message.document;
  if (doc.mime_type !== 'application/pdf') {
    return await ctx.reply('⚠️ Por ahora solo puedo procesar archivos PDF.');
  }

  const waitMsg = await ctx.reply('📄 PDF recibido. Estoy analizando el contenido...', {
    reply_to_message_id: ctx.message.message_id
  });

  try {
    const file = await ctx.api.getFile(doc.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    
    // Mensaje persuasivo para que el agente no ignore el archivo
    const agentPrompt = `DOCUMENTO RECIBIDO: ${doc.file_name}\nEl usuario te ha enviado este archivo PDF. Para leer su contenido, DEBES usar inmediatamente la herramienta 'read_pdf' con esta URL: ${fileUrl}\n\nNo respondas que no puedes leerlo, simplemente usa la herramienta.`;
    
    const responseText = await runAgentLoop(ctx.from.id, agentPrompt, ctx);
    
    try { await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id); } catch(e) {}
    await processAndSendResponse(ctx, responseText);
  } catch (error: any) {
    console.error('Error procesando documento:', error);
    await ctx.api.editMessageText(ctx.chat.id, waitMsg.message_id, '❌ Hubo un error al intentar leer este PDF.');
  }
});


export { bot };

export function startBot() {
  if (!process.env.VERCEL) {
    bot.start({
      onStart: (botInfo) => {
        console.log(`🤖 Bot iniciado como @${botInfo.username}`);
      },
    });
  }
}
