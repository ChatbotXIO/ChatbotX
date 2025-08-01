import type { FieldModel } from "@aha.chat/database/types"

export type AccountFieldResource = FieldModel

export type AccountFieldCollection = {
  data: AccountFieldResource[]
  pageCount: number
}
