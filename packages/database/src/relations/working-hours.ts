import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const workingHoursRelations = defineRelationsPart(schema, (r) => ({
  workingHoursModel: {
    workspace: r.one.workspaceModel({
      from: r.workingHoursModel.workspaceId,
      to: r.workspaceModel.id,
    }),
    intervals: r.many.workingHoursIntervalModel({
      from: r.workingHoursModel.id,
      to: r.workingHoursIntervalModel.workingHoursId,
    }),
    members: r.many.workingHoursMemberModel({
      from: r.workingHoursModel.id,
      to: r.workingHoursMemberModel.workingHoursId,
    }),
    dateOverrides: r.many.workingHoursDateOverrideModel({
      from: r.workingHoursModel.id,
      to: r.workingHoursDateOverrideModel.workingHoursId,
    }),
  },
  workingHoursDateOverrideModel: {
    workingHours: r.one.workingHoursModel({
      from: r.workingHoursDateOverrideModel.workingHoursId,
      to: r.workingHoursModel.id,
    }),
  },
  responseSlaPolicyModel: {
    workspace: r.one.workspaceModel({
      from: r.responseSlaPolicyModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
  },
  workingHoursIntervalModel: {
    workingHours: r.one.workingHoursModel({
      from: r.workingHoursIntervalModel.workingHoursId,
      to: r.workingHoursModel.id,
      optional: false,
    }),
  },
  workingHoursMemberModel: {
    workingHours: r.one.workingHoursModel({
      from: r.workingHoursMemberModel.workingHoursId,
      to: r.workingHoursModel.id,
      optional: false,
    }),
    user: r.one.userModel({
      from: r.workingHoursMemberModel.userId,
      to: r.userModel.id,
      optional: false,
    }),
  },
}))
