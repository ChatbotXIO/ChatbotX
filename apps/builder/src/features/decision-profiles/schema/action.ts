import { z } from "zod"

export const decisionProfileActionSchema = z
  .object({
    connectionId: z.string().regex(/^\d+$/),
    contract: z.unknown(),
    description: z.string().trim().max(2000).nullable().optional(),
    model: z.string().trim().min(1).max(256),
    name: z.string().trim().min(1).max(160),
  })
  .strict()

export const decisionProfileToggleSchema = z
  .object({
    enabled: z.boolean(),
    id: z.string().regex(/^\d+$/),
  })
  .strict()
