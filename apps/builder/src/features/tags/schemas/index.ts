import type { Tag } from "@ahachat.ai/database/types"

export type TagResource = Tag

export type TagCollection = {
  data: TagResource[]
  pageCount: number
}
