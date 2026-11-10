/**
 * The message the Quick Action panel shows when "Mark Complete" fails.
 *
 * Both detail modals used to send the failure to `console.error` only, so a
 * failed upload looked like nothing had happened and the form simply reset
 * (found in the #252 soak: a 15 MB PNG in a synced folder never left the
 * browser, and the panel showed nothing).
 *
 * Two cases need different advice:
 * - The request never reached the server. `fetch` rejects with a TypeError
 *   ("Failed to fetch" in Chromium, "Load failed" in Safari, "NetworkError…"
 *   in Firefox). Nothing was saved, so retrying is safe.
 * - The server answered with an error. The record is written before its
 *   attachments are uploaded, so with files attached the record may exist
 *   without them, and a blind retry would add a duplicate.
 */
export function quickActionErrorMessage(error: unknown, hadAttachments: boolean): string {
  if (error instanceof TypeError) {
    return (
      "The request didn't reach the server, so nothing was saved. Check your connection and try again. " +
      "If an attachment is in a synced folder (iCloud, OneDrive, Dropbox), copy it to your computer first."
    );
  }
  if (hadAttachments) {
    return (
      "This couldn't be saved. Check the list below before trying again: " +
      "the record may have been saved without its attachment."
    );
  }
  return "This couldn't be saved. Please try again.";
}
