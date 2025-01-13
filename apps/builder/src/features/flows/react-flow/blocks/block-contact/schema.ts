import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"

export const blockContactBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.BlockContact),
})

export type BlockContactBlockSchema = z.infer<typeof blockContactBlockSchema>

export const blockContactBlockDefaultValue = (): BlockContactBlockSchema => ({
  id: createId(),
  actionType: ActionType.BlockContact,
})
