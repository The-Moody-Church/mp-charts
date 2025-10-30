import { z } from 'zod';

export interface CongregationsRecord {
  Congregation_ID: number;
  Congregation_Name: string;
  Start_Date: string;
  Description?: string | null;
  Location_ID?: number | null;
  Time_Zone: unknown;
  Contact_ID: number;
  Pastor: number;
  End_Date?: string | null;
  Home_Page?: string | null;
  Available_Online: boolean;
  Web_Template_Name?: string | null;
  Accounting_Company_ID: number;
  Default_Giving_Program?: number | null;
  Online_Sort_Order?: number | null;
  Front_Desk_SMS_Phone?: string | null;
  Childcare_Size: number;
  Monday_Childcare_Size: number;
  Tuesday_Childcare_Size: number;
  Wednesday_Childcare_Size: number;
  Thursday_Childcare_Size: number;
  Friday_Childcare_Size: number;
  Plan_A_Visit_Template?: number | null;
  Plan_A_Visit_Contact?: number | null;
  Plan_A_Visit_User?: number | null;
  Discipleship_Admin?: number | null;
  Coming_Soon: boolean;
  Giving_URL?: string | null;
  Logo_URL?: string | null;
  Giving_Image_URL?: string | null;
  JWT_Signing_Key?: Blob | string | null;
  Certifications_Provider?: string | null;
  Certifications_API_Key?: Blob | string | null;
  Certifications_API_Address?: string | null;
  Certification_Callback_Username?: string | null;
  Certification_Callback_Password?: Blob | string | null;
  Background_Check_Provider?: string | null;
  Background_Check_Username?: string | null;
  Background_Check_Password?: Blob | string | null;
  Background_Check_Callback_Username?: string | null;
  Background_Check_Callback_Password?: Blob | string | null;
  Event_Registration_Handoff_URL?: string | null;
  Vanco_Tenant?: string | null;
  Vanco_Giving_PCCT?: string | null;
  Vanco_Signing_Key?: string | null;
  Organization_Code?: string | null;
  Sacrament_Place_ID?: number | null;
  Dark_Mode_Logo_URL?: string | null;
  Site_Number?: string | null;
  App_ID?: number | null;
}

export const CongregationsSchema = z.object({
  Congregation_ID: z.number().int(),
  Congregation_Name: z.string().max(50),
  Start_Date: z.string().datetime(),
  Description: z.string().max(255).nullable(),
  Location_ID: z.number().int().nullable(),
  Time_Zone: z.unknown(),
  Contact_ID: z.number().int(),
  Pastor: z.number().int(),
  End_Date: z.string().datetime().nullable(),
  Home_Page: z.string().max(254).nullable(),
  Available_Online: z.boolean(),
  Web_Template_Name: z.string().max(50).nullable(),
  Accounting_Company_ID: z.number().int(),
  Default_Giving_Program: z.number().int().nullable(),
  Online_Sort_Order: z.number().int().nullable(),
  Front_Desk_SMS_Phone: z.string().nullable(),
  Childcare_Size: z.number().int(),
  Monday_Childcare_Size: z.number().int(),
  Tuesday_Childcare_Size: z.number().int(),
  Wednesday_Childcare_Size: z.number().int(),
  Thursday_Childcare_Size: z.number().int(),
  Friday_Childcare_Size: z.number().int(),
  Plan_A_Visit_Template: z.number().int().nullable(),
  Plan_A_Visit_Contact: z.number().int().nullable(),
  Plan_A_Visit_User: z.number().int().nullable(),
  Discipleship_Admin: z.number().int().nullable(),
  Coming_Soon: z.boolean(),
  Giving_URL: z.string().max(500).nullable(),
  Logo_URL: z.string().max(500).nullable(),
  Giving_Image_URL: z.string().max(500).nullable(),
  JWT_Signing_Key: z.unknown().nullable(),
  Certifications_Provider: z.string().max(25).nullable(),
  Certifications_API_Key: z.unknown().nullable(),
  Certifications_API_Address: z.string().max(100).nullable(),
  Certification_Callback_Username: z.string().max(50).nullable(),
  Certification_Callback_Password: z.unknown().nullable(),
  Background_Check_Provider: z.string().max(25).nullable(),
  Background_Check_Username: z.string().max(50).nullable(),
  Background_Check_Password: z.unknown().nullable(),
  Background_Check_Callback_Username: z.string().max(50).nullable(),
  Background_Check_Callback_Password: z.unknown().nullable(),
  Event_Registration_Handoff_URL: z.string().url().nullable(),
  Vanco_Tenant: z.string().max(50).nullable(),
  Vanco_Giving_PCCT: z.string().max(50).nullable(),
  Vanco_Signing_Key: z.string().max(50).nullable(),
  Organization_Code: z.string().max(16).nullable(),
  Sacrament_Place_ID: z.number().int().nullable(),
  Dark_Mode_Logo_URL: z.string().max(500).nullable(),
  Site_Number: z.string().max(8).nullable(),
  App_ID: z.number().int().nullable(),
});

export type Congregations = CongregationsRecord;
export type CongregationsInput = z.infer<typeof CongregationsSchema>;
