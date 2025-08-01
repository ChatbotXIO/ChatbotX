import type { TagModel } from "@aha.chat/database/types"

export type TagResource = TagModel

export type TagCollection = {
  data: TagResource[]
  pageCount: number
}
