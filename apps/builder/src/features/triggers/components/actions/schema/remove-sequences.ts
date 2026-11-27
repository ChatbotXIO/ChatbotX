import { triggerActions } from "@chatbotx.io/database/partials"
import z from "zod"
import { sequenceIdsField } from "./sequence-ids"

export const removeSequences = z.object({
  type: z
    .literal(triggerActions.enum.removeSequence)
    .describe('Action type "removeSequence".'),
  sequenceIds: sequenceIdsField(
    "Ids of the sequences (from `sequences.list`) to unsubscribe the contact from. Unsubscribing from a trigger does not fire sequence triggers or sequence outbound webhooks.",
  ),
})
export type RemoveSequences = z.infer<typeof removeSequences>

export const defaultFn = (): RemoveSequences => ({
  type: triggerActions.enum.removeSequence,
  sequenceIds: [],
})
