import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const REF_LINK_NAME_REGEX = /^[a-zA-Z0-9]+$/

export const createReflinkRequest = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .refine((value) => REF_LINK_NAME_REGEX.test(value)),
  flowId: zodBigintAsString(),
  customFieldId: z
    .union([z.literal("").transform(() => null), zodBigintAsString()])
    .nullable(),
})
export type CreateReflinkRequest = z.infer<typeof createReflinkRequest>

export const updateReflinkRequest = createReflinkRequest.partial()
export type UpdateReflinkRequest = z.infer<typeof updateReflinkRequest>
