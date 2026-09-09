import { createSelectSchema, triggerModel } from "@chatbotx.io/database/schema"
import { z } from "zod"

// Real shapes instead of `z.any()` so the published OpenAPI spec documents
// an actual condition/action row — loose on `type`/`value` because a
// condition row's `value` shape varies per `type` (see
// `features/conditions/schema` for the full discriminated union used by
// the mutation side) and this is a read-only resource, not a write schema.
const conditionRowResource = z.object({
  id: z.string(),
  type: z.string(),
  sourceId: z.string().nullable(),
  operator: z.string().nullable(),
  value: z.unknown(),
})

export const triggerResource = createSelectSchema(triggerModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
}).extend({
  conditions: z.array(conditionRowResource),
  // The DB column is jsonb with no shape guarantee at the type level
  // (`TriggerModel["actions"]` is `unknown[]`); `allActions`'s discriminated
  // union documents the write-side shape (`components/actions/schema`), but
  // reusing it here as a read-side assertion would break every private
  // caller returning a raw DB row whose `actions` type is `unknown[]`.
  actions: z.array(z.unknown()),
})
export type TriggerResource = z.infer<typeof triggerResource>
