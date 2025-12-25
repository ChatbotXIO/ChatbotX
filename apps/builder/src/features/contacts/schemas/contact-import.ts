import { InboxType } from "@aha.chat/database/types"
import z from "zod"

export const importContactsRequest = z.object({
  file: z.instanceof(File),
  inboxType: z.enum(InboxType),
  phoneNumber: z.string().optional(),
  contactId: z.string(),
  email: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  tagId: z.string().optional(),
  fieldMapping: z
    .array(
      z.object({
        column: z.string(),
        fieldId: z.string(),
      }),
    )
    .optional(),
})
export type ImportContactsRequest = z.infer<typeof importContactsRequest>
