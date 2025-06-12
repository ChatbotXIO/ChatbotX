import type { User } from "@ahachat.ai/database/types"

export type UserResource = User

export type UserCollection = {
  data: UserResource[]
  pageCount: number
}
