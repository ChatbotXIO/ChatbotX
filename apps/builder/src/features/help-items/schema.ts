import { z } from "zod"

export const helpItemSchema = z.object({
  name: z.string().trim().min(1),
  url: z.url({ protocol: /^(https?|mailto)$/ }),
  icon: z.preprocess(
    (val) => (val === "" ? null : val),
    z.string().trim().nullable().default(null),
  ),
  position: z.coerce.number().int().min(0).default(0),
})

export const helpItemIdSchema = z.object({
  id: z.string().min(1),
})
