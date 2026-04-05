import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const whatsappMessageTemplateRelations = defineRelationsPart(
  schema,
  (r) => ({
    whatsappMessageTemplateModel: {
      integrationWhatsapp: r.one.integrationWhatsappModel({
        from: r.whatsappMessageTemplateModel.integrationWhatsappId,
        to: r.integrationWhatsappModel.id,
      }),
    },
  }),
)
