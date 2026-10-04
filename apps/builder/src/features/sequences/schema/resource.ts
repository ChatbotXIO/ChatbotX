import {
  createSelectSchema,
  sequenceModel,
  sequenceStepModel,
} from "@chatbotx.io/database/schema"
import z from "zod"

export const sequenceResource = createSelectSchema(sequenceModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
})
export const sequenceStepResource = createSelectSchema(sequenceStepModel, {
  id: z.string(),
  sequenceId: z.string(),
  flowId: z.string().nullable(),
})

// `sequences.get` returns the steps too: their ids are the only handle for
// `sequences.upsertStep` / `sequences.deleteStep`.
export const sequenceDetailResource = sequenceResource.extend({
  steps: z.array(sequenceStepResource),
})

export type SequenceResource = typeof sequenceModel.$inferSelect
