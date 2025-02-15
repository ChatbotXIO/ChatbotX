import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"

export const startFlowBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.StartFlow),
  flowId: z.string().cuid2(),
})

export type StartFlowBlockSchema = z.infer<typeof startFlowBlockSchema>

export const startFlowBlockDefaultValue = (): StartFlowBlockSchema => ({
  id: createId(),
  actionType: ActionType.StartFlow,
  flowId: "",
})
