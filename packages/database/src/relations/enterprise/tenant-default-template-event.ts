import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../../schema"

export const tenantDefaultTemplateEventRelations = defineRelationsPart(
  schema,
  (r) => ({
    tenantDefaultTemplateEventModel: {
      tenant: r.one.tenantModel({
        from: r.tenantDefaultTemplateEventModel.tenantId,
        to: r.tenantModel.id,
      }),
      actor: r.one.userModel({
        from: r.tenantDefaultTemplateEventModel.actorUserId,
        to: r.userModel.id,
      }),
    },
  }),
)
