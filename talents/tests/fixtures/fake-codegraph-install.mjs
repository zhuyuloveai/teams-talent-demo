// Stands in for engines/codegraph/run.py --check and the CodeGraph installer in tests (run with node). The self-check
// passes once the install has written FAKE_MARKER; FAKE_INSTALL=fail makes the install fail.
import { existsSync, writeFileSync } from 'node:fs';

const marker = process.env.FAKE_MARKER;
if (process.argv[2] === '--check') {
  if (existsSync(marker)) { console.log('[icode-knowledge-codegraph] Self-check passed: codegraph 1.6.0 (codegraph)'); process.exit(0); }
  console.error('[icode-knowledge-codegraph] Self-check failed: codegraph not found in the PATH of the iCode Knowledge backend. Install it as described in the README and try again.');
  process.exit(1);
}
console.log('Downloading codegraph v1.6.0…');
if (process.env.FAKE_INSTALL === 'fail') { console.error('curl: (6) Could not resolve host'); process.exit(6); }
writeFileSync(marker, '');
console.log('\x1b[32m✓\x1b[0m Installed to ~/.local/bin/codegraph');
