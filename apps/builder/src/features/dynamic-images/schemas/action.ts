import { dynamicImageDocument } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const createDynamicImageRequest = z.object({
  name: z.string().min(1).max(100),
  customFieldId: zodBigintAsString().nullish(),
  data: dynamicImageDocument,
})
export type CreateDynamicImageRequest = z.infer<
  typeof createDynamicImageRequest
>

export const updateDynamicImageRequest = createDynamicImageRequest
export type UpdateDynamicImageRequest = z.infer<
  typeof updateDynamicImageRequest
>
