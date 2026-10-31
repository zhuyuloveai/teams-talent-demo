import { DomainError } from '../src/domain.js';

/** Limits apply to original UTF-8 bytes, before JSON wrapper escaping. Never truncate history. */
export const MAX_NATIVE_SESSION_BYTES = 32 * 1024 * 1024;
export const MAX_NATIVE_TRAJECTORY_BYTES = 64 * 1024 * 1024;
export const MAX_TASK_SESSION_DOCUMENT_BYTES = 128 * 1024 * 1024;

export function sessionDocumentBytes(content: unknown): number {
  if (typeof content !== 'string' || !content.length) throw new DomainError('The session document is empty or invalid', 400);
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > MAX_NATIVE_SESSION_BYTES) throw new DomainError('A session document is larger than 32 MiB; it was not truncated or reported', 413);
  return bytes;
}

export function assertSessionDocumentTotal(bytes: number): void {
  if (bytes > MAX_TASK_SESSION_DOCUMENT_BYTES) throw new DomainError('The session bodies collected at once exceed 128 MiB in total; nothing was truncated or reported', 413);
}

/** Preflight the entire batch before parsing/hashing/persisting any document. */
export function validateSessionDocumentCapacity(documents: readonly unknown[]): void {
  let bytes = 0;
  for (const document of documents) {
    bytes += sessionDocumentBytes(document && typeof document === 'object' ? (document as { content?: unknown }).content : undefined);
    assertSessionDocumentTotal(bytes);
  }
}
