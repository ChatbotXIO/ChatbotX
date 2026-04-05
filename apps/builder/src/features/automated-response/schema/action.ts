import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const createAutomatedResponseRequest = z.object({
  folderId: zodBigintAsString().nullish(),
  userMessages: z
    .array(
      z.object({
        value: z.string().min(1).max(255),
      }),
    )
    .min(1),
  text: z.string().min(1).max(255).nullish(),
  flowId: zodBigintAsString().nullish(),
})
export type CreateAutomatedResponseRequest = z.infer<
  typeof createAutomatedResponseRequest
>

export const updateAutomatedResponseRequest = createAutomatedResponseRequest
  .extend({
    status: z.boolean(),
  })
  .partial()
export type UpdateAutomatedResponseRequest = z.infer<
  typeof updateAutomatedResponseRequest
>
