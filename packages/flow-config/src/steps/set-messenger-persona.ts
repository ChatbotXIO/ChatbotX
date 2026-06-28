import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const setMessengerPersonaStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.setMessengerPersona),
  // The chosen persona's local id (MessengerPersona.id). Empty/undefined means
  // clear the contact's persona and fall back to the page default persona.
  personaId: z.string().optional(),
})

export type SetMessengerPersonaStepSchema = z.infer<
  typeof setMessengerPersonaStepSchema
>

export const setMessengerPersonaStepDefaultFn = (
  props?: Partial<SetMessengerPersonaStepSchema>,
): SetMessengerPersonaStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.setMessengerPersona,
  personaId: "",
  ...props,
})
