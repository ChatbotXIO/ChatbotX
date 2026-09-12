import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  createUserPersistentMenuRequest,
  updateUserPersistentMenuRequest,
} from "./action"
import { userPersistentMenuResource } from "./resource"
export const userPersistentMenuPublicResource = userPersistentMenuResource.omit(
  { workspaceId: true },
)

export const listUserPersistentMenusPublicResponse = z.object({
  data: z.array(userPersistentMenuPublicResource),
})

export const createUserPersistentMenuPublicRequest =
  createUserPersistentMenuRequest

export const updateUserPersistentMenuPublicRequest =
  updateUserPersistentMenuRequest.and(z.object({ id: zodBigintAsString() }))
