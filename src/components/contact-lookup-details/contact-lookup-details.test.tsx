import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type {
  ContactLookupDetails as ContactLookupDetailsType,
  ContactBadges,
  HouseholdMember,
} from "@/lib/dto";

const {
  mockGetContactDetails,
  mockGetContactLogs,
  mockGetHouseholdMembers,
  mockGetContactBadges,
  mockGetContactGroups,
  mockUploadPhoto,
  mockSetBreadcrumb,
} = vi.hoisted(() => ({
  mockGetContactDetails: vi.fn(),
  mockGetContactLogs: vi.fn(),
  mockGetHouseholdMembers: vi.fn(),
  mockGetContactBadges: vi.fn(),
  mockGetContactGroups: vi.fn(),
  mockUploadPhoto: vi.fn(),
  mockSetBreadcrumb: vi.fn(),
}));

vi.mock("./actions", () => ({
  getContactDetails: mockGetContactDetails,
  getContactLogsByContactId: mockGetContactLogs,
  getHouseholdMembers: mockGetHouseholdMembers,
  getContactBadges: mockGetContactBadges,
  getContactGroups: mockGetContactGroups,
  uploadContactLookupPhoto: mockUploadPhoto,
}));

vi.mock("@/components/contact-logs/actions", () => ({
  getCurrentUserMpUserId: vi.fn().mockResolvedValue(77),
  createAutoContactLog: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/components/contact-logs", () => ({
  ContactLogs: () => <div data-testid="contact-logs" />,
}));

vi.mock("@/components/layout/dynamic-breadcrumb", () => ({
  useBreadcrumbOverride: () => mockSetBreadcrumb,
}));

vi.mock("@/contexts", () => ({
  useRuntimeConfig: () => ({ mpFileUrl: "https://mp.example.org/files" }),
}));

import { ContactLookupDetails } from "./contact-lookup-details";

/**
 * Guards the mount load and the full-reload path.
 *
 * Written against the single `fetchContactDetails()` that did both jobs, and must
 * keep passing once it splits into a pure fetcher plus an event-handler reload.
 *
 * The split's one real hazard is where the four synchronous resets end up. They ran
 * on EVERY call before — on mount they were no-ops against the initial state, but on
 * a reload they collapse the Groups section and drop its cached list. Move them into
 * the pure fetcher and the reload stops collapsing; drop them and it stops
 * refetching groups.
 */
describe("ContactLookupDetails", () => {
  const contact: ContactLookupDetailsType = {
    Contact_ID: 42,
    Contact_GUID: "1e6c1f4e-0000-4000-8000-000000000001",
    First_Name: "Jonathan",
    Nickname: "Jon",
    Last_Name: "Tester",
    Email_Address: "jon@example.org",
    Mobile_Phone: "5551234567",
    Image_GUID: "",
    Date_of_Birth: null,
    Household_ID: 7,
    Household_Position_ID: 1,
    Address_Line_1: null,
    Address_Line_2: null,
    City: null,
    "State/Region": null,
    Postal_Code: null,
    Home_Address_Unlisted: false,
  };

  const badges: ContactBadges = {
    membershipStatus: null,
    membershipStatusId: null,
    membershipDate: null,
    // The Groups section only renders for a contact who is in a group or serving.
    inGroup: true,
    serving: false,
    lastActivity: null,
    ageGradeGroups: [],
  };

  const householdMember = (
    Contact_ID: number,
    First_Name: string,
    Household_Position_ID: number | null,
    Date_of_Birth: string | null
  ): HouseholdMember => ({
    Contact_ID,
    Contact_GUID: `guid-${Contact_ID}`,
    First_Name,
    Nickname: First_Name,
    Last_Name: "Tester",
    Image_GUID: "",
    Household_Position_ID,
    Household_Position: null,
    Date_of_Birth,
  });

  const renderCard = () => render(<ContactLookupDetails guid={contact.Contact_GUID} />);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetContactDetails.mockImplementation(async () => ({ ...contact }));
    mockGetContactLogs.mockImplementation(async () => []);
    mockGetContactBadges.mockImplementation(async () => ({ ...badges }));
    mockGetHouseholdMembers.mockImplementation(async () => [
      householdMember(42, "Jonathan", 1, "1980-01-01"),
      householdMember(43, "Kid", 3, "2012-05-05"),
      householdMember(44, "Elder", 3, "2009-02-02"),
    ]);
    mockGetContactGroups.mockImplementation(async () => [
      {
        Group_Participant_ID: 1,
        Group_ID: 2,
        Group_Name: "Tuesday Community",
        Group_Type: null,
        Group_Type_ID: null,
        Role: null,
        Group_Role_ID: null,
        Start_Date: null,
        End_Date: null,
      },
    ]);
    mockUploadPhoto.mockResolvedValue({ success: true });
  });

  it("loads the contact and sets the breadcrumb to nickname + last name", async () => {
    renderCard();

    expect(await screen.findByText(/Jon Tester/)).toBeDefined();
    expect(mockSetBreadcrumb).toHaveBeenCalledWith([
      { label: "Contact Lookup", href: "/contact-lookup" },
      { label: "Jon Tester" },
    ]);
  });

  it("excludes the contact from the household and orders it oldest-first per position", async () => {
    renderCard();

    await screen.findByText(/Jon Tester/);
    // 42 is the contact themselves; 44 (2009) precedes 43 (2012) at position 3.
    const names = screen.getAllByText(/^(Elder|Kid) Tester$/).map((n) => n.textContent);
    expect(names).toEqual(["Elder Tester", "Kid Tester"]);
    // The card header shows the nickname ("Jon Tester"), so the legal first name can
    // only appear if the contact leaked into their own household list — i.e. if the
    // wrong excludeContactId was passed.
    expect(screen.queryByText("Jonathan Tester")).toBeNull();
  });

  it("clears the breadcrumb on unmount", async () => {
    const { unmount } = renderCard();
    await screen.findByText(/Jon Tester/);
    mockSetBreadcrumb.mockClear();

    unmount();

    expect(mockSetBreadcrumb).toHaveBeenCalledWith(null);
  });

  it("collapses the Groups section again after a full reload", async () => {
    renderCard();
    await screen.findByText(/Jon Tester/);

    // Expand: fetches the group list once and shows it.
    fireEvent.click(screen.getByRole("button", { name: /^Groups/ }));
    expect(await screen.findByText("Tuesday Community")).toBeDefined();
    expect(mockGetContactGroups).toHaveBeenCalledTimes(1);

    // A photo upload triggers the same full reload the refresh control uses.
    const input = document.querySelector(
      'input[type="file"][accept^="image"]'
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "photo.png", { type: "image/png" })] },
    });

    await waitFor(() => expect(mockGetContactDetails).toHaveBeenCalledTimes(2));
    // Section collapsed and its cached list dropped, so reopening re-queries MP.
    await waitFor(() => expect(screen.queryByText("Tuesday Community")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /^Groups/ }));
    await waitFor(() => expect(mockGetContactGroups).toHaveBeenCalledTimes(2));
  });

  it("surfaces a load failure as the in-page error block", async () => {
    mockGetContactDetails.mockRejectedValue(new Error("MP is down"));

    renderCard();

    expect(await screen.findByText("MP is down")).toBeDefined();
  });

  it("skips the related queries when the contact has no Contact_ID", async () => {
    mockGetContactDetails.mockImplementation(async () => ({ ...contact, Contact_ID: 0 }));

    renderCard();

    await waitFor(() => expect(mockGetContactDetails).toHaveBeenCalled());
    expect(mockGetContactLogs).not.toHaveBeenCalled();
    expect(mockGetContactBadges).not.toHaveBeenCalled();
    expect(mockGetHouseholdMembers).not.toHaveBeenCalled();
  });
});
