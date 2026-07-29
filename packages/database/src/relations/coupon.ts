import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const couponRelations = defineRelationsPart(schema, (r) => ({
  couponTopicModel: {
    workspace: r.one.workspaceModel({
      from: r.couponTopicModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    createdBy: r.one.userModel({
      from: r.couponTopicModel.createdById,
      to: r.userModel.id,
    }),
    coupons: r.many.couponModel({
      from: r.couponTopicModel.id,
      to: r.couponModel.topicId,
    }),
  },
  couponModel: {
    workspace: r.one.workspaceModel({
      from: r.couponModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    topic: r.one.couponTopicModel({
      from: r.couponModel.topicId,
      to: r.couponTopicModel.id,
      optional: false,
    }),
    issuedContact: r.one.contactModel({
      from: r.couponModel.issuedContactId,
      to: r.contactModel.id,
    }),
  },
}))
