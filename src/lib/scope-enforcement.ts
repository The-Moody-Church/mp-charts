/**
 * Per-record scope enforcement (F2).
 *
 * `requireFeatureAccess` proves a user may USE a journey/compliance tool, but not
 * that a specific participant/record belongs to that tool. Without a per-record
 * check, a user of one tool can read or write another tool's participants by
 * passing a different (valid) ID. The journey/compliance services resolve the set
 * of participants each tool legitimately manages and gate access through the
 * helper below.
 *
 * Rollout safety — `F2_SCOPE_ENFORCEMENT` env var:
 *   - unset / "enforce" (default): out-of-scope access throws "Forbidden".
 *   - "report": the would-be denial is logged but ALLOWED. Use this to validate
 *     the scope logic against real data first (watch for false denials in logs),
 *     then switch to enforce.
 */
export type ScopeMode = "enforce" | "report";

export function getScopeMode(): ScopeMode {
  return process.env.F2_SCOPE_ENFORCEMENT === "report" ? "report" : "enforce";
}

/**
 * Gate an access decision. In enforce mode, throws when `inScope` is false; in
 * report mode, logs the would-be denial and allows it. `context` must contain only
 * non-PII identifiers (e.g. numeric IDs) since it may be logged.
 */
export function enforceScope(inScope: boolean, context: string): void {
  if (inScope) return;
  if (getScopeMode() === "report") {
    console.warn(`[scope:report] would deny out-of-scope access — ${context}`);
    return;
  }
  throw new Error("Forbidden: record is not in scope for this tool");
}
