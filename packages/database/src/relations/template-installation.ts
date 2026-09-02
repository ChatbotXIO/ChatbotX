import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const templateInstallationRelations = defineRelationsPart(
  schema,
  (r) => ({
    templateInstallationModel: {
      workspace: r.one.workspaceModel({
        from: r.templateInstallationModel.workspaceId,
        to: r.workspaceModel.id,
      }),
      template: r.one.templateModel({
        from: r.templateInstallationModel.templateId,
        to: r.templateModel.id,
      }),
      installFolder: r.one.folderModel({
        from: r.templateInstallationModel.installFolderId,
        to: r.folderModel.id,
      }),
      installedByUser: r.one.userModel({
        from: r.templateInstallationModel.installedBy,
        to: r.userModel.id,
      }),
      installedResources: r.many.templateInstalledResourceModel({
        from: r.templateInstallationModel.id,
        to: r.templateInstalledResourceModel.installationId,
      }),
    },
  }),
)
