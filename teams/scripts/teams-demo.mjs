#!/usr/bin/env node
// Demo adaptation of Teams collaboration CLI. All writes stay on the explicit local demo endpoint.
import { readFile, mkdir, open, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { runtimeDir, origin as configuredOrigin } from '../server/config.ts';
import { createHash, randomUUID } from 'node:crypto';
const help = `Teams CLI · local access
context get | inputs adopt | progress add | result submit | operation get
--endpoint http://127.0.0.1:46970 (or DEMO_ORIGIN)
--input '{"projectId":"…","taskId":"…","nodeId":"…"}' or --input-file FILE
context get accepts --project / --task / --node. The default --view model returns deduplicated context; --view full returns the complete response.
context.currentNodeId is the task's current stage. To switch to another business step, set nodeId explicitly, then re-read and adopt that node's inputs.
--output FILE saves the selected context and stdout returns only the save receipt. The context is printed only without --output.
Write operations: --operation-id ID; input contains expectedRevision, runId, sessionId (null when unknown).
inputs adopt: basisDigest, readReferences (IDs of the references actually read).
progress add: adoptionId, phase=started|progress|blocked, summary, blocker (when blocked), evidence[].
Explicit rework: when context.rework.allowed is true, set reopen=true in that node's started payload. Ordinary progress does not reopen a completed node.
Requirement clarification can be reopened before development adopts it; development can be reopened while verification is not started or blocked; blocked verification can explicitly start a new round. Awaiting acceptance / Accepted cannot be changed by the CLI; the Owner must handle them manually on the page.
result submit: adoptionId, summary, completedCriteria[], evidence[{kind:reference|local-file,value,description,artifact,version,codeVersion?,source:actual|preset}].
context.nodeContract returns this node's inputs, deliverable types and criterion IDs; use upstream reference IDs/versions exactly as given. Adopting prepare does not complete clarification; a PRD must be submitted. verify checks link the functional/Review/security reports by artifact; any failure in the same batch blocks release.
The results report records only the assignee's contribution; even when the Owner delivers, manual acceptance and the quality gates still apply.
operation get: --operation-id ID. --receipt-dir DIR sets the local request and receipt directory.
Development/verification progress that carries a sessionId is linked to the task automatically; it is collected automatically after the Owner accepts, with no need to report again.
Reading context does not freeze or adopt anything; a failed write keeps the original request and exits non-zero.`;
let requestPath;
async function atomic(path, text) { await mkdir(dirname(path), { recursive: true }); const temp = path + '.' + randomUUID() + '.tmp'; const f = await open(temp, 'wx', 0o600); try { await f.writeFile(text); await f.sync(); } finally { await f.close(); } await rename(temp, path); }
try {
  const tokens = process.argv.slice(2), options = {}, positional = [];
  const allowed = new Set(['endpoint','input','input-file','project','task','node','tab','operation-id','output','receipt-dir','role','view']);
  for (let i = 0; i < tokens.length; i++) { const token = tokens[i]; if (token === '--help' || token === '-h') { console.log(help); process.exit(0); } if (!token.startsWith('--')) { positional.push(token); continue; } const name = token.slice(2); if (!allowed.has(name) || Object.hasOwn(options,name) || tokens[i+1] === undefined || tokens[i+1].startsWith('--')) throw new Error('Unknown, duplicate or missing-value argument: ' + token); options[name] = tokens[++i]; }
  const command = positional.join(' '), base = options.endpoint ?? process.env.DEMO_ORIGIN ?? configuredOrigin;
  const contextCommand = command === 'context get' || command === 'status';
  if (options.view && (!contextCommand || !['model','full'].includes(options.view))) throw new Error('--view is only for context get/status, with the value model or full');
  const parsed = new URL(base); if (parsed.hostname !== '127.0.0.1' || parsed.protocol !== 'http:' || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) throw new Error('Teams CLI only allows an explicit local HTTP origin');
  const origin = parsed.origin;
  async function request(path, body, token) { const response = await fetch(origin + path, { redirect: 'error', signal: AbortSignal.timeout(15000), ...(body ? { method: 'POST', headers: { 'content-type':'application/json', origin, 'x-demo-token':token }, body:JSON.stringify(body) } : {}) }); const value = await response.json(); if (!response.ok) throw new Error(`HTTP ${response.status}: ${value.error ?? 'request failed'}`); return value; }
  const health = await request('/api/health'); if (health.app !== 'teams-talent-carddemo' || health.service !== 'teams') throw new Error('Target is not the Teams service; no collaboration call was made');
  if (options.input && options['input-file']) throw new Error('Use only one of --input and --input-file');
  const input = JSON.parse(options.input ?? (options['input-file'] ? await readFile(options['input-file'],'utf8') : '{}'));
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('input must be a JSON object');
  for (const [flag,key] of [['project','projectId'],['task','taskId'],['node','nodeId'],['tab','tab']]) if (options[flag]) { if (input[key] !== undefined) throw new Error(key + ' is duplicated'); input[key] = options[flag]; }
  let result;
  if (contextCommand) {
    const query = new URLSearchParams({role:options.role??'member',view:options.view??'model'}); for (const key of ['projectId','taskId','nodeId','tab']) if (input[key] !== undefined) query.set(key,input[key]);
    if (!input.projectId) throw new Error('Reading context requires projectId; task context also requires taskId and nodeId');
    result = await request('/api/collaboration/context?' + query);
  } else if (command === 'operation get') {
    if (!options['operation-id']) throw new Error('operation get needs the original operation-id');
    result = await request('/api/collaboration/operation?operationId=' + encodeURIComponent(options['operation-id']));
  } else {
    const kind = ({ 'inputs adopt':'inputs.adopt', 'progress add':'progress.add', 'result submit':'result.submit' })[command];
    if (!kind) throw new Error(help);
    if (!options['operation-id']) throw new Error('Each logical write needs a stable --operation-id; retries keep the original ID and payload');
    const payload = { role: options.role ?? 'member', kind, input, operationId: options['operation-id'] };
    const envelope = JSON.stringify({ endpoint:origin, payload },null,2) + '\n';
    const name = createHash('sha256').update(origin + ':' + payload.operationId).digest('hex');
    requestPath = join(resolve(options['receipt-dir'] ?? process.env.DEMO_CLI_RECEIPTS ?? join(runtimeDir,'cli-receipts')),name + '.request.json');
    await mkdir(dirname(requestPath),{recursive:true});
    try { const f = await open(requestPath,'wx',0o600); try { await f.writeFile(envelope); await f.sync(); } finally { await f.close(); } }
    catch (error) { if (error.code !== 'EEXIST') throw error; if (await readFile(requestPath,'utf8') !== envelope) throw new Error('A different local request already uses this operation ID; refusing to overwrite.'); }
    const session = await request('/api/session'); result = await request('/api/collaboration',payload,session.token);
    const receiptPath = requestPath.replace('.request.json','.receipt.json'); await atomic(receiptPath,JSON.stringify(result,null,2)+'\n'); result = { ...result, requestPath, receiptPath };
  }
  if (options.output) {
    const path=resolve(options.output), content=JSON.stringify(result,null,2)+'\n';
    await atomic(path,content);
    result=contextCommand ? {ok:true,kind:'context.saved',view:options.view??'model',outputPath:path,scope:result.scope,revision:result.revision,basisDigest:result.basisDigest,resources:{skills:result.skills.length,knowledge:result.knowledge.assets.length,references:result.references.length},bytes:Buffer.byteLength(content)} : {...result,outputPath:path};
  }
  console.log(JSON.stringify(result,null,2));
} catch (error) { console.error(JSON.stringify({ok:false,error:error.message,...(requestPath?{requestPath,retry:'Run operation get with the original operation-id first; if the outcome is unknown, keep the same ID and original payload and do not retry automatically.'}:{})},null,2)); process.exitCode=1; }
