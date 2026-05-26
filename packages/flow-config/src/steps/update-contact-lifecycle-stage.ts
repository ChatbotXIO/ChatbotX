import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

/**
 * Step "Atualizar ciclo de vida" — replica o node "Update Lifecycle" do
 * Respond.io. Dois modos:
 *  - action="update": joga o contato na stage configurada em `lifecycleStageId`,
 *    independente da etapa anterior.
 *  - action="remove": tira o contato de qualquer etapa (lifecycleStageId = null).
 */
export const updateContactLifecycleStageAction = z.enum(["update", "remove"])
export type UpdateContactLifecycleStageAction = z.infer<
  typeof updateContactLifecycleStageAction
>

export const updateContactLifecycleStageStepSchema = z
  .object({
    id: zodBigintAsString(),
    stepType: z.literal(stepTypes.enum.updateContactLifecycleStage),
    action: updateContactLifecycleStageAction,
    lifecycleStageId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === "update" && !data.lifecycleStageId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lifecycleStageId"],
        message: "Selecione uma etapa",
      })
    }
  })

export type UpdateContactLifecycleStageStepSchema = z.infer<
  typeof updateContactLifecycleStageStepSchema
>

export const updateContactLifecycleStageStepDefaultFn = (
  props?: Partial<UpdateContactLifecycleStageStepSchema>,
): UpdateContactLifecycleStageStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.updateContactLifecycleStage,
  action: "update",
  lifecycleStageId: "",
  ...props,
})
