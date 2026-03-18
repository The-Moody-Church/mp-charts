"use client";

import { createAutoContactLog } from "@/components/contact-logs/actions";

interface ContactLinksProps {
  email: string | null;
  phone: string | null;
  contactId?: number;
  showSms?: boolean;
  onLogCreated?: () => void;
}

export function ContactLinks({ email, phone, contactId, showSms = false, onLogCreated }: ContactLinksProps) {
  if (!email && !phone) return null;

  const logAction = async (logTypeId: number, notes: string) => {
    if (!contactId) return;
    const success = await createAutoContactLog(contactId, logTypeId, notes);
    if (success && onLogCreated) onLogCreated();
  };

  return (
    <div className="flex flex-wrap gap-2">
      {email && (
        <a
          href={`mailto:${email}`}
          onClick={() => logAction(5, "User clicked send an email in MP Tools")}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors max-w-full"
        >
          <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
          <span className="truncate">{email}</span>
        </a>
      )}
      {phone && (
        <a
          href={`tel:${phone}`}
          onClick={() => logAction(1, "User clicked call phone number in MP Tools")}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
          </svg>
          {phone}
        </a>
      )}
      {showSms && phone && (
        <a
          href={`sms:${phone}`}
          onClick={() => logAction(3, "User clicked send a text in MP Tools")}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
          Text
        </a>
      )}
    </div>
  );
}
