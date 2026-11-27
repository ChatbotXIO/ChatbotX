import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../../schema"

export const tenantDefaultTemplateRelations = defineRelationsPart(
  schema,
  (r) => ({
    tenantDefaultTemplateModel: {
      tenant: r.one.tenantModel({
        from: r.tenantDefaultTemplateModel.tenantId,
        to: r.tenantModel.id,
      }),
      template: r.one.templateModel({
        from: r.tenantDefaultTemplateModel.templateId,
        to: r.templateModel.id,
      }),
    },
  }),
)
