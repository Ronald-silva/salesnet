import { config } from 'dotenv';
config({ path: '.env' });

import { seedKnowledgeBase } from './knowledge-base';

async function main(): Promise<void> {
  console.log('[seeds] Iniciando seeds…');
  await seedKnowledgeBase();
  console.log('[seeds] Concluído.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seeds] Falha:', err);
  process.exit(1);
});
