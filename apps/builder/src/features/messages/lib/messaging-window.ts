import type { ChannelType } from "@chatbotx.io/database/partials"

export const MESSENGER_HUMAN_AGENT_WINDOW_SECONDS = 7 * 24 * 60 * 60
const STANDARD_WINDOW_SECONDS = 24 * 60 * 60

const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 60 * 60

export type WindowPhaseKind = "standard" | "humanAgent"

/** Which conversations a channel's window policy covers. */
export type WindowAppliesTo = "all" | "directOnly"

export type SendWindowPhase = {
  kind: WindowPhaseKind
  /** Length of the window, in seconds after the contact's last message. */
  seconds: number
  /**
   * True when sending is blocked once this phase has ended. A phase that does
   * not block hands over to the next phase.
   */
  blocksSendAfter: boolean
}

export type ChannelWindowPolicy = {
  appliesTo: WindowAppliesTo
  /** Ordered by ascending `seconds`; the last phase must block. */
  phases: readonly SendWindowPhase[]
}

/**
 * Send-window policy per channel. A channel absent from the table has no
 * window. `directOnly` leaves comment conversations (those with a sourceId)
 * ungated. The composer's send gate and the contact panel's "Messaging
 * window" row both resolve through this table, so they cannot disagree.
 */
export const CHANNEL_WINDOW_POLICY: Partial<
  Record<ChannelType, ChannelWindowPolicy>
> = {
  whatsapp: {
    appliesTo: "all",
    phases: [
      {
        kind: "standard",
        seconds: STANDARD_WINDOW_SECONDS,
        blocksSendAfter: true,
      },
    ],
  },
  tiktok: {
    appliesTo: "all",
    phases: [
      {
        kind: "standard",
        seconds: STANDARD_WINDOW_SECONDS,
        blocksSendAfter: true,
      },
    ],
  },
  messenger: {
    appliesTo: "directOnly",
    phases: [
      {
        kind: "standard",
        seconds: STANDARD_WINDOW_SECONDS,
        blocksSendAfter: false,
      },
      {
        kind: "humanAgent",
        seconds: MESSENGER_HUMAN_AGENT_WINDOW_SECONDS,
        blocksSendAfter: true,
      },
    ],
  },
  instagram: {
    appliesTo: "directOnly",
    phases: [
      {
        kind: "standard",
        seconds: STANDARD_WINDOW_SECONDS,
        blocksSendAfter: false,
      },
      {
        kind: "humanAgent",
        seconds: MESSENGER_HUMAN_AGENT_WINDOW_SECONDS,
        blocksSendAfter: true,
      },
    ],
  },
}

const policyByChannel: Readonly<
  Record<string, ChannelWindowPolicy | undefined>
> = CHANNEL_WINDOW_POLICY

export type SendWindowNotApplicable = { kind: "notApplicable" }
export type SendWindowUnknown = { kind: "unknown" }
export type SendWindowOpen = {
  kind: "open"
  phase: WindowPhaseKind
  remainingMs: number
}
export type SendWindowClosed = { kind: "closed"; reason: WindowPhaseKind }

export type SendWindowState =
  | SendWindowNotApplicable
  | SendWindowUnknown
  | SendWindowOpen
  | SendWindowClosed

const resolvePolicy = (
  channel: string | null | undefined,
  isDirect: boolean,
): ChannelWindowPolicy | null => {
  const policy = channel ? policyByChannel[channel] : undefined
  if (!policy || (policy.appliesTo === "directOnly" && !isDirect)) {
    return null
  }
  return policy
}

/** True when the channel's policy includes a human-agent phase. */
export const hasHumanAgentPhase = (
  channel: string | null | undefined,
): boolean =>
  Boolean(
    channel &&
      policyByChannel[channel]?.phases.some(
        (phase) => phase.kind === "humanAgent",
      ),
  )

/**
 * Parses a last-incoming timestamp into epoch milliseconds. Returns null when
 * the value is absent or not a valid date (NaN guard).
 */
export const parseLastIncomingTs = (
  raw: Date | string | number | null | undefined,
): number | null => {
  if (!raw) {
    return null
  }
  const ts = new Date(raw).getTime()
  return Number.isFinite(ts) ? ts : null
}

/**
 * Resolves the send-window state. A phase is over once strictly more than its
 * length has passed (still open at the exact boundary). `closed` is exactly
 * the state in which the composer blocks sending.
 */
export const resolveSendWindow = ({
  channel,
  isDirect,
  lastIncomingTs,
  now,
}: {
  channel: string | null | undefined
  isDirect: boolean
  lastIncomingTs: number | null
  now: number
}): SendWindowState => {
  const policy = resolvePolicy(channel, isDirect)
  if (!policy) {
    return { kind: "notApplicable" }
  }
  if (!lastIncomingTs) {
    return { kind: "unknown" }
  }
  const elapsed = now - lastIncomingTs
  for (const phase of policy.phases) {
    const lengthMs = phase.seconds * MS_PER_SECOND
    if (elapsed <= lengthMs) {
      return {
        kind: "open",
        phase: phase.kind,
        remainingMs: lengthMs - elapsed,
      }
    }
    if (phase.blocksSendAfter) {
      return { kind: "closed", reason: phase.kind }
    }
  }
  const lastPhase = policy.phases.at(-1)
  return { kind: "closed", reason: lastPhase?.kind ?? "standard" }
}

/**
 * Nearest future phase end (epoch ms) at which the state can change, or null
 * when none is ahead.
 */
export const nextWindowBoundary = ({
  channel,
  isDirect,
  lastIncomingTs,
  now,
}: {
  channel: string | null | undefined
  isDirect: boolean
  lastIncomingTs: number | null
  now: number
}): number | null => {
  const policy = resolvePolicy(channel, isDirect)
  if (!(policy && lastIncomingTs)) {
    return null
  }
  const upcoming = policy.phases
    .map((phase) => lastIncomingTs + phase.seconds * MS_PER_SECOND)
    .filter((deadline) => deadline > now)
  return upcoming.length > 0 ? Math.min(...upcoming) : null
}

const pad2 = (value: number): string => String(value).padStart(2, "0")

/** Formats a remaining duration as hh:mm:ss (hours may exceed 24). */
export const formatCountdown = (remainingMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / MS_PER_SECOND))
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR)
  const minutes = Math.floor(
    (totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE,
  )
  const seconds = totalSeconds % SECONDS_PER_MINUTE
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
}
