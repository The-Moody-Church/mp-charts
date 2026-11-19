const SAFE_CAUSE_TOKEN = /^[A-Za-z0-9_]{1,64}$/;

/**
 * Class and code of a caught error's `cause`, as a ` (cause: ...)` suffix, or ""
 * when there is nothing safe to add.
 *
 * Node's fetch (undici) rejects with a bare `TypeError: fetch failed` and puts
 * the useful detail on `error.cause`: `ECONNREFUSED`, `UND_ERR_CONNECT_TIMEOUT`
 * (the 2026-03-15 0-attendance incident), or a refused redirect. Only the
 * cause's `name` and `code` are used, each only when it matches
 * `^[A-Za-z0-9_]{1,64}$`. The cause's message is free text (it can carry a host,
 * a URL or caller-shaped input) and is never copied: undici's fixed
 * "unexpected redirect" message, which `redirect: 'error'` produces, is mapped
 * to the fixed label "redirect refused". One level only; never throws.
 */
export function causeForLog(error: unknown): string {
  try {
    if (!(error instanceof Error)) return "";
    const cause: unknown = (error as { cause?: unknown }).cause;
    if (typeof cause !== "object" || cause === null) return "";
    const { name, code, message } = cause as { name?: unknown; code?: unknown; message?: unknown };
    const parts: string[] = [];
    if (typeof name === "string" && SAFE_CAUSE_TOKEN.test(name)) parts.push(name);
    if (typeof code === "string" && SAFE_CAUSE_TOKEN.test(code)) parts.push(code);
    if (message === "unexpected redirect") parts.push("redirect refused");
    return parts.length > 0 ? ` (cause: ${parts.join(" ")})` : "";
  } catch {
    return "";
  }
}

/**
 * One-line, control-character-free description of a caught error, for console
 * logging. Error messages can carry caller-shaped text, and logging the raw Error
 * lets a newline forge log lines (CodeQL js/log-injection). The first
 * `.replace(/\n|\r/g, "")` is the exact form CodeQL recognises as a sanitizer:
 * keep it verbatim. The second also strips the other C0 controls, DEL and the
 * Unicode line/paragraph separators.
 *
 * No stack trace, and no cause message. The cause's class and code are appended
 * (`causeForLog` above), so a network failure still says what went wrong:
 * `TypeError: fetch failed (cause: Error ECONNREFUSED)`. Every MP client log line
 * (the provider services and `client.ts`) goes through this function since
 * batch 3, so this suffix is the only place the network cause reaches the logs.
 */
export function errorForLog(error: unknown): string {
  let text: string;
  try {
    text =
      error instanceof Error ? `${error.name}: ${error.message}${causeForLog(error)}` : String(error);
  } catch {
    text = "unprintable error";
  }
  return text.replace(/\n|\r/g, "").replace(/[\x00-\x1f\x7f\u2028\u2029]/g, "");
}
