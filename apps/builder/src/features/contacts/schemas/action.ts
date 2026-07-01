import { channelTypes, genderTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { contactFilterCriteriaSchema } from "./contact-filter"

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
      .optional(),
    email: z.union([z.literal(""), z.email().max(100)]),
    contactId: z.string().max(255).optional(),
    firstName: z.optional(z.string().trim().max(100)),
    lastName: z.optional(z.string().trim().max(100)),
    gender: genderTypes,
    channel: channelTypes,
    inboxId: zodBigintAsString("Please select an inbox"),
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
  keyword: z.string().optional(),
  contactFilter: contactFilterCriteriaSchema.optional(),
})
export type ExportContactsFilter = z.infer<typeof exportContactsFilter>

export const exportContactsRequest = z
  .object({
    fields: z.array(z.string()).min(1),
    contactIds: z.array(zodBigintAsString()).optional(),
    exportAll: z.boolean().optional(),
    filter: exportContactsFilter.optional(),
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
  fileId: zodBigintAsString(),
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
