import { ActionType } from "@/features/flows/react-flow/action-type"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const spacingBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.enum([ActionType.Spacing]),
})
export type SpacingBlockSchema = z.infer<typeof spacingBlockSchema>

export const spacingBlockDefaultValue = (): SpacingBlockSchema => ({
  id: createId(),
  actionType: ActionType.Spacing,
})
