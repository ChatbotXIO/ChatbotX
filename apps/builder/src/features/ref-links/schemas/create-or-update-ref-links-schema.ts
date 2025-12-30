import { z } from "zod"

const REF_LINK_NAME_REGEX = /^[a-zA-Z0-9]+$/

export const createOrUpdateRefLinkRequest = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .refine((value) => REF_LINK_NAME_REGEX.test(value)),
  flowId: z.cuid2(),
  fieldId: z.cuid2().nullable(),
})
export type CreateOrUpdateRefLinkRequest = z.infer<
  typeof createOrUpdateRefLinkRequest
>
