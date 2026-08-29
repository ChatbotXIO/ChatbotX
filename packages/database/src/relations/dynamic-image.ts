import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const dynamicImageRelations = defineRelationsPart(schema, (r) => ({
  dynamicImageModel: {
    workspace: r.one.workspaceModel({
      from: r.dynamicImageModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    customField: r.one.customFieldModel({
      from: r.dynamicImageModel.customFieldId,
      to: r.customFieldModel.id,
    }),
  },
}))
