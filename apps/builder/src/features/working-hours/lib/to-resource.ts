import type { WorkingHoursWithRelations } from "@chatbotx.io/database/repositories"
import type { WorkingHoursResource } from "../schema/resource"
import { sortIntervals } from "./schedule-state"

/** The single shape every working-hours read and mutation returns. */
export function toWorkingHoursResource(
  row: WorkingHoursWithRelations,
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
