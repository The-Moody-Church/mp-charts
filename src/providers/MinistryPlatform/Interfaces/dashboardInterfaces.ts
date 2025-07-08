export interface VolunteerBirthday {
  Contact_GUID: string;
  Nickname: string;
  Last_Name: string;
  Mobile_Phone?: string;
  Email_Address?: string;
  Date_of_Birth: string;
  Image_GUID?: string;
}

export interface HouseholdContact {
  Nickname: string;
  Contact_GUID: string;
  Last_Name: string;
  Email_Address?: string;
  Mobile_Phone?: string;
  Date_of_Birth?: string;
}

export interface HouseholdAddress {
  Address_ID: number;
  Address_Line_1: string;
  City: string;
  "State/Region": string;
  Postal_Code: string;
  Foreign_Country?: string;
  Country_Code: string;
  Domain_ID: number;
  Do_Not_Validate: boolean;
  Country?: string;
}

export interface NewHousehold {
  Household_Name: string;
  Household_ID: number;
  __Household_Setup_Date: string;
  Congregation_ID: number;
  Address_ID?: number;
  Address?: string; // JSON stringified HouseholdAddress
  Contacts: HouseholdContact[];
}

export interface DashboardData {
  VolunteerBirthdays: VolunteerBirthday[];
  NewHouseholds: NewHousehold[];
}
