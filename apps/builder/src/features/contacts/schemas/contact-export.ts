import z from "zod"

export const exportContactsRequest = z.object({
  fields: z.array(z.string()).min(1),
  contactIds: z.array(z.string()).min(1),
})
export type ExportContactsRequest = z.infer<typeof exportContactsRequest>
