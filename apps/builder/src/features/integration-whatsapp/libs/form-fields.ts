import type { ConnectWhatsappSchema } from "../schema"

/**
 * Field names of the WhatsApp connect form, shared by the form UI and the hooks
 * that write into it.
 *
 * `satisfies` pins every entry to a real key of `connectWhatsappSchema`, so
 * renaming a schema field fails the build here instead of silently writing to a
 * path that nothing validates and the server never reads.
 */
export const FORM_FIELDS = {
  WABA_ID: "wabaId",
  ACCESS_TOKEN: "accessToken",
  CONNECT_EXISTING: "connectExisting",
  TRANSFER_PHONE_NUMBER: "transferPhoneNumber",
  MANUAL_CONNECT: "manualConnect",
  MARKETING_MESSAGE_LITE: "marketingMessageLite",
  // Multi-select picker field (`CheckboxGroupField`) — the client fans out
  // one action call per id (`phoneNumberId`) rather than sending this array.
  PHONE_NUMBER_IDS: "phoneNumberIds",
  // The two per-row coexist switches: sync history, and (nested) AI reads it.
  COEXIST_PHONE_NUMBER_IDS: "coexistPhoneNumberIds",
  AI_READS_SYNCED_HISTORY_PHONE_NUMBER_IDS:
    "aiReadsSyncedHistoryPhoneNumberIds",
  // Manual connect's single radio — a scalar id, never an array.
  MANUAL_PHONE_NUMBER_ID: "manualPhoneNumberId",
  BUSINESS_ID: "businessId",
  SIGNUP_SESSION_ID: "signupSessionId",
  CODE: "code",
} as const satisfies Record<string, keyof ConnectWhatsappSchema>
