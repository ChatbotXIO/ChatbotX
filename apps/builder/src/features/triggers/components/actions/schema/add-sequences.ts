import { triggerActions } from "@chatbotx.io/database/partials"
import z from "zod"
import { sequenceIdsField } from "./sequence-ids"

export const addSequences = z.object({
  type: z
    .literal(triggerActions.enum.addSequence)
    .describe('Action type "addSequence".'),
  sequenceIds: sequenceIdsField(
    "Ids of the sequences (from `sequences.list`) to subscribe the contact to. Subscribing from a trigger does not fire sequence triggers or sequence outbound webhooks.",
  ),
})
export type AddSequences = z.infer<typeof addSequences>

export const defaultFn = (): AddSequences => ({
  type: triggerActions.enum.addSequence,
  sequenceIds: [],
})
