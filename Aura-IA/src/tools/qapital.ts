import { qapital } from '../services/qapital.js';

export const qapitalTools = {
  get_my_finances: {
    definition: {
      type: 'function',
      function: {
        name: 'get_my_finances',
        description: 'CONSULTA OBLIGATORIA para preguntas sobre dinero, saldos, gastos, compras, transacciones o cuánto se ha gastado en un periodo. Devuelve el estado actual de todas las cuentas y las 10 transacciones más recientes.',
        parameters: {
          type: 'object',
          properties: {},
        },
      }
    },
    handler: async () => {
      // Intentar obtener el usuario automáticamente
      const userId = await qapital.getDefaultUser();
      if (!userId) return "No se encontró ningún usuario registrado en la base de datos de Quid.";
      
      const data = await qapital.getUserFinances(userId);
      if (!data) return "No se pudo conectar a la base de datos de Quid.";
      
      return `Datos financieros de usuario ${userId}:\n${JSON.stringify(data, null, 2)}`;
    },
  },
  get_my_health_profile: {
    definition: {
      type: 'function',
      function: {
        name: 'get_my_health_profile',
        description: 'Obtiene el perfil de salud, enfermedades, restricciones alimenticias y medicamentos. Úsala cuando el usuario pregunte qué puede comer o sobre su estado de salud.',
        parameters: {
          type: 'object',
          properties: {},
        },
      }
    },
    handler: async () => {
      const userId = await qapital.getDefaultUser();
      if (!userId) return "No se encontró ningún usuario registrado.";
      
      const data = await qapital.getUserHealth(userId);
      if (!data) return "No se encontró perfil de salud.";
      return JSON.stringify(data, null, 2);
    },
  },
};
