import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const templateVersionRelations = defineRelationsPart(schema, (r) => ({
  templateVersionModel: {
    template: r.one.templateModel({
      from: r.templateVersionModel.templateId,
      to: r.templateModel.id,
    }),
  },
  templateInstallationSyncModel: {
    installation: r.one.templateInstallationModel({
      from: r.templateInstallationSyncModel.installationId,
      to: r.templateInstallationModel.id,
    }),
  },
  templateResourceBackupModel: {
    sync: r.one.templateInstallationSyncModel({
      from: r.templateResourceBackupModel.syncId,
      to: r.templateInstallationSyncModel.id,
    }),
    installedResource: r.one.templateInstalledResourceModel({
      from: r.templateResourceBackupModel.installedResourceId,
      to: r.templateInstalledResourceModel.id,
    }),
  },
}))
