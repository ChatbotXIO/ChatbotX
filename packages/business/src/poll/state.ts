export type PollState = "notStarted" | "running" | "ended"

/** Running iff `startsAt <= now < endsAt` (`endsAt` is exclusive). */
export function getPollState(
  poll: { startsAt: Date; endsAt: Date },
  now: Date = new Date(),
): PollState {
  const time = now.getTime()
  if (time < poll.startsAt.getTime()) {
    return "notStarted"
  }
  if (time >= poll.endsAt.getTime()) {
    return "ended"
  }
  return "running"
}
