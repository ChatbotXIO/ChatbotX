/**
 * Start of the measured response window (plan D7, option C).
 *
 * The window starts at the customer message (`closedAwaitingSince`), unless
 * the conversation was assigned to the replying agent after that message, in
 * which case it starts at the assignment instant.
 */
export function resolveMeasuredFrom(props: {
  closedAwaitingSince: Date
  assignedUserId: string | null | undefined
  assignedUserAt: Date | null | undefined
  adminId: string
}): Date {
  const { closedAwaitingSince, assignedUserId, assignedUserAt, adminId } = props
  if (
    assignedUserId === adminId &&
    assignedUserAt &&
    assignedUserAt.getTime() > closedAwaitingSince.getTime()
  ) {
    return assignedUserAt
  }
  return closedAwaitingSince
}
