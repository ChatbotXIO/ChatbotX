import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const REF_LINK_NAME_REGEX = /^[a-zA-Z0-9]+$/

export const createReflinkRequest = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .refine((value) => REF_LINK_NAME_REGEX.test(value))
    .describe("Ref link name, alphanumeric only."),
  flowId: zodBigintAsString().describe(
    "Flow to trigger when the ref link is opened. Get it from `flows.list`.",
  ),
  customFieldId: z
    .union([z.literal("").transform(() => null), zodBigintAsString()])
    .nullable()
    .describe(
      "Custom field to stamp a click identifier into, or null for none.",
    ),
})
export type CreateReflinkRequest = z.infer<typeof createReflinkRequest>

export const updateReflinkRequest = createReflinkRequest.partial()
export type UpdateReflinkRequest = z.infer<typeof updateReflinkRequest>
