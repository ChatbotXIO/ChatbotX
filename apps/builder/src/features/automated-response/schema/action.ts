import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const responseModes = z.enum(["flowId", "text"])
export type ResponseMode = z.infer<typeof responseModes>

export const createAutomatedResponseRequest = z
  .object({
    folderId: zodBigintAsString().nullish(),
    keywords: z
      .array(
        z.object({
          value: z.string().min(1).max(255),
        }),
      )
      .min(1),
    text: z.string().length(0).or(z.string().min(1)).nullish(),
    flowId: z.string().length(0).or(zodBigintAsString()).nullish(),
  })
  .refine((data) => data.flowId?.length || data.text?.length, {
    error: "You need to select a flow or fill in the text.",
    path: ["flowId"],
  })
export type CreateAutomatedResponseRequest = z.infer<
  typeof createAutomatedResponseRequest
>

export const updateAutomatedResponseRequest = createAutomatedResponseRequest
export type UpdateAutomatedResponseRequest = z.infer<
  typeof updateAutomatedResponseRequest
>
