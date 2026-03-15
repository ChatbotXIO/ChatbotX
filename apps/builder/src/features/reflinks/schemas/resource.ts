import { createSelectSchema, reflinkModel } from "@aha.chat/database/schema"
import type z from "zod"

export const reflinkResource = createSelectSchema(reflinkModel)
export type ReflinkResource = z.infer<typeof reflinkResource>
// export type ReflinkResource = ReflinkModel & {
//   flow?: FlowResource
//   field?: FieldModel
// }

export type ReflinkCollection = {
  data: ReflinkResource[]
  pageCount: number
}
