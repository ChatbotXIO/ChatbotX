import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const templateRelations = defineRelationsPart(schema, (r) => ({
  templateModel: {
    workspace: r.one.workspaceModel({
      from: r.templateModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    tenant: r.one.tenantModel({
      from: r.templateModel.tenantId,
      to: r.tenantModel.id,
    }),
    createdByUser: r.one.userModel({
      from: r.templateModel.createdBy,
      to: r.userModel.id,
    }),
    installations: r.many.templateInstallationModel({
      from: r.templateModel.id,
      to: r.templateInstallationModel.templateId,
    }),
  },
}))
