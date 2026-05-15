import Database from 'better-sqlite3';
import { env } from '../config/env.js';

class QapitalService {
  private db: Database.Database | null = null;

  constructor() {
    this.connect();
  }

  // Obtener el ID del primer usuario registrado (para desarrollo local)
  async getDefaultUser() {
    if (!this.db) return null;
    const user = this.db.prepare('SELECT id FROM User LIMIT 1').get();
    return user ? (user as any).id : null;
  }

  private connect() {
    try {
      const dbPath = env.DATABASE_URL.replace('file:', '');
      console.log(`🔌 Aura conectando a Qapital DB en: ${dbPath}`);
      this.db = new Database(dbPath, { readonly: true });
    } catch (error) {
      console.error('❌ Error conectando a Qapital DB:', error);
    }
  }

  // Obtener el estado financiero general de un usuario
  async getUserFinances(userId: string) {
    if (!this.db) return null;
    
    const accounts = this.db.prepare('SELECT * FROM accounts WHERE userId = ?').all(userId);
    const totalBalance = accounts.reduce((acc: any, curr: any) => acc + Number(curr.balance), 0);
    
    const recentTransactions = this.db.prepare(`
      SELECT * FROM transactions 
      WHERE userId = ? 
      ORDER BY date DESC 
      LIMIT 10
    `).all(userId);

    return {
      accounts,
      totalBalance,
      recentTransactions
    };
  }

  // Obtener el perfil de salud y restricciones
  async getUserHealth(userId: string) {
    if (!this.db) return null;

    const profile = this.db.prepare('SELECT * FROM health_profiles WHERE userId = ?').get(userId);
    const medications = this.db.prepare('SELECT * FROM medications WHERE userId = ? AND isActive = 1').all(userId);

    return {
      profile,
      medications
    };
  }

  // Detectar anomalías (Gasto excesivo o comida prohibida)
  async detectAnomalies(userId: string) {
    if (!this.db) return [];

    const anomalies = [];
    
    // Ejemplo: Gasto en categoría 'Comida' en las últimas 24h
    const recentFoodExpenses = this.db.prepare(`
      SELECT * FROM transactions 
      WHERE userId = ? 
      AND category = 'Comida' 
      AND date > datetime('now', '-1 day')
    `).all(userId);

    // Si hay más de 3 gastos de comida en un día, es una anomalía de comportamiento
    if (recentFoodExpenses.length > 3) {
      anomalies.push({
        type: 'behavioral',
        reason: 'Múltiples gastos en comida detectados hoy',
        data: recentFoodExpenses
      });
    }

    return anomalies;
  }
}

export const qapital = new QapitalService();
