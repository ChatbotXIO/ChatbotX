import type { UserModel } from "@aha.chat/database/types"

export type UserResource = UserModel

export type UserCollection = {
  data: UserResource[]
  pageCount: number
}
