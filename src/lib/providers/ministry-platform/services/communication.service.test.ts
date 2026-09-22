import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommunicationService } from './communication.service';
import type { CommunicationInfo, MessageInfo } from '../types';

/**
 * Covers the #220 fix: `CommunicationType` now mirrors MP's real enum, and an
 * `'SMS'` send must carry `TextPhoneNumberId`.
 *
 * The rejection tests are mutation traps — each asserts that **no MP call was
 * made**, not merely that an error came back. Asserting on the message alone
 * would still pass if the guard were moved below the POST, which is the whole
 * failure mode the guard exists to prevent.
 */

const mockPost = vi.fn();
const mockPostFormData = vi.fn();
const mockEnsureValidToken = vi.fn();

function createService() {
  const client = {
    ensureValidToken: mockEnsureValidToken,
    getHttpClient: () => ({ post: mockPost, postFormData: mockPostFormData }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return new CommunicationService(client);
}

const EMAIL: CommunicationInfo = {
  AuthorUserId: 1,
  Subject: 'Test Subject',
  Body: '<p>Test body</p>',
  StartDate: '2026-09-08 09:00:00',
  FromContactId: 123,
  ReplyToContactId: 123,
  CommunicationType: 'Email',
  Contacts: [456, 789],
  IsBulkEmail: false,
  SendToContactParents: false,
};

/** `dp_SMS_Numbers.SMS_Number_ID` — this tenant's single active number. */
const SMS_NUMBER_ID = 1;

const SMS: CommunicationInfo = {
  ...EMAIL,
  CommunicationType: 'SMS',
  Subject: 'Reminder',
  Body: 'Your visit is tomorrow.',
  TextPhoneNumberId: SMS_NUMBER_ID,
};

function expectNoMpCall() {
  expect(mockPost).not.toHaveBeenCalled();
  expect(mockPostFormData).not.toHaveBeenCalled();
  // The guard sits above `ensureValidToken`, so a doomed payload costs neither
  // a token refresh nor a round trip.
  expect(mockEnsureValidToken).not.toHaveBeenCalled();
}

describe('CommunicationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureValidToken.mockResolvedValue(undefined);
  });

  describe('createCommunication — happy paths', () => {
    it('posts an email communication', async () => {
      const created = { Communication_ID: 54143 };
      mockPost.mockResolvedValueOnce(created);

      const result = await createService().createCommunication(EMAIL);

      expect(mockEnsureValidToken).toHaveBeenCalled();
      expect(mockPost).toHaveBeenCalledWith('/communications', { ...EMAIL });
      expect(result).toEqual(created);
    });

    it("posts an SMS communication — the value MP actually accepts, not 'Text'", async () => {
      mockPost.mockResolvedValueOnce({ Communication_ID: 54144 });

      await createService().createCommunication(SMS);

      expect(mockPost).toHaveBeenCalledWith(
        '/communications',
        expect.objectContaining({
          CommunicationType: 'SMS',
          TextPhoneNumberId: SMS_NUMBER_ID,
        }),
      );
    });

    it('sends attachments as multipart form data', async () => {
      mockPostFormData.mockResolvedValueOnce({ Communication_ID: 3 });
      const file = new File(['data'], 'flyer.pdf', { type: 'application/pdf' });

      await createService().createCommunication(EMAIL, [file]);

      expect(mockPost).not.toHaveBeenCalled();
      const [endpoint, formData] = mockPostFormData.mock.calls[0];
      expect(endpoint).toBe('/communications');
      expect(formData.get('communication')).toBe(JSON.stringify(EMAIL));
      // jsdom's FormData clones the blob, so compare identity by name.
      expect((formData.get('file-0') as File).name).toBe('flyer.pdf');
    });

    it('propagates MP errors', async () => {
      mockPost.mockRejectedValueOnce(new Error('Server error'));
      await expect(createService().createCommunication(EMAIL)).rejects.toThrow('Server error');
    });
  });

  describe('createCommunication — payloads MP would 500 on (#220)', () => {
    it('refuses SMS with no TextPhoneNumberId, and calls nothing', async () => {
      const { TextPhoneNumberId: _omitted, ...noNumber } = SMS;

      await expect(
        createService().createCommunication(noNumber as CommunicationInfo),
      ).rejects.toThrow(/TextPhoneNumberId/);

      expectNoMpCall();
    });

    it('refuses SMS with no TextPhoneNumberId on the attachments path too', async () => {
      // The guard must sit above the attachments branch, not inside one arm.
      const { TextPhoneNumberId: _omitted, ...noNumber } = SMS;
      const file = new File(['x'], 'x.pdf', { type: 'application/pdf' });

      await expect(
        createService().createCommunication(noNumber as CommunicationInfo, [file]),
      ).rejects.toThrow(/TextPhoneNumberId/);

      expectNoMpCall();
    });

    it('treats TextPhoneNumberId 0 as absent', async () => {
      // MP identity columns start at 1, so 0 is never a real number id — and
      // MP rejects it with the same "required and must be populated" 500.
      await expect(
        createService().createCommunication({ ...SMS, TextPhoneNumberId: 0 }),
      ).rejects.toThrow(/TextPhoneNumberId/);

      expectNoMpCall();
    });

    it("refuses the pre-fix 'Text' value rather than letting MP 500", async () => {
      await expect(
        createService().createCommunication({
          ...EMAIL,
          CommunicationType: 'Text',
        } as unknown as CommunicationInfo),
      ).rejects.toThrow(/Invalid CommunicationType "Text"/);

      expectNoMpCall();
    });

    it("refuses the pre-fix 'Letter' value as well", async () => {
      await expect(
        createService().createCommunication({
          ...EMAIL,
          CommunicationType: 'Letter',
        } as unknown as CommunicationInfo),
      ).rejects.toThrow(/Invalid CommunicationType "Letter"/);

      expectNoMpCall();
    });

    it('names the accepted values so the caller can fix it without the Swagger', async () => {
      await expect(
        createService().createCommunication({
          ...EMAIL,
          CommunicationType: 'Text',
        } as unknown as CommunicationInfo),
      ).rejects.toThrow(/Unknown, Email, SMS, RssFeed, GlobalMFA/);
    });
  });

  describe('sendMessage', () => {
    const MESSAGE: MessageInfo = {
      FromAddress: { DisplayName: 'Sender', Address: 'sender@example.com' },
      ToAddresses: [{ DisplayName: 'Recipient', Address: 'recipient@example.com' }],
      Subject: 'Test Message',
      Body: '<p>Hello</p>',
    };

    it('posts to /messages — email only, so no CommunicationType to guard', async () => {
      mockPost.mockResolvedValueOnce({ Communication_ID: 9 });
      await createService().sendMessage(MESSAGE);
      expect(mockPost).toHaveBeenCalledWith('/messages', { ...MESSAGE });
    });

    it('sends attachments as multipart form data', async () => {
      mockPostFormData.mockResolvedValueOnce({ Communication_ID: 10 });
      const file = new File(['data'], 'report.csv', { type: 'text/csv' });

      await createService().sendMessage(MESSAGE, [file]);

      const [endpoint, formData] = mockPostFormData.mock.calls[0];
      expect(endpoint).toBe('/messages');
      expect(formData.get('message')).toBe(JSON.stringify(MESSAGE));
      expect((formData.get('file-0') as File).name).toBe('report.csv');
    });

    it('propagates MP errors', async () => {
      mockPost.mockRejectedValueOnce(new Error('Server error'));
      await expect(createService().sendMessage(MESSAGE)).rejects.toThrow('Server error');
    });
  });
});

/**
 * Compile-time half of the fix. These never run — `tsc --noEmit` (and the
 * `verify` CI job) is what checks them: each `@ts-expect-error` fails the build
 * if the type ever stops rejecting the payload beneath it.
 */
describe('CommunicationInfo — type-level contract (#220)', () => {
  it('rejects the invented values and demands a number for SMS', () => {
    const invalidType: CommunicationInfo = {
      ...EMAIL,
      // @ts-expect-error — 'Text' is not a Platform.Messaging.CommunicationType member.
      CommunicationType: 'Text',
    };

    const invalidLetter: CommunicationInfo = {
      ...EMAIL,
      // @ts-expect-error — 'Letter' never existed in MP's enum either.
      CommunicationType: 'Letter',
    };

    // @ts-expect-error — 'SMS' requires TextPhoneNumberId.
    const smsWithoutNumber: CommunicationInfo = {
      ...EMAIL,
      CommunicationType: 'SMS',
    };

    expect([invalidType, invalidLetter, smsWithoutNumber]).toHaveLength(3);
  });
});
