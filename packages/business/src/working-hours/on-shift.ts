import { workspaceService } from "../workspace/service"
import { isWithinWorkingHours } from "./duration"
import { workingHoursService } from "./service"
import { resolveWorkingHoursTimezone } from "./timezone"

/**
 * Which of `userIds` are on shift at `at`. A user with no schedule is always
 * on shift (the feature only restricts agents that opted into a schedule).
 * One cached `listByWorkspace` read plus the cached workspace row, however many
 * candidates are checked. Kept apart from `workingHoursService` so the
 * workspace-member service, which that service is imported by, does not pull
 * the workspace service into its import graph.
 */
export async function listOnShiftUserIds(props: {
  workspaceId: string
  userIds: readonly string[]
  at: Date
}): Promise<Set<string>> {
  const { workspaceId, userIds, at } = props
  const schedules = await workingHoursService.listByWorkspace({ workspaceId })
  const scheduledUserIds = new Set(
    schedules.flatMap((schedule) =>
      schedule.members.map((member) => member.userId),
    ),
  )
  if (!userIds.some((userId) => scheduledUserIds.has(userId))) {
    return new Set(userIds)
  }

  const workspace = await workspaceService.find({ where: { id: workspaceId } })
  const timezone = resolveWorkingHoursTimezone(workspace ?? { id: workspaceId })
  const candidates = new Set(userIds)
  const onShift = new Set(userIds.filter((u) => !scheduledUserIds.has(u)))
  const relevantSchedules = schedules
    .map((schedule) => ({
      schedule,
      members: schedule.members.filter((member) =>
        candidates.has(member.userId),
      ),
    }))
    .filter(({ members }) => members.length > 0)
  const overridesBySchedule =
    await workingHoursService.findDateOverridesForSchedules({
      workspaceId,
      workingHoursIds: relevantSchedules.map(({ schedule }) => schedule.id),
      from: at,
      to: at,
    })
  for (const { schedule, members } of relevantSchedules) {
    const withinHours = isWithinWorkingHours({
      at,
      intervals: schedule.intervals,
      timezone,
      dateOverrides: overridesBySchedule.get(schedule.id),
    })
    if (withinHours) {
      for (const member of members) {
        onShift.add(member.userId)
      }
    }
  }
  return onShift
}

/**
 * Whether `userId` is on shift right now. The check automated assignment paths
 * (flow step, trigger, AI action, rich response, Global Router) make before
 * handing a conversation to a fixed agent; a person assigning by hand in the
 * inbox is never checked.
 */
export async function isUserOnShift(props: {
  workspaceId: string
  userId: string
  at?: Date
}): Promise<boolean> {
  const { workspaceId, userId, at = new Date() } = props
  const onShift = await listOnShiftUserIds({
    workspaceId,
    userIds: [userId],
    at,
  })
  return onShift.has(userId)
}
