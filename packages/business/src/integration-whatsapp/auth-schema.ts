import { z } from "zod"

/**
 * Shared between `service.ts`, `connect.ts`, and `coexist.ts` — pulled out on
 * its own so `coexist.ts`'s `setCoexist()` can validate `auth` without
 * importing `service.ts` (which imports `coexist.ts`'s `setCoexist` back,
 * creating a cycle).
 */

export const WHATSAPP_CAPI_SCOPE = "whatsapp_business_manage_events"
export const WHATSAPP_CAPI_SCOPE_CACHE_TTL_MS = 24 * 60 * 60 * 1000

export const whatsappAuthForCapiScopeSchema = z.object({
  version: z.string().trim().min(1).optional(),
  tokens: z.object({
    accessToken: z.string().trim().min(1),
  }),
  metadata: z.object({
    wabaId: z.string().trim().min(1),
  }),
})
