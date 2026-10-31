import { createServer } from 'node:net';
/** Probe only: stopping a service requires its health identity and recorded PID. */
export async function assertPortsAvailable(ports) {
  for (const port of [...new Set(ports)]) {
    const server = createServer();
    await new Promise((resolve, reject) => {
      server.once('error', error => reject(new Error(`Port ${port} is not available; no process was stopped: ${error.message}`)));
      server.listen(port, '127.0.0.1', () => server.close(error => error ? reject(error) : resolve()));
    });
  }
}
