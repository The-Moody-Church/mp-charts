import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth-helpers', () => ({
  requireSession: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
  getMpUserId: () => 7,
}));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: vi.fn() }));
vi.mock('@/lib/processing-utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/processing-utils')>()),
  fileMagicMatchesType: vi.fn().mockResolvedValue(true),
}));

import { uploadContactPhoto } from './processing';

const upload = vi.fn();
const getService = async () => ({ uploadContactPhoto: upload });

function form(contactId: string) {
  const fd = new FormData();
  fd.set('Contact_ID', contactId);
  fd.set('photo', new File(['x'], 'p.png', { type: 'image/png' }));
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('uploadContactPhoto Contact_ID (N3)', () => {
  it('passes a positive integer ID to the service', async () => {
    await expect(uploadContactPhoto(form('42'), getService)).resolves.toEqual({ success: true });
    expect(upload).toHaveBeenCalledWith(42, expect.any(File), 7);
  });

  it.each(['0', '-1', '1.5', '1e3', '42abc', ''])('refuses %j without calling the service', async (id) => {
    await expect(uploadContactPhoto(form(id), getService)).resolves.toEqual({
      success: false,
      error: 'Invalid Contact_ID',
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it("reports a scope refusal from the feature's service as a failed upload", async () => {
    upload.mockRejectedValueOnce(new Error('Forbidden: record is not in scope for this tool'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(uploadContactPhoto(form('42'), getService)).resolves.toEqual({
      success: false,
      error: 'Failed to upload photo',
    });
  });
});
