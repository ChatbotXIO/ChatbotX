import { z } from "zod"

export const integrationPropsSchema = z.object({
  name: z.string().trim().min(1),
})
