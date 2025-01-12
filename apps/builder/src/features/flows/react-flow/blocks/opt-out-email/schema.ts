import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"

export const optOutEmailBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.OptOutEmail),
})

export type OptOutEmailBlockSchema = z.infer<typeof optOutEmailBlockSchema>

export const optOutEmailBlockDefaultValue = (): OptOutEmailBlockSchema => ({
  id: createId(),
  actionType: ActionType.OptOutEmail,
})
