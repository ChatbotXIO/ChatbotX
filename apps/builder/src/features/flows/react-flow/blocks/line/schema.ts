import { ActionType } from "@/features/flows/react-flow/action-type"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const lineBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.enum([ActionType.Line]),
})
export type LineBlockSchema = z.infer<typeof lineBlockSchema>

export const lineBlockDefaultValue = (): LineBlockSchema => ({
  id: createId(),
  actionType: ActionType.Line,
})
