const controlled = new Set(['trace2.project.id', 'teams.task.id', 'teams.node.id', 'teams.run.id']);
export function nativeTraceEnvironment(base, scope, endpoint) {
  const value = endpoint ?? base.DEMO_TRACE_ENDPOINT ?? base.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? `http://127.0.0.1:${base.DEMO_TRACE_PORT ?? 8013}/v1/traces`;
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/v1/traces') throw new Error('Teams TUI trace must point to a local HTTP /v1/traces receiver; external addresses and credentials are not allowed');
  const env = { ...base };
  const enabled = base.CHRYS_OTEL ?? 'true';
  if (!['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'].includes(enabled.toLowerCase())) throw new Error('Invalid CHRYS_OTEL setting');
  // Do not inherit unrelated exporters, base endpoints, or authentication headers.
  for (const key of Object.keys(env)) if (/^OTEL_EXPORTER_OTLP_(?:ENDPOINT|LOGS_.*|METRICS_.*|.*HEADERS)$/i.test(key)) delete env[key];
  const attributes = (base.OTEL_RESOURCE_ATTRIBUTES ?? '').split(',').filter(Boolean).filter(item => !controlled.has(item.split('=')[0].trim()));
  for (const [key, raw] of Object.entries({ 'trace2.project.id': scope.projectId, 'teams.task.id': scope.taskId, 'teams.node.id': scope.nodeId, 'teams.run.id': scope.runId })) if (raw) attributes.push(`${key}=${encodeURIComponent(raw)}`);
  const sensitive = base.CHRYS_OTEL_SENSITIVE_DATA ?? 'true';
  if (!['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'].includes(sensitive.toLowerCase())) throw new Error('Invalid CHRYS_OTEL_SENSITIVE_DATA setting');
  Object.assign(env, { CHRYS_OTEL: enabled, CHRYS_OTEL_ENDPOINT: '', CHRYS_OTEL_SENSITIVE_DATA: sensitive, OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf', OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: url.href, OTEL_SERVICE_NAME: base.OTEL_SERVICE_NAME ?? 'icode-local', OTEL_RESOURCE_ATTRIBUTES: attributes.join(','), OTEL_LOGS_EXPORTER: 'none', OTEL_METRICS_EXPORTER: 'none' });
  return { env, endpoint: url.href, sensitiveData: ['true', '1', 'yes', 'on'].includes(sensitive.toLowerCase()), enabled: !['false', '0', 'no', 'off'].includes(String(env.CHRYS_OTEL).toLowerCase()) };
}
export function traceLaunchSettings(trace) {
  return { endpoint: trace.endpoint, enabled: trace.enabled, sensitiveData: trace.sensitiveData, serviceName: trace.env.OTEL_SERVICE_NAME, resourceAttributes: trace.env.OTEL_RESOURCE_ATTRIBUTES };
}
export function traceLaunchEnvironment(base, settings) {
  return settings ? { ...base, CHRYS_OTEL: String(settings.enabled), CHRYS_OTEL_SENSITIVE_DATA: String(settings.sensitiveData), OTEL_SERVICE_NAME: settings.serviceName, OTEL_RESOURCE_ATTRIBUTES: settings.resourceAttributes } : base;
}
export async function checkNativeTraceReceiver(endpoint, expected = {}) {
  const url = new URL(endpoint); url.pathname = '/health';
  const response = await fetch(url, { signal: AbortSignal.timeout(2000), redirect: 'error' });
  if (!response.ok) throw new Error(`Local trace receiver is not ready (HTTP ${response.status})`);
  let health; try { health = await response.json(); } catch { throw new Error('Local trace receiver health response is not valid JSON'); }
  if (!['teams-trace-server', 'teams-local-trace'].includes(health.app) || health.service !== 'trace' || health.status !== 'ok' || health.protocol !== 'otlp/http-protobuf') throw new Error('The local port is not a verified OTLP trace receiver');
  if (expected.app && health.app !== expected.app) throw new Error('Local trace receiver implementation does not match; no trace was sent');
  if (expected.workspaceRoot && health.workspaceRoot !== expected.workspaceRoot || expected.stateRoot && health.stateRoot !== expected.stateRoot) throw new Error('Local trace receiver belongs to another workspace; no trace was sent');
  return { endpoint, status: 'receiver-ready' };
}
