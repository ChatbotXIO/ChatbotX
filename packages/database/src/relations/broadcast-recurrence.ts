import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const broadcastRecurrenceRelations = defineRelationsPart(
  schema,
  (r) => ({
    broadcastRecurrenceModel: {
      broadcast: r.one.broadcastModel({
        from: r.broadcastRecurrenceModel.broadcastId,
        to: r.broadcastModel.id,
        optional: false,
      }),
      ledger: r.many.broadcastRecurrenceOccurrenceModel({
        from: r.broadcastRecurrenceModel.id,
        to: r.broadcastRecurrenceOccurrenceModel.recurrenceId,
      }),
    },
    broadcastRecurrenceOccurrenceModel: {
      recurrence: r.one.broadcastRecurrenceModel({
        from: r.broadcastRecurrenceOccurrenceModel.recurrenceId,
        to: r.broadcastRecurrenceModel.id,
        optional: false,
      }),
      child: r.one.broadcastModel({
        from: r.broadcastRecurrenceOccurrenceModel.childBroadcastId,
        to: r.broadcastModel.id,
      }),
    },
  }),
)
