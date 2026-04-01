import {
  contactsOnSequenceModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
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
  contactId: z.bigint(),
  sequences: z.array(z.bigint()),
})
export type UpdateContactSequenceRequest = z.infer<
  typeof updateContactSequenceRequest
>
