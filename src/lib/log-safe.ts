/**
 * One-line, control-character-free description of a caught error, for console
 * logging. Error messages can carry caller-shaped text, and logging the raw Error
 * lets a newline forge log lines (CodeQL js/log-injection). The first
 * `.replace(/\n|\r/g, "")` is the exact form CodeQL recognises as a sanitizer:
 * keep it verbatim. The second also strips the other C0 controls, DEL and the
 * Unicode line/paragraph separators.
 *
 * No stack trace: the MP client layer (table.service.ts, file.service.ts) already
 * logs MP failures with their stack, and errors the app throws itself carry
 * fixed messages.
 */
export function errorForLog(error: unknown): string {
  let text: string;
  try {
    text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  } catch {
    text = "unprintable error";
  }
  return text.replace(/\n|\r/g, "").replace(/[\x00-\x1f\x7f\u2028\u2029]/g, "");
}
