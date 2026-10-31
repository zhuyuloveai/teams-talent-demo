import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runtimeDir } from './config.js';
import { atomicJson } from './store.js';
import { createTerminalLauncher, type TerminalOption } from './terminal-launcher.js';

// Same local preference boundary as Teams business/shared/local-terminal:
// a device user's launch preference, independent of project business state.
export class TerminalPreferences {
  constructor(private directory = runtimeDir, private platform = process.platform, private discover: () => Promise<TerminalOption[]> = () => createTerminalLauncher().terminals()) {}
  async context() {
    const terminals = await this.discover();
    let selectedTerminal = this.platform === 'darwin' ? 'terminal' : 'system', terminalError: string | undefined;
    try {
      const stored = JSON.parse(await readFile(join(this.directory, 'terminal-preference.json'), 'utf8'));
      if (!stored || typeof stored.terminal !== 'string' || !['terminal', 'ghostty', 'system'].includes(stored.terminal)) throw new Error('Invalid local terminal preference format');
      selectedTerminal = stored.terminal;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') terminalError = 'Failed to read the terminal preference; choose again: ' + (error as Error).message;
    }
    const selected = terminals.find(item => item.id === selectedTerminal);
    if (!selected) terminalError ??= 'The selected terminal is unavailable; install it or choose again. No other terminal will be used';
    return { terminals: terminals.map(({ id, name }) => ({ id, name })), selectedTerminal, terminalName: selected?.name ?? selectedTerminal, ...(terminalError ? { terminalError } : {}) };
  }
  async select(terminal: unknown) {
    if (typeof terminal !== 'string' || !(await this.discover()).some(item => item.id === terminal)) throw new Error('The selected terminal is unavailable; the configuration was not saved');
    await atomicJson(join(this.directory, 'terminal-preference.json'), { terminal });
    return this.context();
  }
  async selected(expected?: string) {
    const context = await this.context();
    if (context.terminalError) throw new Error(context.terminalError);
    if (expected !== undefined && context.selectedTerminal !== expected) throw new Error('The terminal configuration changed; confirm the launch again');
    return { id: context.selectedTerminal, name: context.terminalName };
  }
}
export const terminalPreferences = new TerminalPreferences();
