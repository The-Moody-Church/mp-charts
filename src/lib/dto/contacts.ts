export interface ContactSearch {
  Contact_ID: number;
  Contact_GUID: string;
  First_Name: string;
  Nickname: string;
  Last_Name: string;
  Email_Address: string;
  Mobile_Phone: string;
  Image_GUID: string;
  /** Contact_Status_ID — 1 = Active */
  Contact_Status_ID: number | null;
  /** Participant fields — null for contacts without a participant record */
  Participant_ID: number | null;
  Member_Status_ID: number | null;
  Member_Status: string | null;
  Date_Joined: string | null;
  /** Participant engagement level — used for tie-breaking in search results */
  Participant_Engagement_ID: number | null;
}

export interface ContactLookupDetails {
  Contact_ID: number;
  Contact_GUID: string;
  First_Name: string;
  Nickname: string;
  Last_Name: string;
  Email_Address: string;
  Mobile_Phone: string;
  Image_GUID: string;
  Date_of_Birth: string | null;
  Household_ID: number | null;
  Household_Position_ID: number | null;
  Address_Line_1: string | null;
  Address_Line_2: string | null;
  City: string | null;
  "State/Region": string | null;
  Postal_Code: string | null;
  Home_Address_Unlisted: boolean;
}

export interface HouseholdMember {
  Contact_ID: number;
  Contact_GUID: string;
  First_Name: string;
  Nickname: string;
  Last_Name: string;
  Image_GUID: string;
  Household_Position_ID: number | null;
  Household_Position: string | null;
  Date_of_Birth: string | null;
}

export interface ContactBadges {
  membershipStatus: string | null;
  membershipStatusId: number | null;
  membershipDate: string | null;
  inGroup: boolean;
  serving: boolean;
  lastActivity: string | null;
  ageGradeGroups: string[];
}
