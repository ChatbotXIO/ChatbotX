import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const whatsappFlowRelations = defineRelationsPart(schema, (r) => ({
  whatsappFlowModel: {
    integrationWhatsapp: r.one.integrationWhatsappModel({
      from: r.whatsappFlowModel.integrationWhatsappId,
      to: r.integrationWhatsappModel.id,
    }),
  },
}))
