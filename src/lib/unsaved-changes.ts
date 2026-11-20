import { useEffect } from "react";

/**
 * "Does this page hold edits the user has not saved?", asked by SessionGuard
 * at the moment the session ends. Generic on purpose, so the four Better Auth
 * apps can share the file: nothing here knows about any one form.
 *
 * Two sources, either of which holds the page:
 *
 * 1. Text the user typed. `trackTypedInput()` installs ONE capture-phase
 *    `input` listener on the document and remembers each field the user typed
 *    into: a textarea, a text-like input, or a contenteditable host. At
 *    decision time a field counts while it is still in the document and still
 *    holds non-blank text, so a note that was saved and cleared, or a dialog
 *    that closed, no longer holds the page. Fields inside
 *    `[data-session-guard-ignore]` are never recorded: a typed SEARCH must not
 *    keep member PII on screen after the session ends.
 * 2. `useUnsavedChanges(dirty)`, for a form whose unsaved state is not in a
 *    text field (a picker, a checkbox list, a reordered list).
 *
 * The typed fields are kept in a Set, not a WeakSet: a WeakSet cannot be
 * enumerated, and the check has to walk them. Disconnected or blank fields are
 * pruned on every record and every check, so the Set holds only fields that
 * are on the page or were typed into since the last check.
 *
 * Client-only. Every function is safe to call before the listener exists.
 */

/** Mark a container (or a field) whose typing must never hold the page. */
export const SESSION_GUARD_IGNORE_ATTRIBUTE = "data-session-guard-ignore";

/**
 * Input types whose value is text a person wrote. `search`, `password`,
 * `hidden`, `checkbox`, `radio`, `file`, `range`, `color` and the button
 * types are deliberately absent. Date and time fields are included: changing
 * one is an edit. A missing or unknown `type` attribute reads as "text" through
 * the `type` property, as browsers do.
 */
const TEXT_LIKE_INPUT_TYPES = new Set([
  "text",
  "email",
  "tel",
  "url",
  "number",
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
]);

type TrackedField = HTMLTextAreaElement | HTMLInputElement | HTMLElement;

const typedFields = new Set<TrackedField>();
const dirtyOwners = new Set<symbol>();
let listenerUsers = 0;

/**
 * The element to record for an `input` event's target, or null when it is not
 * an edit we track. For contenteditable the editing HOST is recorded (the
 * outermost element whose contenteditable is not "false"), since its text is
 * the edit. `isContentEditable` is not used: jsdom does not implement it.
 */
function fieldFor(target: EventTarget | null): TrackedField | null {
  if (!(target instanceof HTMLElement)) return null;
  if (target.closest(`[${SESSION_GUARD_IGNORE_ATTRIBUTE}]`)) return null;
  if (target instanceof HTMLTextAreaElement) return target;
  if (target instanceof HTMLInputElement) {
    return TEXT_LIKE_INPUT_TYPES.has(target.type) ? target : null;
  }
  const editable = target.closest('[contenteditable]:not([contenteditable="false"])');
  if (!(editable instanceof HTMLElement)) return null;
  let host: HTMLElement = editable;
  for (
    let parent = host.parentElement?.closest('[contenteditable]:not([contenteditable="false"])');
    parent instanceof HTMLElement;
    parent = parent.parentElement?.closest('[contenteditable]:not([contenteditable="false"])')
  ) {
    host = parent;
  }
  return host;
}

function textOf(field: TrackedField): string {
  if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) return field.value;
  return field.textContent ?? "";
}

function holdsText(field: TrackedField): boolean {
  return field.isConnected && textOf(field).trim() !== "";
}

function onInput(event: Event): void {
  const field = fieldFor(event.target);
  if (field) typedFields.add(field);
  for (const f of typedFields) if (!f.isConnected) typedFields.delete(f);
}

/**
 * Starts recording typed fields. Reference-counted, so nested or repeated
 * guards share one listener. Returns the matching stop function.
 */
export function trackTypedInput(): () => void {
  if (listenerUsers === 0) document.addEventListener("input", onInput, true);
  listenerUsers += 1;
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    listenerUsers -= 1;
    if (listenerUsers === 0) {
      document.removeEventListener("input", onInput, true);
      typedFields.clear();
    }
  };
}

/** True when a recorded field is still on the page with non-blank text. */
export function hasUnsavedTypedText(): boolean {
  let found = false;
  for (const field of typedFields) {
    if (holdsText(field)) found = true;
    else typedFields.delete(field);
  }
  return found;
}

/** True when any source says the page holds unsaved edits. */
export function hasUnsavedChanges(): boolean {
  return dirtyOwners.size > 0 || hasUnsavedTypedText();
}

/**
 * Declares that the calling component holds unsaved edits while `dirty` is
 * true, for state the typed-field tracking cannot see. The claim ends when
 * `dirty` turns false or the component unmounts.
 */
export function useUnsavedChanges(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const owner = Symbol("unsaved-changes");
    dirtyOwners.add(owner);
    return () => {
      dirtyOwners.delete(owner);
    };
  }, [dirty]);
}
