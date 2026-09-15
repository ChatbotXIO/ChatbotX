import { channelTypes, genderTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { contactFilterCriteriaSchema } from "@/features/contact-filter/schema"
import type { ContactResource } from "./resource"

export const contactPrefix = "sys"
export const contactFieldPrefix = "cus"
export const contactTagPrefix = "tag"

export const createContactRequest = z
  .object({
    phoneNumber: z
      .union([
        z.literal(""),
        z
          .string()
          .min(10)
          .max(20)
          .regex(/\+?\d{10,20}/),
      ])
      .optional()
      .describe(
        "Contact's phone number. Required when `channel` is `whatsapp`.",
      ),
    email: z
      .union([z.literal(""), z.email().max(100)])
      .describe("Contact's email address. Required when `channel` is `smtp`."),
    contactId: z
      .string()
      .max(255)
      .optional()
      .describe(
        "Channel-specific user id (e.g. Messenger PSID). Required for channels other than webchat/omnichannel.",
      ),
    firstName: z
      .optional(z.string().trim().max(100))
      .describe("Contact's first name."),
    lastName: z
      .optional(z.string().trim().max(100))
      .describe("Contact's last name."),
    gender: genderTypes.describe("Contact's gender."),
    channel: channelTypes.describe(
      "Channel this contact is reachable on; determines which of phoneNumber/email/contactId is required.",
    ),
    inboxId: zodBigintAsString("Please select an inbox").describe(
      "Inbox id (numeric string) to create the contact in. Get it from `inboxes.list`.",
    ),
  })
  .superRefine((data, ctx) => {
    const ch = data.channel
    if (ch === channelTypes.enum.whatsapp) {
      if (!data.phoneNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["phoneNumber"],
          message: "Phone number is required for WhatsApp",
        })
      }
    } else if (ch === channelTypes.enum.smtp) {
      if (!data.email) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["email"],
          message: "Email is required for the Email channel",
        })
      }
    } else if (
      ch !== channelTypes.enum.webchat &&
      ch !== channelTypes.enum.omnichannel &&
      !data.contactId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contactId"],
        message: "User ID is required for this channel",
      })
    }
  })
export type CreateContactRequest = z.infer<typeof createContactRequest>

export const createContactResponse = z.object({
  id: zodBigintAsString(),
})
export type CreateContactResponse = z.infer<typeof createContactResponse>

export const updateContactFieldRequest = z.record(z.string(), z.string())
export type UpdateContactFieldRequest = z.infer<
  typeof updateContactFieldRequest
>

export const exportContactsFilter = z.object({
  keyword: z
    .string()
    .optional()
    .describe(
      "Case-insensitive substring match against the contact's name, email, or phone.",
    ),
  contactFilter: contactFilterCriteriaSchema
    .optional()
    .describe(
      "Structured filter for advanced matching beyond keyword. See `contactFilter.get`.",
    ),
})
export type ExportContactsFilter = z.infer<typeof exportContactsFilter>

export const exportContactsRequest = z
  .object({
    fields: z
      .array(z.string())
      .min(1)
      .describe(
        "Contact fields to include as CSV columns, e.g. `sys:firstName`, `sys:email`, or a custom field id.",
      ),
    contactIds: z
      .array(zodBigintAsString())
      .optional()
      .describe(
        "Specific contact ids to export. Required unless `exportAll` is true.",
      ),
    exportAll: z
      .boolean()
      .optional()
      .describe(
        "Export every contact matching `filter` (or the whole workspace if omitted).",
      ),
    filter: exportContactsFilter
      .optional()
      .describe("Narrows which contacts `exportAll` exports."),
  })
  .refine(
    (data) => (data.exportAll ? true : (data.contactIds?.length ?? 0) > 0),
    {
      message: "Either contactIds or exportAll must be provided",
      path: ["contactIds"],
    },
  )
export type ExportContactsRequest = z.infer<typeof exportContactsRequest>

export const exportContactsResponse = z.object({
  fileId: zodBigintAsString().describe(
    "Export file id (numeric string). Poll `contacts.getExportFile` with it.",
  ),
})
export type ExportContactsResponse = z.infer<typeof exportContactsResponse>

export const getExportFileRequest = z.object({
  workspaceId: zodBigintAsString(),
  fileId: zodBigintAsString(),
})
export type GetExportFileRequest = z.infer<typeof getExportFileRequest>

export const getExportFileResponse = z.object({
  status: z.enum(["pending", "uploaded", "failed"]),
  fileName: z.string(),
  downloadUrl: z.string().nullable(),
  totalRecords: z.number().nullable(),
})
export type GetExportFileResponse = z.infer<typeof getExportFileResponse>

export const refreshContactProfileRequest = z.object({
  contactInboxId: zodBigintAsString(),
})
export type RefreshContactProfileRequest = z.infer<
  typeof refreshContactProfileRequest
>

// Builder-level reasons a refresh produced no update. Mirrors
// `ContactProfileRefreshResult["reason"]`
// (`packages/business/src/contact/profile-refresh/service.ts`) plus
// `channelNotCapable` — the one outcome the business service never produces
// since `refresh()` never inspects the channel name.
export type RefreshContactProfileSkippedReason =
  | "profileComplete"
  | "coolingDown"
  | "channelNotCapable"

/** Client contract for `refreshContactProfileAction` — `failed` and
 * `unavailable` are returned, never thrown. */
export type RefreshContactProfileResult =
  | { status: "updated"; contact: ContactResource }
  | { status: "skipped"; reason: RefreshContactProfileSkippedReason }
  | { status: "unavailable" }
  | { status: "failed" }
