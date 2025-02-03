import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"

export const disableBotBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.DisableBot),
  notifyAdmin: z.boolean().default(true),
})

export type DisableBotBlockSchema = z.infer<typeof disableBotBlockSchema>

export const disableBotBlockDefaultValue = (): DisableBotBlockSchema => ({
  id: createId(),
  actionType: ActionType.DisableBot,
  notifyAdmin: true,
})
