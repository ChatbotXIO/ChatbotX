import { ActionType } from "@/features/flows/react-flow/action-type"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const singleButtonBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.enum([ActionType.SingleButton]),
  name: z.string(),
})
export type SingleButtonBlockSchema = z.infer<typeof singleButtonBlockSchema>

export const singleButtonBlockDefaultValue = (
  name = "",
): SingleButtonBlockSchema => ({
  id: createId(),
  actionType: ActionType.SingleButton,
  name,
})
