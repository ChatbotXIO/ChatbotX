import type { Field } from "@ahachat.ai/database"

export type AccountFieldResource = Field

export type AccountFieldCollection = {
  data: AccountFieldResource[]
  pageCount: number
}
