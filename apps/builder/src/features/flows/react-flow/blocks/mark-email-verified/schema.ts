import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"

export const markEmailVerifiedBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.MarkEmailVerified),
})

export type MarkEmailVerifiedBlockSchema = z.infer<
  typeof markEmailVerifiedBlockSchema
>

export const markEmailVerifiedBlockDefaultValue =
  (): MarkEmailVerifiedBlockSchema => ({
    id: createId(),
    actionType: ActionType.MarkEmailVerified,
  })
