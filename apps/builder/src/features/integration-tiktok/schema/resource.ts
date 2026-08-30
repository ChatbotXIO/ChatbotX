import { z } from "zod"

export const integrationTiktokResource = z.object({
  id: z.string(),
  name: z.string(),
  openId: z.string(),
})

export type IntegrationTiktokResource = z.infer<
  typeof integrationTiktokResource
>
