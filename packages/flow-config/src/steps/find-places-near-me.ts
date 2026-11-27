import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import { stepTypes } from "./step-action"

export const findPlacesNearMeStepSchema = baseStepSchema.extend({
  stepType: z
    .literal(stepTypes.enum.findPlacesNearMe)
    .describe('Step type discriminator: "findPlacesNearMe".'),
  placeCategoryId: zodBigintAsString()
    .nullable()
    .describe(
      "Place category id from placeCategories.list; null = all locations.",
    ),
})

export type FindPlacesNearMeStepSchema = z.infer<
  typeof findPlacesNearMeStepSchema
>

export const findPlacesNearMeStepDefaultFn =
  (): FindPlacesNearMeStepSchema => ({
    id: createId(),
    stepType: stepTypes.enum.findPlacesNearMe,
    placeCategoryId: null,
  })
