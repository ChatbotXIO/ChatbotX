import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const integrationWhatsappRelations = defineRelationsPart(
  schema,
  (r) => ({
    integrationWhatsappModel: {
      workspace: r.one.workspaceModel({
        from: r.integrationWhatsappModel.workspaceId,
        to: r.workspaceModel.id,
        optional: false,
      }),
      inbox: r.one.inboxModel({
        from: r.integrationWhatsappModel.inboxId,
        to: r.inboxModel.id,
        optional: false,
      }),
      whatsappFlows: r.many.whatsappFlowModel({
        from: r.integrationWhatsappModel.id,
        to: r.whatsappFlowModel.integrationWhatsappId,
      }),
      whatsappMessageTemplates: r.many.whatsappMessageTemplateModel({
        from: r.integrationWhatsappModel.id,
        to: r.whatsappMessageTemplateModel.integrationWhatsappId,
      }),
    },
  }),
)
