import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const moosendCreateContactSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.moosendCreateContact)
    .describe('Step type discriminator: "moosendCreateContact".'),
  listId: z.string().trim().min(1),
  emailField: z.string().trim().min(1),
  states: z.tuple([successStateSchema, errorStateSchema]),
})
export type MoosendCreateContactSchema = z.infer<
  typeof moosendCreateContactSchema
>

export const moosendCreateContactDefaultFn =
  (): MoosendCreateContactSchema => ({
    id: createId(),
    stepType: stepTypes.enum.moosendCreateContact,
    listId: "",
    emailField: "email",
    states: [successStateDefaultFn(), errorStateDefaultFn()],
  })
