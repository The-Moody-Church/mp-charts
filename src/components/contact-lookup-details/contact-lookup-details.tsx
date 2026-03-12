"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { getContactDetails, getContactLogsByContactId, getHouseholdMembers, getContactBadges, uploadContactLookupPhoto } from "./actions";
import { ContactLookupDetails as ContactLookupDetailsType, ContactLogDisplay, HouseholdMember, ContactBadges } from "@/lib/dto";
import { ContactLogs } from "@/components/contact-logs";
import { ContactLinks, DetailModalPhotoUpload } from "@/components/processing";
import { useBreadcrumbOverride } from "@/components/layout/dynamic-breadcrumb";
import { useRuntimeConfig } from "@/contexts";
import { MAX_FILE_SIZE } from "@/lib/processing-utils";
import { statusBadgeColor } from "@/lib/contact-badge-utils";

interface ContactLookupDetailsProps {
  guid: string;
}

function getDisplayName(firstName?: string, nickname?: string) {
  return nickname && nickname.trim() ? nickname : firstName;
}

function getInitials(firstName?: string, nickname?: string, lastName?: string) {
  const displayFirstName = getDisplayName(firstName, nickname);
  const first = displayFirstName?.charAt(0)?.toUpperCase() || "";
  const last = lastName?.charAt(0)?.toUpperCase() || "";
  return first + last;
}

function calculateAge(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

function formatBirthday(dateOfBirth: string): string {
  const dob = new Date(dateOfBirth);
  return dob.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function formatAddress(
  line1: string | null,
  line2: string | null,
  city: string | null,
  state: string | null,
  postalCode: string | null,
): string | null {
  if (!line1) return null;
  const parts = [line1];
  if (line2) parts.push(line2);
  const cityStateZip = [city, state].filter(Boolean).join(", ");
  if (cityStateZip && postalCode) {
    parts.push(`${cityStateZip} ${postalCode}`);
  } else if (cityStateZip) {
    parts.push(cityStateZip);
  } else if (postalCode) {
    parts.push(postalCode);
  }
  return parts.join(", ");
}

function getDirectionsUrl(address: string): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const encoded = encodeURIComponent(address);

  // iOS: open Apple Maps (native experience)
  if (/iPad|iPhone|iPod/.test(ua)) {
    return `https://maps.apple.com/?daddr=${encoded}`;
  }

  // Android: geo: scheme triggers the system app picker (Google Maps, Waze, etc.)
  if (/Android/.test(ua)) {
    return `geo:0,0?q=${encoded}`;
  }

  // Desktop / fallback: Google Maps web
  return `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
}

function formatLastActivity(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

export const ContactLookupDetails: React.FC<ContactLookupDetailsProps> = ({
  guid,
}) => {
  const { mpFileUrl } = useRuntimeConfig();
  const setBreadcrumb = useBreadcrumbOverride();
  const [contact, setContact] = useState<ContactLookupDetailsType | null>(null);
  const [contactLogs, setContactLogs] = useState<ContactLogDisplay[]>([]);
  const [badges, setBadges] = useState<ContactBadges | null>(null);
  const [familyMembers, setFamilyMembers] = useState<HouseholdMember[]>([]);
  const [familyOpen, setFamilyOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Clear breadcrumb override on unmount
  useEffect(() => {
    return () => setBreadcrumb(null);
  }, [setBreadcrumb]);

  const fetchContactDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      const contactDetails = await getContactDetails(guid);
      setContact(contactDetails);

      // Update layout breadcrumb with contact name
      const name = getDisplayName(contactDetails.First_Name, contactDetails.Nickname);
      setBreadcrumb([
        { label: "Contact Lookup", href: "/contact-lookup" },
        { label: `${name} ${contactDetails.Last_Name}` },
      ]);

      if (contactDetails.Contact_ID) {
        const [logs, badgeData, household] = await Promise.all([
          getContactLogsByContactId(contactDetails.Contact_ID),
          getContactBadges(contactDetails.Contact_ID),
          contactDetails.Household_ID
            ? getHouseholdMembers(contactDetails.Household_ID)
            : Promise.resolve([]),
        ]);
        setContactLogs(logs);
        setBadges(badgeData);
        // Filter out current contact and sort by position then DOB
        setFamilyMembers(
          household
            .filter((m) => m.Contact_ID !== contactDetails.Contact_ID)
            .sort((a, b) => {
              const posA = a.Household_Position_ID ?? 999;
              const posB = b.Household_Position_ID ?? 999;
              if (posA !== posB) return posA - posB;
              // Oldest first: earliest DOB first
              if (!a.Date_of_Birth && !b.Date_of_Birth) return 0;
              if (!a.Date_of_Birth) return 1;
              if (!b.Date_of_Birth) return -1;
              return a.Date_of_Birth.localeCompare(b.Date_of_Birth);
            })
        );
      }
    } catch (err) {
      console.error("Error loading contact details:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "An error occurred while loading contact details";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !contact) return;

    if (file.size > MAX_FILE_SIZE) {
      setPhotoError(`Photo is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum 1 MB.`);
      return;
    }

    setPhotoUploading(true);
    setPhotoError(null);
    try {
      const formData = new FormData();
      formData.set("Contact_ID", String(contact.Contact_ID));
      formData.set("photo", file);
      const result = await uploadContactLookupPhoto(formData);
      if (!result.success) {
        setPhotoError(result.error || "Upload failed");
        return;
      }
      await fetchContactDetails();
    } catch (err) {
      console.error("Photo upload failed:", err);
      setPhotoError("Failed to upload photo");
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/contact-lookup/${guid}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  const handleCopyField = (value: string, field: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  };

  useEffect(() => {
    if (guid) {
      fetchContactDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guid]);

  const getImageUrl = (imageGuid: string) => {
    return `${mpFileUrl}/${imageGuid}?$thumbnail=true`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p>Loading contact details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">
              No Contact Found
            </h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p>No contact details found for the provided identifier.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displayName = getDisplayName(contact.First_Name, contact.Nickname);

  return (
    <>
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          {/* Header: Avatar + Name + Badges */}
          <div className="flex items-center space-x-5">
            <DetailModalPhotoUpload
              imageGuid={contact.Image_GUID}
              mpFileUrl={mpFileUrl}
              firstName={contact.First_Name}
              nickname={contact.Nickname}
              lastName={contact.Last_Name}
              uploading={photoUploading}
              onUpload={handlePhotoUpload}
              photoInputRef={photoInputRef}
              className="w-20 h-20 rounded-full overflow-hidden relative flex-shrink-0 cursor-pointer group"
            />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 truncate">
                {displayName} {contact.Last_Name}
              </h1>

              {/* Links: View in MP + Copy Link */}
              <div className="flex flex-wrap items-center gap-1 mt-1 text-sm">
                {mpFileUrl && (
                  <a
                    href={`${new URL(mpFileUrl).origin}/mp/292/${contact.Contact_ID}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    View in MP
                  </a>
                )}
                {mpFileUrl && <span className="text-gray-400">—</span>}
                <button
                  onClick={handleCopyLink}
                  className="text-blue-600 hover:underline"
                >
                  {linkCopied ? "Copied!" : "Copy Link"}
                </button>
              </div>

              {/* Badges */}
              {badges && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {badges.membershipStatus && (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeColor(badges.membershipStatusId)}`}>
                      {badges.membershipStatus}
                    </span>
                  )}
                  {badges.inGroup && (
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800">
                      In a Group
                    </span>
                  )}
                  {badges.serving && (
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
                      Serving
                    </span>
                  )}
                  {badges.lastActivity && (
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-sky-100 text-sky-800"
                      title={new Date(badges.lastActivity).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    >
                      Last Activity: {formatLastActivity(badges.lastActivity)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Photo upload error */}
          {photoError && (
            <p className="mt-2 text-sm text-red-600">{photoError}</p>
          )}

          {/* Action Buttons */}
          <div className="mt-4 flex flex-wrap gap-2">
            <ContactLinks
              email={contact.Email_Address}
              phone={contact.Mobile_Phone}
              showSms
            />
            {contact.Address_Line_1 && (() => {
              const addr = formatAddress(
                contact.Address_Line_1,
                contact.Address_Line_2,
                contact.City,
                contact["State/Region"],
                contact.Postal_Code,
              );
              return addr ? (
                <a
                  href={getDirectionsUrl(addr)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                  Get Directions
                </a>
              ) : null;
            })()}
          </div>

          {/* Contact Info Grid */}
          <div className="mt-6 border-t border-gray-200 pt-6">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-gray-500">First Name</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {contact.First_Name || "N/A"}
                </dd>
              </div>

              {contact.Nickname && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Nickname</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {contact.Nickname}
                  </dd>
                </div>
              )}

              <div>
                <dt className="text-sm font-medium text-gray-500">Last Name</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {contact.Last_Name || "N/A"}
                </dd>
              </div>

              {contact.Date_of_Birth && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Birthday</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {formatBirthday(contact.Date_of_Birth)} (Age {calculateAge(contact.Date_of_Birth)})
                  </dd>
                </div>
              )}

              {contact.Mobile_Phone && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Phone</dt>
                  <dd className="mt-1 text-sm text-gray-900 flex items-center gap-1.5">
                    {contact.Mobile_Phone}
                    <button
                      onClick={() => handleCopyField(contact.Mobile_Phone, "phone")}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                      title="Copy phone number"
                    >
                      {copiedField === "phone" ? (
                        <svg className="h-3.5 w-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      ) : (
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                        </svg>
                      )}
                    </button>
                  </dd>
                </div>
              )}
              {contact.Email_Address && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Email</dt>
                  <dd className="mt-1 text-sm text-gray-900 flex items-center gap-1.5">
                    {contact.Email_Address}
                    <button
                      onClick={() => handleCopyField(contact.Email_Address, "email")}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                      title="Copy email"
                    >
                      {copiedField === "email" ? (
                        <svg className="h-3.5 w-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      ) : (
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                        </svg>
                      )}
                    </button>
                  </dd>
                </div>
              )}
            </dl>

            {/* Address */}
            {contact.Address_Line_1 && (() => {
              const fullAddress = formatAddress(
                contact.Address_Line_1,
                contact.Address_Line_2,
                contact.City,
                contact["State/Region"],
                contact.Postal_Code,
              );
              return (
                <div className="mt-4">
                  <dt className="text-sm font-medium text-gray-500">Address</dt>
                  <dd className="mt-1 text-sm text-gray-900 flex items-start gap-1.5">
                    <div>
                      <div>{contact.Address_Line_1}</div>
                      {contact.Address_Line_2 && <div>{contact.Address_Line_2}</div>}
                      <div>
                        {[contact.City, contact["State/Region"]].filter(Boolean).join(", ")}
                        {contact.Postal_Code ? ` ${contact.Postal_Code}` : ""}
                      </div>
                    </div>
                    {fullAddress && (
                      <button
                        onClick={() => handleCopyField(fullAddress, "address")}
                        className="text-gray-400 hover:text-gray-600 transition-colors mt-0.5 flex-shrink-0"
                        title="Copy address"
                      >
                        {copiedField === "address" ? (
                          <svg className="h-3.5 w-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        ) : (
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                          </svg>
                        )}
                      </button>
                    )}
                  </dd>
                  {contact.Home_Address_Unlisted && (
                    <p className="mt-1 text-xs text-gray-400">(Address marked as unlisted)</p>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Family Section */}
      {familyMembers.length > 0 && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <button
              onClick={() => setFamilyOpen(!familyOpen)}
              className="flex items-center gap-2 w-full text-left"
            >
              <svg
                className={`h-4 w-4 text-gray-500 transition-transform ${familyOpen ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              <h2 className="text-lg font-semibold text-gray-900">
                Family ({familyMembers.length})
              </h2>
            </button>

            {familyOpen && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {familyMembers.map((member) => {
                  const memberDisplayName = getDisplayName(member.First_Name, member.Nickname);
                  return (
                    <Link
                      key={member.Contact_ID}
                      href={`/contact-lookup/${member.Contact_GUID}`}
                      className="flex flex-col items-center gap-2 rounded-lg border p-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="h-12 w-12 rounded-full overflow-hidden relative flex-shrink-0">
                        {member.Image_GUID && mpFileUrl ? (
                          <Image
                            src={getImageUrl(member.Image_GUID)}
                            alt={`${memberDisplayName} ${member.Last_Name}`}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-300 rounded-full flex items-center justify-center text-gray-600 text-sm font-medium">
                            {getInitials(member.First_Name, member.Nickname, member.Last_Name)}
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-medium text-gray-900 text-center truncate w-full">
                        {memberDisplayName} {member.Last_Name}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <ContactLogs
        contactLogs={contactLogs}
        contactId={contact.Contact_ID}
        contactNickname={contact.Nickname}
        contactLastName={contact.Last_Name}
        onRefresh={fetchContactDetails}
      />
    </>
  );
};
