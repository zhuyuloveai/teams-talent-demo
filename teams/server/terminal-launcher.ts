/** Windows selection/encoding follows chrys-manager chrys_launcher.py:284–388
 * (361b4f218098de1b44625cf9c56f18b64993b5f7). Independent consoles use PowerShell Start-Process
 * instead of cmd/start; ProcessStartInfo bypasses PS 5.1 argv binding.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, isAbsolute, join, resolve, win32 } from 'node:path';
import { homedir } from 'node:os';
import { interactiveEnvironment, interactiveShellSetup } from '../scripts/native/interactive-environment.mjs';
const exec = promisify(execFile);
export interface TerminalInput { executable: string; directory: string; args: string[]; instruction?: string; keepOpen?: boolean; terminal?: string }
export interface TerminalOption { id: string; name: string; path?: string }
export async function macTerminals(directories = ['/System/Applications/Utilities', '/Applications', join(homedir(), 'Applications')]): Promise<TerminalOption[]> {
  const found: TerminalOption[] = [];
  for (const [id, name] of [['terminal', 'Terminal'], ['ghostty', 'Ghostty']]) for (const directory of directories) {
    const path = join(directory, name + '.app');
    try { if ((await stat(path)).isDirectory()) { found.push({ id, name, path }); break; } }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return found;
}
export interface TerminalRuntime {
  platform: NodeJS.Platform; env: NodeJS.ProcessEnv;
  macTerminals(): Promise<TerminalOption[]>;
  resolveExecutable(name: string): Promise<string | null>;
  execute(file: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }): Promise<{ stdout: string } | void>;
}
export interface TerminalReceipt { status: 'terminal-requested'; terminal: 'Windows Terminal' | 'PowerShell' | 'Terminal' | 'Ghostty'; pid?: number; terminalId?: string; command: string; note: string }
export const posixQuote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
export const powershellQuote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
export function formatShellCommand(args: string[], platform: NodeJS.Platform = process.platform) {
  return (platform === 'win32' ? '& ' : '') + args.map(platform === 'win32' ? powershellQuote : posixQuote).join(' ');
}
/**
 * Interactive terminals must not inherit the host agent's non-interactive color
 * suppression (`NO_COLOR=1`, `TERM=dumb`). Keep the user's terminal profile, but
 * make the launched TUI advertise a color-capable terminal.
 */
export function launchEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return interactiveEnvironment(env);
}
/** CommandLineToArgv/CRT inverse: quote every argv element, including empty values. */
export function windowsArgument(value: string) {
  return '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1') + '"';
}
export function powershellPayload(input: TerminalInput) {
  return ["$ErrorActionPreference = 'Stop'", `Set-Location -LiteralPath ${powershellQuote(input.directory)}`,
    ...(input.instruction ? [`Write-Host ${powershellQuote(input.instruction)}`] : []),
    '$start = New-Object System.Diagnostics.ProcessStartInfo', `$start.FileName = ${powershellQuote(input.executable)}`,
    `$start.WorkingDirectory = ${powershellQuote(input.directory)}`, '$start.UseShellExecute = $false',
    `$start.Arguments = ${powershellQuote(input.args.map(windowsArgument).join(' '))}`,
    '$tool = [System.Diagnostics.Process]::Start($start)', "if ($null -eq $tool) { throw 'Tool process was not started' }",
    '$tool.WaitForExit()', '$toolExit = $tool.ExitCode', '$tool.Dispose()',
    input.keepOpen === false ? 'exit $toolExit' : "if ($toolExit -ne 0) { Write-Host ('Tool exit code: ' + $toolExit) }",
  ].join('\n');
}
export async function findExecutable(name: string, platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env, canExecute = async (path: string) => {
  try { await access(path, constants.X_OK); return (await stat(path)).isFile(); } catch (error) { if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return false; throw error; }
}) {
  const paths = platform === 'win32' ? win32 : { isAbsolute, join, resolve };
  const explicit = paths.isAbsolute(name) || /[\\/]/.test(name);
  const names = platform === 'win32' && !/\.[a-z0-9]+$/i.test(name) ? [name + '.exe', name + '.cmd', name + '.bat'] : [name];
  const candidates = explicit ? names : (env.PATH ?? env.Path ?? '').split(platform === 'win32' ? ';' : delimiter).filter(Boolean).flatMap(dir => names.map(file => paths.join(dir.replace(/^"|"$/g, ''), file)));
  for (const path of candidates) {
    try { if (await canExecute(path)) return paths.resolve(path); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // Windows App Execution Aliases (for example wt.exe under WindowsApps) can
      // deny stat() while access(X_OK) succeeds. Treat them as absent during PATH
      // discovery; an explicitly configured path still reports the real error.
      if (!explicit && platform === 'win32' && (code === 'EACCES' || code === 'EPERM')) continue;
      throw error;
    }
  }
  return null;
}
export function createTerminalLauncher(overrides: Partial<TerminalRuntime> = {}) {
  const platform = overrides.platform ?? process.platform, env = overrides.env ?? process.env;
  const runtime: TerminalRuntime = { platform, env, macTerminals, resolveExecutable: name => findExecutable(name, platform, env), execute: async (file, args, options) => { const result = await exec(file, args, { ...options, timeout: 15000, maxBuffer: 65536, windowsHide: true }); return { stdout: result.stdout }; }, ...overrides };
  async function configured(key: string, names: string[]) {
    const explicit = runtime.env[key];
    if (explicit) {
      if (!(runtime.platform === 'win32' ? win32.isAbsolute(explicit) : isAbsolute(explicit))) throw new Error(key + ' must be an absolute path');
      const found = await runtime.resolveExecutable(explicit); if (!found) throw new Error(key + ' points to an executable that does not exist'); return found;
    }
    for (const name of names) { const found = await runtime.resolveExecutable(name); if (found) return found; }
    return null;
  }
  return { async terminals(): Promise<TerminalOption[]> {
    if (runtime.platform === 'darwin') return runtime.macTerminals();
    if (runtime.platform === 'win32') return [{ id: 'system', name: runtime.env.WT_SESSION && runtime.env.DEMO_WINDOWS_TERMINAL !== 'none' && await configured('DEMO_WINDOWS_TERMINAL', ['wt.exe']) ? 'Windows Terminal' : 'PowerShell' }];
    return [];
  }, async launch(input: TerminalInput): Promise<TerminalReceipt> {
    if (runtime.env.DEMO_NATIVE_DISABLED === '1') throw new Error('This verification instance does not allow real native launches');
    if (!['darwin', 'win32'].includes(runtime.platform)) throw new Error('Automatic terminal launch supports only Windows and macOS; start the tool manually on this system');
    for (const value of [input.executable, input.directory, ...input.args, input.instruction ?? '']) if (typeof value !== 'string' || value.includes('\0')) throw new Error('Terminal arguments contain invalid characters');
    if (!(runtime.platform === 'win32' ? win32.isAbsolute(input.directory) : isAbsolute(input.directory))) throw new Error('The working directory must be an absolute path');
    const executable = await runtime.resolveExecutable(input.executable); if (!executable) throw new Error('Tool executable not found: ' + input.executable);
    if (runtime.platform === 'win32' && !/\.exe$/i.test(executable)) throw new Error('Automatic launch on Windows needs a native .exe; .cmd/.bat files are not run through a second shell. For OpenCode set DEMO_OPENCODE_BINARY to the absolute path of opencode.exe; for iCode use DEMO_ICODE_BINARY.');
    if (runtime.platform === 'darwin') {
      const selected = (await runtime.macTerminals()).find(item => item.id === (input.terminal ?? 'terminal'));
      if (!selected?.path) throw new Error('The selected terminal is unavailable: ' + (input.terminal ?? 'terminal') + '. Install it or choose again in Agent management; no other terminal was used');
      const command = interactiveShellSetup + 'cd ' + posixQuote(input.directory) + ' && ' + (input.instruction ? 'printf ' + posixQuote('%s\n') + ' ' + posixQuote(input.instruction) + ' && ' : '') + formatShellCommand([executable, ...input.args], 'darwin');
      const application = '"' + selected.path.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';
      // Create a new surface; never send a command to an existing user session.
      const script = selected.id === 'ghostty'
        ? 'on run argv\ntell application ' + application + '\nset cfg to new surface configuration\nset initial working directory of cfg to item 2 of argv\nset command of cfg to item 1 of argv\nset wait after command of cfg to ' + (input.keepOpen === false ? 'false' : 'true') + '\nset agentWindow to new window with configuration cfg\nactivate window agentWindow\nreturn id of (focused terminal of selected tab of agentWindow)\nend tell\nend run'
        : 'on run argv\ntell application ' + application + '\nactivate\nset agentTab to do script (item 1 of argv)\nreturn tty of agentTab\nend tell\nend run';
      const reply = await runtime.execute('/usr/bin/osascript', ['-e', script, selected.id === 'ghostty' ? '/bin/sh -c ' + posixQuote(command) : command, input.directory], { cwd: input.directory, env: launchEnvironment(runtime.env) });
      return { status: 'terminal-requested', terminal: selected.name as 'Terminal' | 'Ghostty', ...(reply?.stdout.trim() ? { terminalId: reply.stdout.trim() } : {}), command, note: 'The system accepted the ' + selected.name + ' launch request; this does not mean the model ran or read the context.' };
    }
    if (input.terminal && input.terminal !== 'system') throw new Error('The selected terminal is not available on Windows; no other terminal was started');
    const launchEnv = launchEnvironment(runtime.env);
    const shell = await configured('DEMO_POWERSHELL_BINARY', ['pwsh.exe', 'powershell.exe', ...(runtime.env.SystemRoot ? [win32.join(runtime.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe')] : [])]);
    if (!shell) throw new Error('PowerShell not found; install PowerShell 7 or set DEMO_POWERSHELL_BINARY to the absolute path of powershell.exe / pwsh.exe');
    const command = powershellPayload({ ...input, executable }), encoded = Buffer.from(command, 'utf16le').toString('base64');
    const shellArgs = [...(input.keepOpen === false ? [] : ['-NoExit']), '-NoProfile', '-EncodedCommand', encoded];
    const wt = runtime.env.DEMO_WINDOWS_TERMINAL === 'none' ? null : await configured('DEMO_WINDOWS_TERMINAL', ['wt.exe']);
    if (runtime.env.WT_SESSION && wt) {
      const profile = runtime.env.WT_PROFILE_ID?.trim();
      if (profile && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profile.replace(/^\{(.*)\}$/, '$1'))) throw new Error('WT_PROFILE_ID must be a valid GUID; no terminal request was sent');
      if (shell.includes(';')) throw new Error('The PowerShell path contains a Windows Terminal command separator; set DEMO_WINDOWS_TERMINAL=none to use a separate console');
      // No user cwd/title/argv is exposed to WT's semicolon command parser.
      await runtime.execute(wt, ['-w', '0', 'nt', ...(profile ? ['--profile', profile] : []), '--title', 'Teams Agent', shell, ...shellArgs], { cwd: input.directory, env: launchEnv });
      return { status: 'terminal-requested', terminal: 'Windows Terminal', command, note: 'Windows Terminal accepted the new tab request; this does not mean the tool has read the context or finished the work.' };
    }
    // Start-Process creates a fresh console with real standard handles; detached +
    // stdio:ignore would pass NUL to a TUI even if the process itself was started.
    const controller = ["$ErrorActionPreference = 'Stop'",
      `$terminal = Start-Process -FilePath ${powershellQuote(shell)} -ArgumentList ${powershellQuote(shellArgs.join(' '))} -WorkingDirectory ${powershellQuote(input.directory)} -WindowStyle Normal -PassThru -ErrorAction Stop`,
      '[Console]::WriteLine($terminal.Id)',
    ].join('\n');
    const reply = await runtime.execute(shell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(controller, 'utf16le').toString('base64')], { cwd: input.directory, env: launchEnv });
    const pidText = reply?.stdout.trim(), pid = Number(pidText);
    if (!pidText || !/^\d+$/.test(pidText) || !Number.isSafeInteger(pid) || pid < 2) throw new Error('The PowerShell terminal request returned no verifiable PID; the result needs checking and nothing was launched again');
    return { status: 'terminal-requested', terminal: 'PowerShell', pid, command, note: 'The system created a PowerShell terminal process; check the tool launch and model result in the terminal.' };
  } };
}
