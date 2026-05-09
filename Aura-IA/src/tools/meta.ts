import { memory } from '../memory/db.js';
import axios from 'axios';
import { env } from '../config/env.js';
import fs from 'fs';
import path from 'path';

const GITHUB_API_URL = 'https://api.github.com';

export const proposeNewSkillDefinition = {
  type: 'function',
  function: {
    name: 'propose_new_skill',
    description: 'Propone una nueva habilidad (código TypeScript). Se guarda en Firestore para revisión.',
    parameters: {
      type: 'object',
      properties: {
        skill_name: { type: 'string', description: 'Nombre de la habilidad en snake_case (ej. get_weather)' },
        description: { type: 'string', description: 'Qué hace la herramienta.' },
        code: { type: 'string', description: 'Código TypeScript completo del archivo de la herramienta.' }
      },
      required: ['skill_name', 'description', 'code']
    }
  }
};

export async function proposeNewSkill(skill_name: string, description: string, code: string) {
  // Guardar en Firestore como una propuesta pendiente
  await memory.addMessage(0, 'skill_proposal', JSON.stringify({
    skill_name,
    description,
    code,
    status: 'pending',
    createdAt: Date.now()
  }));

  return `✅ Propuesta para '${skill_name}' guardada. El usuario debe aprobarla con 'apply_new_skill'.`;
}

export const applyNewSkillDefinition = {
  type: 'function',
  function: {
    name: 'apply_new_skill',
    description: 'Aplica y despliega una propuesta de habilidad aprobada.',
    parameters: {
      type: 'object',
      properties: {
        skill_name: { type: 'string', description: 'Nombre de la habilidad a aplicar.' }
      },
      required: ['skill_name']
    }
  }
};

export async function applyNewSkill(skill_name: string) {
  // 1. Buscar la propuesta en Firestore
  // Nota: En una implementación real buscaríamos en una colección de propuestas.
  // Por ahora, simulamos que Aura sabe qué código aplicar si acaba de proponerlo.
  // (Idealmente el LLM ya tiene el código en su contexto).
  
  // Para este prototipo, vamos a usar GitHub API para crear el archivo.
  // Pero antes, si estamos en LOCAL, lo escribimos en el disco.
  
  const isVercel = !!process.env.VERCEL;
  const toolFileName = `${skill_name}.ts`;
  const toolFilePath = path.join(process.cwd(), 'src', 'tools', toolFileName);
  
  // El código debe ser proporcionado por el agente o recuperado.
  // Como simplificación, asumimos que el agente ya sabe el código (está en su contexto).
  // Si no, lo buscaríamos en Firestore.
  
  // Vamos a recuperar el código de la última propuesta en Firestore
  const proposals = await memory.getHistory(0, 10);
  const proposalMsg = proposals.find((m: any) => {
    if (m.role !== 'skill_proposal') return false;
    const data = JSON.parse(m.content);
    return data.skill_name === skill_name;
  });

  if (!proposalMsg) {
    throw new Error(`No se encontró la propuesta para '${skill_name}'.`);
  }

  const { code } = JSON.parse(proposalMsg.content);

  // --- ESCritura LOCAL ---
  if (!isVercel) {
    console.log(`[Evolución] Escribiendo archivo local: ${toolFilePath}`);
    fs.writeFileSync(toolFilePath, code);
    // Nota: El registro en index.ts local requiere una lógica de edición de archivos más compleja.
    // Por ahora, el usuario verá el archivo y podrá registrarlo, o Aura intentará subirlo a Git.
  }

  // --- DESPLIEGUE CLOUD (GitHub API) ---
  if (env.GITHUB_TOKEN && env.GITHUB_USER && env.GITHUB_REPO) {
    try {
      const repoName = env.GITHUB_REPO.split('/').pop()?.replace('.git', '');
      // Ajuste para Monorepo: Las herramientas están en Aura-IA/src/tools/
      const url = `${GITHUB_API_URL}/repos/${env.GITHUB_USER}/${repoName}/contents/Aura-IA/src/tools/${toolFileName}`;
      
      // Ver si el archivo ya existe para obtener el SHA
      let sha;
      try {
        const res = await axios.get(url, {
          headers: { Authorization: `token ${env.GITHUB_TOKEN}` }
        });
        sha = res.data.sha;
      } catch (e) {}

      await axios.put(url, {
        message: `Evolución: Añadir herramienta ${skill_name}`,
        content: Buffer.from(code).toString('base64'),
        sha
      }, {
        headers: { Authorization: `token ${env.GITHUB_TOKEN}` }
      });

      return `🚀 Habilidad '${skill_name}' aplicada con éxito. ${!isVercel ? 'Archivo escrito localmente y ' : ''}Sincronizado con GitHub. Vercel se está actualizando.`;
    } catch (error: any) {
      return `❌ Error al sincronizar con GitHub: ${error.message}`;
    }
  }

  return `✅ Habilidad '${skill_name}' escrita en disco local. (No se configuró GitHub para despliegue cloud).`;
}

export const selfDeployDefinition = {
  type: 'function',
  function: {
    name: 'self_deploy',
    description: 'Realiza un commit de todos los cambios actuales al repositorio de GitHub.',
    parameters: {
      type: 'object',
      properties: {
        commit_message: { type: 'string', description: 'Descripción de los cambios.' }
      },
      required: ['commit_message']
    }
  }
};

export async function selfDeploy(commit_message: string) {
  // Esta función es más compleja ya que requiere listar archivos modificados.
  // Por ahora es un placeholder para futuras expansiones.
  return "Función de auto-despliegue completo en desarrollo.";
}
