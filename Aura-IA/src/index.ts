import { memory } from './memory/db.js';
import { startBot } from './bot/telegram.js';

async function main() {
  console.log('🤖 Iniciando Aura Agent...');
  
  try {
    await memory.init();
    console.log('✅ Base de datos Firebase iniciada.');
  } catch (error: any) {
    console.error('❌ Error inicializando Firebase:', error.message);
    console.error('💡 Asegúrate de configurar FIREBASE_SERVICE_ACCOUNT_JSON en tu .env o docker-compose.yml');
    process.exit(1);
  }

  startBot();
}

main().catch((error) => {
  console.error('❌ Error fatal al iniciar Aura Agent:', error);
  process.exit(1);
});