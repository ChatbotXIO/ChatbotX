import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const templateInstalledResourceRelations = defineRelationsPart(
  schema,
  (r) => ({
    templateInstalledResourceModel: {
      installation: r.one.templateInstallationModel({
        from: r.templateInstalledResourceModel.installationId,
        to: r.templateInstallationModel.id,
      }),
      workspace: r.one.workspaceModel({
        from: r.templateInstalledResourceModel.workspaceId,
        to: r.workspaceModel.id,
      }),
    },
  }),
)
