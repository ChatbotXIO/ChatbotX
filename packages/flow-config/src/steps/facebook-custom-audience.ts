import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const facebookCustomAudienceOperations = z.enum(["add", "remove"])
export type FacebookCustomAudienceOperation = z.infer<
  typeof facebookCustomAudienceOperations
>

export const facebookCustomAudienceSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.facebookCustomAudience),
  operation: facebookCustomAudienceOperations.default("add"),
  adAccountId: z.string().trim().min(1),
  customAudienceId: z.string().trim().min(1),
})

export type FacebookCustomAudienceSchema = z.infer<
  typeof facebookCustomAudienceSchema
>

export const facebookCustomAudienceDefaultFn =
  (): FacebookCustomAudienceSchema => ({
    id: createId(),
    stepType: stepTypes.enum.facebookCustomAudience,
    operation: "add",
    adAccountId: "",
    customAudienceId: "",
  })
