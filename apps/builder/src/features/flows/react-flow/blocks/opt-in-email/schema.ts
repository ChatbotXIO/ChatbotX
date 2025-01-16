import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"

export const optInEmailBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.OptInEmail),
})

export type OptInEmailBlockSchema = z.infer<typeof optInEmailBlockSchema>

export const optInEmailBlockDefaultValue = (): OptInEmailBlockSchema => ({
  id: createId(),
  actionType: ActionType.OptInEmail,
})
