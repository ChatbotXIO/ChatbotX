import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const organizationCredentialRelations = defineRelationsPart(
  schema,
  (r) => ({
    organizationCredentialModel: {
      organization: r.one.organizationModel({
        from: r.organizationCredentialModel.organizationId,
        to: r.organizationModel.id,
      }),
    },
  }),
)
