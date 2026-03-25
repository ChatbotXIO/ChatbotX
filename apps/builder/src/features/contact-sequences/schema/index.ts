import {
  contactsOnSequenceModel,
  createSelectSchema,
} from "@aha.chat/database/schema"
import { z } from "zod"
import { sequenceResource } from "@/features/sequences/schema"

export const contactOnSequenceWithRelations = createSelectSchema(
  contactsOnSequenceModel,
).and(
  z.object({
    sequence: sequenceResource,
  }),
)
export type ContactOnSequenceWithRelations = z.infer<
  typeof contactOnSequenceWithRelations
>

export const updateContactSequenceRequest = z.object({
  contactId: z.cuid2(),
  sequences: z.array(z.string().trim()),
})
export type UpdateContactSequenceRequest = z.infer<
  typeof updateContactSequenceRequest
>
