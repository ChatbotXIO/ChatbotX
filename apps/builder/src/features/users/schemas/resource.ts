import { createSelectSchema, userModel } from "@chatbotx.io/database/schema"
import { z } from "zod"

export const userResource = createSelectSchema(userModel, {
  id: z.string(),
})
export type UserResource = z.infer<typeof userResource>

export type UserCollection = {
  data: UserResource[]
  pageCount: number
}

export function getUserName(
  user: UserResource | null | undefined,
  defaultName = "-",
) {
  if (!user) {
    return defaultName
  }

  return user.name || user.email
}
