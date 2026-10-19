import { parseBigIntId } from "@chatbotx.io/utils"
import { type AnyColumn, type SQL, sql } from "drizzle-orm"
import {
  ASSIGNED_AGENT_WORKING_HOURS_VALUE,
  operatorTypes,
} from "../../partials"
import {
  conversationModel,
  workingHoursDateOverrideModel,
  workingHoursIntervalModel,
  workingHoursMemberModel,
  workingHoursModel,
} from "../../schema"
import type { ContactWhere, RawTable } from "./types"

const dateOverride = workingHoursDateOverrideModel

/**
 * Whether the schedule `workingHoursId` (an SQL expression) is open right now
 * in `timezone`. Precedence mirrors the duration helpers: that schedule's date
 * override for today's local date, else the workspace holiday for it, else the
 * weekly intervals (weekday + minute-of-day, end-exclusive).
 */
const scheduleOpenNowSql = (
  workingHoursId: SQL | AnyColumn,
  workspaceId: string,
  timezone: string,
): SQL => {
  const localNow = sql`(now() AT TIME ZONE ${timezone})`
  const today = sql`(${localNow})::date`
  const minuteOfDay = sql`(EXTRACT(HOUR FROM ${localNow})::int * 60 + EXTRACT(MINUTE FROM ${localNow})::int)`
  const overrideOn = (scope: SQL) =>
    sql`${dateOverride.workspaceId} = ${workspaceId} AND ${dateOverride.date} = ${today} AND ${scope}`
  const ownScope = sql`${dateOverride.workingHoursId} = ${workingHoursId}`
  const holidayScope = sql`${dateOverride.workingHoursId} IS NULL`
  const overrideExists = (scope: SQL) =>
    sql`EXISTS (SELECT 1 FROM ${dateOverride} WHERE ${overrideOn(scope)})`
  const overrideOpen = (scope: SQL) =>
    sql`EXISTS (SELECT 1 FROM ${dateOverride} CROSS JOIN LATERAL jsonb_array_elements(${dateOverride.ranges}) AS date_range(value) WHERE ${overrideOn(scope)} AND (date_range.value->>'startMinute')::int <= ${minuteOfDay} AND ${minuteOfDay} < (date_range.value->>'endMinute')::int)`
  const weeklyOpen = sql`EXISTS (SELECT 1 FROM ${workingHoursIntervalModel} WHERE ${workingHoursIntervalModel.workingHoursId} = ${workingHoursId} AND ${workingHoursIntervalModel.weekday} = EXTRACT(DOW FROM ${localNow})::int AND ${workingHoursIntervalModel.startMinute} <= ${minuteOfDay} AND ${minuteOfDay} < ${workingHoursIntervalModel.endMinute})`
  return sql`(CASE WHEN ${overrideExists(ownScope)} THEN ${overrideOpen(ownScope)} WHEN ${overrideExists(holidayScope)} THEN ${overrideOpen(holidayScope)} ELSE ${weeklyOpen} END)`
}

/** Any of the given schedules is open now. Not correlated to the contact. */
const scheduleOpenSql = (
  workspaceId: string,
  timezone: string,
  scheduleIds: string[],
): SQL =>
  sql`EXISTS (SELECT 1 FROM ${workingHoursModel} WHERE ${workingHoursModel.workspaceId} = ${workspaceId} AND ${workingHoursModel.id} IN (${sql.join(
    scheduleIds.map((id) => sql`${id}`),
    sql`, `,
  )}) AND ${scheduleOpenNowSql(workingHoursModel.id, workspaceId, timezone)})`

/**
 * The contact's DM conversation is assigned to an agent who is on shift. An
 * agent without a schedule counts as on shift (same rule as routing); an
 * unassigned conversation is never on shift.
 */
const assignedAgentOnShiftSql = (
  workspaceId: string,
  timezone: string,
  contactId: RawTable[string],
): SQL =>
  sql`EXISTS (SELECT 1 FROM ${conversationModel} WHERE ${conversationModel.contactId} = ${contactId} AND ${conversationModel.workspaceId} = ${workspaceId} AND ${conversationModel.sourceId} IS NULL AND ${conversationModel.assignedUserId} IS NOT NULL AND (NOT EXISTS (SELECT 1 FROM ${workingHoursMemberModel} WHERE ${workingHoursMemberModel.workspaceId} = ${workspaceId} AND ${workingHoursMemberModel.userId} = ${conversationModel.assignedUserId}) OR EXISTS (SELECT 1 FROM ${workingHoursMemberModel} WHERE ${workingHoursMemberModel.workspaceId} = ${workspaceId} AND ${workingHoursMemberModel.userId} = ${conversationModel.assignedUserId} AND ${scheduleOpenNowSql(workingHoursMemberModel.workingHoursId, workspaceId, timezone)})))`

/**
 * `isWithinWorkingHours` — matches while any selected schedule is open now, or
 * (`assignedAgent`) while the contact's assigned agent is on shift. `notIn`
 * negates the whole selection. Evaluated against `now()` in the workspace
 * timezone, so the result is only meaningful for runtime checks (the flow
 * Condition step). Without a workspace scope, or without a usable selection,
 * the condition no-ops (`{}`) rather than matching or rejecting every contact.
 */
export function buildIsWithinWorkingHoursWhere(condition: {
  operator: string
  value?: unknown
  workspaceId?: string
  /** Workspace timezone (already validated by the caller). */
  timezone: string
}): ContactWhere {
  const { operator, value, workspaceId, timezone } = condition
  const negate = operator === operatorTypes.enum.notIn
  if (!workspaceId || (operator !== operatorTypes.enum.in && !negate)) {
    return {}
  }
  const selections = (Array.isArray(value) ? value : [value]).filter(
    (item): item is string => typeof item === "string",
  )
  const scheduleIds = selections.flatMap((item) => {
    const id = parseBigIntId(item)
    return id ? [id] : []
  })
  const includesAssignedAgent = selections.includes(
    ASSIGNED_AGENT_WORKING_HOURS_VALUE,
  )
  if (scheduleIds.length === 0 && !includesAssignedAgent) {
    return {}
  }

  return {
    RAW: (table: RawTable): SQL => {
      const branches: SQL[] = []
      if (scheduleIds.length > 0) {
        branches.push(scheduleOpenSql(workspaceId, timezone, scheduleIds))
      }
      if (includesAssignedAgent) {
        branches.push(assignedAgentOnShiftSql(workspaceId, timezone, table.id))
      }
      const anyBranch = sql`(${sql.join(branches, sql` OR `)})`
      return negate ? sql`NOT ${anyBranch}` : anyBranch
    },
  }
}
