import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const miniAppRelations = defineRelationsPart(schema, (r) => ({
  miniAppModel: {
    workspace: r.one.workspaceModel({
      from: r.miniAppModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    publications: r.many.miniAppPublicationModel({
      from: r.miniAppModel.id,
      to: r.miniAppPublicationModel.miniAppId,
    }),
  },
  miniAppPublicationModel: {
    miniApp: r.one.miniAppModel({
      from: r.miniAppPublicationModel.miniAppId,
      to: r.miniAppModel.id,
      optional: false,
    }),
    integrationWhatsapp: r.one.integrationWhatsappModel({
      from: r.miniAppPublicationModel.integrationWhatsappId,
      to: r.integrationWhatsappModel.id,
      optional: false,
    }),
    whatsappFlow: r.one.whatsappFlowModel({
      from: r.miniAppPublicationModel.whatsappFlowId,
      to: r.whatsappFlowModel.id,
    }),
  },
  miniAppUploadModel: {
    miniApp: r.one.miniAppModel({
      from: r.miniAppUploadModel.miniAppId,
      to: r.miniAppModel.id,
      optional: false,
    }),
    submission: r.one.miniAppSubmissionModel({
      from: r.miniAppUploadModel.submissionId,
      to: r.miniAppSubmissionModel.id,
    }),
  },
  miniAppSubmissionModel: {
    miniApp: r.one.miniAppModel({
      from: r.miniAppSubmissionModel.miniAppId,
      to: r.miniAppModel.id,
      optional: false,
    }),
    contact: r.one.contactModel({
      from: r.miniAppSubmissionModel.contactId,
      to: r.contactModel.id,
    }),
  },
}))
