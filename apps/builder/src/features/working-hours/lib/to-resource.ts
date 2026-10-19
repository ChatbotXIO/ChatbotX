import type { WorkingHoursWithRelations } from "@chatbotx.io/database/repositories"
import type { WorkingHoursDateOverrideModel } from "@chatbotx.io/database/types"
import type {
  WorkingHoursDateOverrideResource,
  WorkingHoursHolidayResource,
  WorkingHoursResource,
} from "../schema/resource"
import { sortIntervals } from "./schedule-state"

/** The single shape every working-hours read and mutation returns. */
export function toWorkingHoursResource(
  row: WorkingHoursWithRelations,
  dateOverrides?: readonly WorkingHoursDateOverrideModel[],
): WorkingHoursResource {
  return {
    id: row.id,
    name: row.name,
    intervals: sortIntervals(
      row.intervals.map(({ weekday, startMinute, endMinute }) => ({
        weekday,
        startMinute,
        endMinute,
      })),
    ),
    memberUserIds: row.members.map((member) => member.userId).sort(),
    ...(dateOverrides && { dateOverrides: dateOverrides.map(toDateOverride) }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const toDateOverride = (
  row: WorkingHoursDateOverrideModel,
): WorkingHoursDateOverrideResource => ({
  date: row.date,
  name: row.name,
  ranges: row.ranges,
})

export function toHolidayResource(
  row: WorkingHoursDateOverrideModel,
): WorkingHoursHolidayResource {
  return {
    id: row.id,
    ...toDateOverride(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
