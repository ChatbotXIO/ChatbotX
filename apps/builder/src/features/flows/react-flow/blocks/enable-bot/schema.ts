import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"

export const enableBotBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.EnableBot),
})

export type EnableBotBlockSchema = z.infer<typeof enableBotBlockSchema>

export const enableBotBlockDefaultValue = (): EnableBotBlockSchema => ({
  id: createId(),
  actionType: ActionType.EnableBot,
})
