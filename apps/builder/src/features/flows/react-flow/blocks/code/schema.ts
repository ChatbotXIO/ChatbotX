import { ActionType } from "@/features/flows/react-flow/action-type"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const codeBlockSchema = z.object({
  id: z.string().cuid2(),
  code: z.string().min(1).max(1000),
  actionType: z.enum([ActionType.Code]),
})
export type CodeBlockSchema = z.infer<typeof codeBlockSchema>

export const codeBlockDefaultValue = (code = ""): CodeBlockSchema => ({
  id: createId(),
  code,
  actionType: ActionType.Code,
})
