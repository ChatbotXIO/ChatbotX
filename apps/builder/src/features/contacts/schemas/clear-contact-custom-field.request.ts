import { z } from "zod"

export const clearContactCustomFieldRequest = z.object({
  ids: z.array(z.cuid2()),
  customFieldId: z.cuid2(),
})
export type ClearContactCustomFieldRequest = z.infer<
  typeof clearContactCustomFieldRequest
>
