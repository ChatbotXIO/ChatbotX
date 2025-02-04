import { ActionType } from "@/features/flows/react-flow/action-type"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const inputBlockSchema = z.object({
  id: z.string().cuid2(),
  input: z.string().min(1).max(255),
  label: z.string().nullable(),
  placeholder: z.string().nullable(),
  actionType: z.enum([
    ActionType.From,
    ActionType.To,
    ActionType.Subject,
    ActionType.PreHeader,
  ]),
})
export type InputBlockSchema = z.infer<typeof inputBlockSchema>

export const inputBlockDefaultValue = (input = ""): InputBlockSchema => ({
  id: createId(),
  input,
  actionType: ActionType.From,
  label: null,
  placeholder: null,
})
