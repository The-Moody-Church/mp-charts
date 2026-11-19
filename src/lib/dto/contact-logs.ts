/**
 * The author's name, as the contact-log list shows it. Nothing else about the
 * staff author (email, phone, Contact_ID, photo) reaches the browser
 * (upstream MPNext 710dfa8, adapted).
 */
export interface ContactLogMadeBy {
  First_Name: string;
  Nickname: string | null;
  Last_Name: string;
}

/**
 * One contact log as `getContactLogsByContactId` (contact-lookup-details)
 * returns it: exactly the fields `contact-logs.tsx` renders or needs. `Made_By`
 * is kept for the owner-only Edit button. The MP row's link and flag columns
 * (`Planned_Contact_ID`, `Contact_Successful`, `Original_Contact_Log_Entry`,
 * `Feedback_Entry_ID`) and `Contact_ID` are deliberately absent.
 */
export interface ContactLogDisplay {
  Contact_Log_ID: number;
  Contact_Date: string;
  Notes: string;
  Contact_Log_Type: string | null;
  Contact_Log_Type_ID: number | null;
  Made_By: number;
  MadeByContact?: ContactLogMadeBy[];
}
