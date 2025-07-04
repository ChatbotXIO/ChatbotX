import type { TagModel } from "@ahachat.ai/database/types"

export type TagResource = TagModel

export type TagCollection = {
  data: TagResource[]
  pageCount: number
}
