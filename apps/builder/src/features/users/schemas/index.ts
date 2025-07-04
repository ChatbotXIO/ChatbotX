import type { UserModel } from "@ahachat.ai/database/types"

export type UserResource = UserModel

export type UserCollection = {
  data: UserResource[]
  pageCount: number
}
