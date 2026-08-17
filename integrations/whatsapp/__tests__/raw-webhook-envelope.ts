/**
 * Shared test fixture: wraps a raw `contacts[0]` object in the Cloud API
 * `messages` webhook envelope shaped per Meta's documented WhatsApp
 * Usernames contract (business-messaging/whatsapp/business-scoped-user-ids).
 * Single place to update if Meta's envelope shape changes.
 */
export const buildRawMessagesEnvelope = (
  contact: Record<string, unknown>,
): Record<string, unknown> => ({
  entry: [{ changes: [{ value: { contacts: [contact] } }] }],
})
