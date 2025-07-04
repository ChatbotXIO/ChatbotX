import type { FieldModel } from "@ahachat.ai/database/types"

export type AccountFieldResource = FieldModel

export type AccountFieldCollection = {
  data: AccountFieldResource[]
  pageCount: number
}
