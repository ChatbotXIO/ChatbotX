import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const socialPostRecurrenceRelations = defineRelationsPart(
  schema,
  (r) => ({
    socialPostRecurrenceModel: {
      socialPost: r.one.socialPostModel({
        from: r.socialPostRecurrenceModel.socialPostId,
        to: r.socialPostModel.id,
        optional: false,
      }),
      ledger: r.many.socialPostRecurrenceOccurrenceModel({
        from: r.socialPostRecurrenceModel.id,
        to: r.socialPostRecurrenceOccurrenceModel.recurrenceId,
      }),
    },
    socialPostRecurrenceOccurrenceModel: {
      recurrence: r.one.socialPostRecurrenceModel({
        from: r.socialPostRecurrenceOccurrenceModel.recurrenceId,
        to: r.socialPostRecurrenceModel.id,
        optional: false,
      }),
      socialPost: r.one.socialPostModel({
        from: r.socialPostRecurrenceOccurrenceModel.socialPostId,
        to: r.socialPostModel.id,
      }),
    },
  }),
)
