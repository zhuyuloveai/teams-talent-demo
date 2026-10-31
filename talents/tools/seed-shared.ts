// Writes the knowledge Talents publishes in its initial state to shared/seed/talents/, the committed
// fallback Teams reads before Talents has ever started. Rerun after changing server/seed.ts or content/.
// Usage: npm run seed:shared
import { join, relative } from 'node:path';
import { seedDir, repositoryRoot } from '../server/config.ts';
import { seedState } from '../server/seed.ts';
import { buildExport, writeExport } from '../server/export.ts';

const data = buildExport(seedState(), undefined, '2026-10-26T02:32:00.000Z');
await writeExport(seedDir, data);
const files = [...data.files.values()].reduce((n, list) => n + list.length, 0);
console.log(`wrote ${relative(repositoryRoot, join(seedDir, 'talents'))}: ${data.knowledge.artifacts.length} published artifacts, ${files} files`);
