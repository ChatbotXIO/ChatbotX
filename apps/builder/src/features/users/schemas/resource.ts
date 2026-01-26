import type { UserModel } from "@aha.chat/database/types"

export type UserResource = UserModel

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
