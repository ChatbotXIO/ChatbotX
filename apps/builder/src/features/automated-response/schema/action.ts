import { keywordConditionsSchema } from "@chatbotx.io/database/partials/keyword-condition-schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const responseModes = z.enum(["flowId", "text"])
export type ResponseMode = z.infer<typeof responseModes>

export const createAutomatedResponseRequest = z
  .object({
    folderId: zodBigintAsString().nullish(),
    // Page (outbound) rules match exact keywords; Contact (inbound) rules
    // send `conditions` instead.
    keywords: z
      .array(
        z.object({
          value: z.string().min(1).max(255),
        }),
      )
      .optional(),
    conditions: keywordConditionsSchema.optional(),
    text: z.string().length(0).or(z.string().min(1)).nullish(),
    flowId: z.string().length(0).or(zodBigintAsString()).nullish(),
  })
  .refine((data) => data.keywords?.length || data.conditions?.length, {
    error: "keywordsOrConditionsRequired",
    path: ["keywords"],
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
