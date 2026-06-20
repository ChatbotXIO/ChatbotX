import { messengerPersistentMenuSchema } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { userPersistentMenuResource } from "./resource"

const userPersistentMenuRequest = z.object({
  name: z.string().trim().min(1).max(255),
  persistentMenus: z.array(messengerPersistentMenuSchema).max(20),
})

export const createUserPersistentMenuRequest = userPersistentMenuRequest
export type CreateUserPersistentMenuRequest = z.infer<
  typeof createUserPersistentMenuRequest
>

export const updateUserPersistentMenuRequest = userPersistentMenuRequest
export type UpdateUserPersistentMenuRequest = z.infer<
  typeof updateUserPersistentMenuRequest
>

export const listUserPersistentMenusRequest = z.object({
  workspaceId: zodBigintAsString(),
})
export type ListUserPersistentMenusRequest = z.infer<
  typeof listUserPersistentMenusRequest
>

export const listUserPersistentMenusResponse = z.object({
  data: z.array(userPersistentMenuResource),
})
export type ListUserPersistentMenusResponse = z.infer<
  typeof listUserPersistentMenusResponse
>
