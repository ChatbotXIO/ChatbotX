import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const templateUninstallOperationRelations = defineRelationsPart(
  schema,
  (r) => ({
    templateUninstallOperationModel: {
      workspace: r.one.workspaceModel({
        from: r.templateUninstallOperationModel.workspaceId,
        to: r.workspaceModel.id,
      }),
      template: r.one.templateModel({
        from: r.templateUninstallOperationModel.templateId,
        to: r.templateModel.id,
      }),
      installations: r.many.templateInstallationModel({
        from: r.templateUninstallOperationModel.id,
        to: r.templateInstallationModel.uninstallOperationId,
      }),
    },
  }),
)
