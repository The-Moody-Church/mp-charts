import { MinistryPlatformClient } from "../client";
import { CommunicationInfo, Communication, MessageInfo, COMMUNICATION_TYPES } from "../types";

export class CommunicationService {
    private client: MinistryPlatformClient;

    constructor(client: MinistryPlatformClient) {
        this.client = client;
    }

    /**
     * Creates a new communication, immediately renders it and schedules for delivery.
     *
     * @throws {Error} before any network call when the payload is one MP would
     * reject — see `assertSendable`.
     */
    public async createCommunication(
        communication: CommunicationInfo,
        attachments?: File[]
    ): Promise<Communication> {
        assertSendable(communication);
        try {
            await this.client.ensureValidToken();

            if (attachments && attachments.length > 0) {
                return await this.createCommunicationWithAttachments(communication, attachments);
            } else {
                return await this.client.getHttpClient().post<Communication>('/communications', { ...communication });
            }
        } catch (error) {
            console.error('Error creating communication:', error);
            throw error;
        }
    }
    /**
     * Creates email messages from the provided information and immediately schedules them for delivery.
     */
    public async sendMessage(
        message: MessageInfo,
        attachments?: File[]
    ): Promise<Communication> {
        try {
            await this.client.ensureValidToken();

            if (attachments && attachments.length > 0) {
                return await this.sendMessageWithAttachments(message, attachments);
            } else {
                return await this.client.getHttpClient().post<Communication>('/messages', { ...message });
            }
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    private async createCommunicationWithAttachments(
        communication: CommunicationInfo,
        attachments: File[]
    ): Promise<Communication> {
        const formData = new FormData();
        formData.append('communication', JSON.stringify(communication));
        
        attachments.forEach((file, index) => {
            formData.append(`file-${index}`, file, file.name);
        });

        return await this.client.getHttpClient().postFormData<Communication>('/communications', formData);
    }

    private async sendMessageWithAttachments(
        message: MessageInfo,
        attachments: File[]
    ): Promise<Communication> {
        const formData = new FormData();
        formData.append('message', JSON.stringify(message));
        
        attachments.forEach((file, index) => {
            formData.append(`file-${index}`, file, file.name);
        });

        return await this.client.getHttpClient().postFormData<Communication>('/messages', formData);
    }
}

/**
 * Reject a communication MP would reject, before spending a round trip on it.
 *
 * MP answers both of these with an HTTP **500** and a stringly-typed message
 * rather than a 400, so without this the caller sees a server error with no
 * indication that their payload was at fault. The type system already prevents
 * both for ordinary callers; this catches the ones that arrive through an `as`
 * cast, `JSON.parse`, or a value widened to `string` somewhere upstream.
 */
function assertSendable(communication: CommunicationInfo): void {
    const type = communication.CommunicationType;
    if (!(COMMUNICATION_TYPES as readonly string[]).includes(type)) {
        throw new Error(
            `Invalid CommunicationType "${type}". Ministry Platform accepts only: ` +
                `${COMMUNICATION_TYPES.join(', ')}.`
        );
    }
    if (type === 'SMS' && !communication.TextPhoneNumberId) {
        throw new Error(
            "CommunicationType 'SMS' requires TextPhoneNumberId " +
                '(dp_SMS_Numbers.SMS_Number_ID of the outbound number).'
        );
    }
}
