import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const setMessengerUserPersistentMenuStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.setMessengerUserPersistentMenu),
  // Empty/undefined means the page's persistent menu (Default).
  userPersistentMenuId: z.string().optional(),
})

export type SetMessengerUserPersistentMenuStepSchema = z.infer<
  typeof setMessengerUserPersistentMenuStepSchema
>

export const setMessengerUserPersistentMenuStepDefaultFn = (
  props?: Partial<SetMessengerUserPersistentMenuStepSchema>,
): SetMessengerUserPersistentMenuStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.setMessengerUserPersistentMenu,
  userPersistentMenuId: "",
  ...props,
})
