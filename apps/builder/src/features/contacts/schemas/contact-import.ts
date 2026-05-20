import { channelTypes, countryCodeSchema } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const importContactsRequest = z
  .object({
    fileId: zodBigintAsString(),
    channel: channelTypes,
    inboxId: zodBigintAsString(),
    countryCode: z.preprocess(
      (val) => (val === "" ? undefined : val),
      countryCodeSchema.optional(),
    ),
    phoneNumber: z.string().max(255).optional(),
    contactId: z.string().max(255).optional(),
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
            customFieldId: zodBigintAsString(),
          }),
        )
        .max(10)
        .optional(),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.channel === channelTypes.enum.whatsapp) {
      if (!data.phoneNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["phoneNumber"],
          message: "Phone number is required for WhatsApp imports",
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

export const importContactsResponse = z.object({
  importId: zodBigintAsString(),
})
export type ImportContactsResponse = z.infer<typeof importContactsResponse>
