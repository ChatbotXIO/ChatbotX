import type { ConnectWhatsappSchema } from "../schemas"

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
  PHONE_NUMBER_ID: "phoneNumberId",
  BUSINESS_ID: "businessId",
  SIGNUP_SESSION_ID: "signupSessionId",
  CODE: "code",
} as const satisfies Record<string, keyof ConnectWhatsappSchema>
