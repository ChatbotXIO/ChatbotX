import { z } from "zod"

export const clearContactCustomFieldRequest = z.object({
  ids: z.array(z.string().cuid2()),
  customFieldId: z.string().cuid2(),
})
export type ClearContactCustomFieldRequest = z.infer<
  typeof clearContactCustomFieldRequest
>
