import {
  contactsOnSequenceModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { sequenceResource } from "@/features/sequences/schema/resource"

export const contactOnSequenceWithRelations = createSelectSchema(
  contactsOnSequenceModel,
  {
    contactId: z.string(),
    sequenceId: z.string(),
  },
).and(
  z.object({
    sequence: sequenceResource,
  }),
)
export type ContactOnSequenceWithRelations = z.infer<
  typeof contactOnSequenceWithRelations
>

export const updateContactSequenceRequest = z.object({
  contactId: zodBigintAsString(),
  sequences: z.array(zodBigintAsString()),
})
export type UpdateContactSequenceRequest = z.infer<
  typeof updateContactSequenceRequest
>
