// Define interfaces for query parameters
export interface TableQueryParams {
  $select?: string;
  $filter?: string;
  $orderby?: string;
  $groupby?: string;
  $having?: string;
  $top?: number;
  $skip?: number;
  $distinct?: boolean;
  $userId?: number;
  $globalFilterId?: number;
  $allowCreate?: boolean;
}

// Add this interface to define the structure for table records
export interface TableRecord {
  [key: string]: unknown; // This allows for flexible record structures while maintaining some type safety
}

/**
 * Interface for File Description
 * Represents the description of a file attached to a record.
 */
export interface FileDescription {
    /**
     * Gets the database identifier of the file (populated for existing file).
     */
    FileId: number;
    
    /**
     * Gets or sets the logical (originally uploaded) file name.
     */
    FileName: string;
    
    /**
     * Gets the logical file extension.
     */
    readonly FileExtension?: string;
    
    /**
     * Gets or sets the file summary or description.
     */
    Description?: string;
    
    /**
     * Gets or sets the file physical size on disk.
     */
    FileSize: number;
    
    /**
     * Gets or sets the image height in pixels for an image file.
     */
    ImageHeight?: number;
    
    /**
     * Gets or sets the image width in pixels for an image file.
     */
    ImageWidth?: number;
    
    /**
     * Gets flag indicating that file storing an image.
     */
    readonly IsImage: boolean;
    
    /**
     * Gets or sets the flag indicating that file contains the default image assigned to a record.
     */
    IsDefaultImage: boolean;
    
    /**
     * Gets or sets the table name this file is assigned to.
     */
    TableName: string;
    
    /**
     * Gets or sets the identifier of the record this file is assigned to.
     */
    RecordId: number;
    
    /**
     * Gets the unique file identifier that is used for image retrieval
     * (populated for existing file).
     */
    UniqueFileId: string;
    
    /**
     * Gets the date and time when file has been created or updated
     * (populated for existing file).
     */
    LastUpdated: string; // ISO date string
    
    /**
     * Gets or sets the method of including this file into a communication message.
     */
    InclusionType: 'Attachment' | 'Link';
}

/**
 * Interface for Communication Information
 */
export interface CommunicationInfo {
    AuthorUserId: number;
    Body: string;
    FromContactId: number;
    ReplyToContactId: number;
    CommunicationType: 'Email' | 'Text' | 'Letter';
    Contacts: number[];
    IsBulkEmail: boolean;
    SendToContactParents: boolean;
    Subject: string;
    StartDate: string; // ISO date string
    TextPhoneNumberId?: number;
}

/**
 * Interface for Message Address
 */
export interface MessageAddress {
    DisplayName: string;
    Address: string;
}

/**
 * Interface for Message Information
 */
export interface MessageInfo {
    FromAddress: MessageAddress;
    ToAddresses: MessageAddress[];
    ReplyToAddress?: MessageAddress;
    Subject: string;
    Body: string;
    StartDate?: string; // ISO date string, optional
}

/**
 * Interface for Communication response
 */
export interface Communication {
    Communication_ID: number;
    Author_User_ID: number;
    Subject: string;
    Body: string;
    Domain_ID: number;
    Start_Date: string;
    Communication_Status_ID: number;
    From_Contact: number;
    Reply_to_Contact: number;
    Template_ID?: number;
    Active: boolean;
    // Add other fields as needed based on your Ministry Platform schema
}

/**
 * Interface for Domain Information
 * Provides the basic information about domain.
 */
export interface DomainInfo {
    /**
     * Gets or sets the domain or organization display name.
     */
    DisplayName: string;
    
    /**
     * Gets or sets the file identifier containing the default image associated with the domain.
     */
    ImageFileId?: number;
    
    /**
     * Gets the default time zone identifier for all users in this domain.
     */
    TimeZoneName: string;
    
    /**
     * Gets the default culture for all users in this domain.
     */
    CultureName: string;
    
    /**
     * Gets or sets the password complexity validation Regex expression.
     */
    PasswordComplexityExpression?: string;
    
    /**
     * Gets or sets the password complexity validation error message.
     */
    PasswordComplexityMessage?: string;
    
    /**
     * Gets or sets the flag indicating that users may also use email and mobile
     * phone number in place of the user name for authentication.
     */
    IsSimpleSignOnEnabled: boolean;
    
    /**
     * Gets or sets the flag indicating that users may choose their preferred time zone
     * on the user profile screen and that time zone will be globally used for presenting
     * date and time data.
     */
    IsUserTimeZoneEnabled: boolean;
    
    /**
     * Gets or sets the flag indicating that users may use SMS for multi-factor authentication.
     */
    IsSmsMfaEnabled: boolean;
    
    /**
     * Gets or sets the name of the owner company.
     */
    CompanyName?: string;
    
    /**
     * Gets or sets the email of the owner company.
     */
    CompanyEmail?: string;
    
    /**
     * Gets or sets the phone number of the owner company.
     */
    CompanyPhone?: string;
    
    /**
     * Gets or sets the table associated with the Global_Filter_Page_ID
     */
    GlobalFilterTableName?: string;
    
    /**
     * Gets or sets the site number assigned to Accounting Integration for this domain.
     */
    SiteNumber?: string;
}

/**
 * Interface for Global Filter Items
 */
export interface GlobalFilterItem {
    /**
     * The identifier for the global filter
     */
    Key: number;
    
    /**
     * The friendly name (description) for the global filter
     */
    Value: string;
}

/**
 * Interface for Global Filter query parameters
 */
export interface GlobalFilterParams {
    $ignorePermissions?: boolean;
    $userId?: number;
}

/**
 * Parameter direction enum for stored procedure parameters
 */
export type ParameterDirection = 
    | "Input"
    | "Output"
    | "InputOutput"
    | "ReturnValue";

/**
 * Data type enum for stored procedure parameters
 */
export type ParameterDataType = 
    | "Unknown"
    | "String"
    | "Text"
    | "Xml"
    | "Byte"
    | "Integer16"
    | "Integer32"
    | "Integer64"
    | "Decimal"
    | "Real"
    | "Boolean"
    | "Date"
    | "Time"
    | "DateTime"
    | "Timestamp"
    | "Binary"
    | "Password"
    | "Money"
    | "Guid"
    | "Phone"
    | "Email"
    | "Variant"
    | "Separator"
    | "Image"
    | "Counter"
    | "TableName"
    | "GlobalFilter"
    | "TimeZone"
    | "Locale"
    | "LargeString"
    | "Url"
    | "Strings"
    | "Integers"
    | "Color"
    | "SecretKey";

/**
 * Interface for stored procedure parameter information
 * Provides information about a stored procedure parameter.
 */
export interface ParameterInfo {
    /**
     * Gets or sets the parameter name.
     */
    Name: string;
    
    /**
     * Gets or sets the parameter direction (in, out, etc).
     */
    Direction: ParameterDirection;
    
    /**
     * Gets or set the parameter data type.
     */
    DataType: ParameterDataType;
    
    /**
     * Gets or sets the parameter maximum length.
     */
    Size: number;
}

/**
 * Interface for stored procedure information
 * Provides basic metadata about a stored procedure.
 */
export interface ProcedureInfo {
    /**
     * Gets or sets the routine name.
     */
    Name: string;
    
    /**
     * Gets collection of routine parameters.
     */
    Parameters: ParameterInfo[];
}

/**
 * Interface for Table Information
 * Provides basic metadata about a table.
 */
export interface TableInfo {
    /**
     * Gets or sets the table name.
     */
    Name: string;
    
    /**
     * Gets or sets the table display name.
     */
    DisplayName: string;
    
    /**
     * Gets or sets the table description.
     */
    Description?: string;
    
    /**
     * Gets or sets whether the table is active.
     */
    Active: boolean;
    
    /**
     * Gets or sets the table identifier.
     */
    Table_ID: number;
}

export interface FileUploadParams {
    description?: string;
    isDefaultImage?: boolean;
    longestDimension?: number;
    userId?: number;
}

export interface FileUpdateParams {
    fileName?: string;
    description?: string;
    isDefaultImage?: boolean;
    longestDimension?: number;
    userId?: number;
}

export interface QueryParams {
    [key: string]: string | number | boolean | string[] | number[] | boolean[] | undefined | null;
}

export interface RequestBody {
    [key: string]: unknown;
}
export interface TableMetadata {
    Table_ID: number;
    Table_Name: string;
    Display_Name: string;
    Description?: string;
    [key: string]: unknown;
}