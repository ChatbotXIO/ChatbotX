import { ActionType } from "@/features/flows/react-flow/action-type"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const textBlockSchema = z.object({
  id: z.string().cuid2(),
  text: z.string().min(1).max(1000),
  actionType: z.enum([ActionType.Text]),
})
export type TextBlockSchema = z.infer<typeof textBlockSchema>

export const textBlockDefaultValue = (text = ""): TextBlockSchema => ({
  id: createId(),
  text,
  actionType: ActionType.Text,
})
