import { z } from 'zod';

export interface ContactLogRecord {
  Contact_Log_ID: number;
  Contact_ID: number;
  Contact_Date: string;
  Made_By: number;
  Notes: string;
  Contact_Log_Type_ID?: number | null;
  Planned_Contact_ID?: number | null;
  Contact_Successful?: boolean | null;
  Original_Contact_Log_Entry?: number | null;
  Feedback_Entry_ID?: number | null;
}

export const ContactLogSchema = z.object({
  Contact_Log_ID: z.number().int(),
  Contact_ID: z.number().int(),
  Contact_Date: z.string().datetime(),
  Made_By: z.number().int(),
  Notes: z.string().max(2000),
  Contact_Log_Type_ID: z.number().int().nullable(),
  Planned_Contact_ID: z.number().int().nullable(),
  Contact_Successful: z.boolean().nullable(),
  Original_Contact_Log_Entry: z.number().int().nullable(),
  Feedback_Entry_ID: z.number().int().nullable(),
});

export type ContactLog = ContactLogRecord;
export type ContactLogInput = z.infer<typeof ContactLogSchema>;
