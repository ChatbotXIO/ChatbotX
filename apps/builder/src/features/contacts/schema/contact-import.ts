import {
  type ContactImportMeta,
  channelTypes,
  countryCodeSchema,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const importContactsRequest = z
  .object({
    fileId: zodBigintAsString(),
    channel: channelTypes,
    inboxId: zodBigintAsString(),
    timezone: z.string().trim().min(1).max(255).optional(),
    countryCode: z.preprocess(
      (val) => (val === "" ? undefined : val),
      countryCodeSchema.optional(),
    ),
    phoneNumber: z.string().max(255).optional(),
    contactId: z.string().max(255).optional(),
    // Channel-agnostic column-map key mirroring `ContactInbox.sourceUserId`
    // (e.g. a WhatsApp Business-Scoped User ID). Only meaningful for whatsapp
    // imports today — see the `superRefine` rule below.
    sourceUserId: z.string().max(255).optional(),
    email: z.string().max(255).optional(),
    firstName: z.string().max(255).optional(),
    lastName: z.string().max(255).optional(),
    tagId: zodBigintAsString().optional(),
    fieldMapping: z.preprocess(
      (val) =>
        Array.isArray(val)
          ? val.filter((row) => row?.column && row?.customFieldId)
          : val,
      z
        .array(
          z.object({
            column: z.string().min(1).max(255),
            // A custom field id, or a `bot_field:<id>` reference from the
            // combined picker — a bot-field mapping is applied once after
            // the import completes (last row wins), not per row.
            customFieldId: z.union([
              zodBigintAsString(),
              z.string().regex(/^bot_field:\d+$/),
            ]),
          }),
        )
        .max(10)
        .optional(),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.channel === channelTypes.enum.whatsapp) {
      // A whatsapp row can be keyed by phone OR by its scoped user id alone
      // (a BSUID-only contact — see the contact-import-source-user-id plan);
      // at least one identity mapping is required.
      if (!(data.phoneNumber || data.sourceUserId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["phoneNumber"],
          message:
            "Phone number or WhatsApp User ID is required for WhatsApp imports",
        })
      }
    } else if (!data.contactId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contactId"],
        message: "Contact ID is required",
      })
    }
  })
export type ImportContactsRequest = z.infer<typeof importContactsRequest>

/**
 * Maps a validated import request to the persisted import meta. Kept beside
 * the schema (the action module is "use server" and cannot export plain
 * helpers) so the request → columnMap mapping stays unit-testable.
 */
export const buildContactImportMeta = (
  parsed: ImportContactsRequest,
): ContactImportMeta => ({
  channel: parsed.channel,
  timezone: parsed.timezone,
  countryCode: parsed.countryCode,
  columnMap: {
    contactId: parsed.contactId,
    phoneNumber: parsed.phoneNumber,
    email: parsed.email,
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    sourceUserId: parsed.sourceUserId,
  },
  fieldMapping: parsed.fieldMapping?.filter(
    (mapping) => mapping.column && mapping.customFieldId,
  ),
  tagId: parsed.tagId || undefined,
})

export const importContactsResponse = z.object({
  importId: zodBigintAsString(),
})
export type ImportContactsResponse = z.infer<typeof importContactsResponse>
