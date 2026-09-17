/**
 * Error logging that carries identifiers and shape, never content.
 *
 * MP data is member PII and pastoral notes, and hosting/log-aggregation
 * platforms retain `console.*` output with broader access and longer retention
 * than the MP database itself. So a caught error is reduced to its name,
 * message and status — never the raw object, which may carry a response body,
 * a request payload, or a `$filter` string.
 *
 * `message` is capped: a future throw that embeds a large payload should not
 * be able to flood a log line. The MP HTTP client already keeps bodies out of
 * thrown messages (F5); this is the net under that.
 *
 * Ported from music-db, which had the best implementation of the four repos.
 */
interface SanitizedError {
  name?: string;
  message: string;
  status?: number;
}

const MAX_MESSAGE_LENGTH = 500;

function sanitize(error: unknown): SanitizedError {
  if (error instanceof Error) {
    const out: SanitizedError = {
      name: error.name,
      message: error.message.slice(0, MAX_MESSAGE_LENGTH),
    };
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") out.status = status;
    return out;
  }
  return { message: String(error).slice(0, MAX_MESSAGE_LENGTH) };
}

export function logError(context: string, error: unknown): void {
  console.error(context, sanitize(error));
}
