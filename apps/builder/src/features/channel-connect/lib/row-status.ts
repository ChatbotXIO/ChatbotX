import type {
  ConnectFailureReason,
  ConnectItemStatus,
  ConnectSessionErrorCode,
  ConnectWarning,
} from "@chatbotx.io/business/inbox/connect-outcome-types"
import type { badgeVariants } from "@chatbotx.io/ui/components/ui/badge"
import type { VariantProps } from "class-variance-authority"
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  Gauge as GaugeIcon,
  Link2OffIcon,
  Loader2Icon,
  type LucideIcon,
  MinusCircleIcon,
  TimerOffIcon,
  TriangleAlertIcon,
  XCircleIcon,
} from "lucide-react"
import type { ConnectOutcome } from "../schema"
import type { MessageKey } from "./message-key"
import { CONNECT_CHANNEL_REGISTRY, type ConnectPickerChannel } from "./registry"

/**
 * Every visual state a connect-many row can be in: the batch hook's
 * `RowState["phase"]` plus the two terminal outcome statuses
 * ("connected"/"connectedWarning") that need their own row look.
 * `duplicated`/`limitReached`/`failed` come straight from
 * `ConnectItemStatus` (`@chatbotx.io/business`).
 */
export const ROW_VISUAL_STATES = [
  "waiting",
  "connecting",
  "connected",
  "connectedWarning",
  "duplicated",
  "limitReached",
  "failed",
  "timedOut",
  "cancelled",
] as const
export type RowVisualState = (typeof ROW_VISUAL_STATES)[number]

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>

type RowStatusConfig = {
  labelKey: MessageKey
  badgeVariant: BadgeVariant
  /** Extra classes on the Badge — `badgeVariants` only exposes 4 variants, so colour semantics (emerald/amber) come from explicit classes. */
  badgeClassName: string
  Icon: LucideIcon
  iconClassName: string
  /** Row shows a per-row Retry action. */
  retryable: boolean
}

/**
 * Table-driven row look, `satisfies Record<RowVisualState, …>` so a new
 * status added to `ConnectItemStatus` or the batch hook's `RowState` fails
 * to compile here until it gets a row. See plan §2.7 for the full table this
 * mirrors (badge variant/classes, icon, inline action per row).
 */
export const ROW_STATUS = {
  waiting: {
    labelKey: "channels.connectMany.status.waiting",
    badgeVariant: "outline",
    badgeClassName: "text-muted-foreground",
    Icon: CircleDashedIcon,
    iconClassName: "",
    retryable: false,
  },
  connecting: {
    labelKey: "channels.connectMany.status.connecting",
    badgeVariant: "secondary",
    badgeClassName: "",
    Icon: Loader2Icon,
    iconClassName: "motion-safe:animate-spin",
    retryable: false,
  },
  connected: {
    labelKey: "channels.connectMany.status.connected",
    badgeVariant: "outline",
    badgeClassName: "border-emerald-500/40 text-emerald-600",
    Icon: CheckCircle2Icon,
    iconClassName: "",
    retryable: false,
  },
  connectedWarning: {
    labelKey: "channels.connectMany.status.connected",
    badgeVariant: "outline",
    badgeClassName: "border-emerald-500/40 text-emerald-600",
    Icon: TriangleAlertIcon,
    iconClassName: "text-amber-600",
    retryable: false,
  },
  duplicated: {
    labelKey: "channels.connectMany.status.duplicated",
    badgeVariant: "outline",
    badgeClassName: "border-amber-500/40 text-amber-600",
    Icon: Link2OffIcon,
    iconClassName: "",
    retryable: false,
  },
  limitReached: {
    labelKey: "channels.connectMany.status.limitReached",
    badgeVariant: "outline",
    badgeClassName: "border-amber-500/40 text-amber-600",
    Icon: GaugeIcon,
    iconClassName: "",
    retryable: false,
  },
  failed: {
    labelKey: "channels.connectMany.status.failed",
    badgeVariant: "destructive",
    badgeClassName: "",
    Icon: XCircleIcon,
    iconClassName: "",
    retryable: true,
  },
  timedOut: {
    labelKey: "channels.connectMany.status.timedOut",
    badgeVariant: "destructive",
    badgeClassName: "",
    Icon: TimerOffIcon,
    iconClassName: "",
    retryable: true,
  },
  cancelled: {
    labelKey: "channels.connectMany.status.cancelled",
    badgeVariant: "outline",
    badgeClassName: "",
    Icon: MinusCircleIcon,
    iconClassName: "",
    retryable: true,
  },
} as const satisfies Record<RowVisualState, RowStatusConfig>

/** The coexist call's own row states — the sub-line under a connected row's badge. */
const COEXIST_ROW_STATES = ["running", "done", "failed", "skipped"] as const
export type CoexistRowVisualState = (typeof COEXIST_ROW_STATES)[number]

type CoexistRowStatusConfig = {
  labelKey: MessageKey
  Icon: LucideIcon
  iconClassName: string
  /** Sub-line tone, same two tones `RowNote` uses. */
  tone: RowNote["tone"]
  /** Row offers a Retry action that re-runs only the coexist call. */
  retryable: boolean
}

/**
 * Table-driven coexist sub-line, `satisfies Record<CoexistRowVisualState, …>`
 * so a new coexist status fails to compile here until it gets a row. The
 * connect badge above it is unaffected — a row whose coexist call failed is
 * still connected.
 */
export const COEXIST_ROW_STATUS = {
  running: {
    labelKey: "channels.connectMany.coexist.running",
    Icon: Loader2Icon,
    iconClassName: "motion-safe:animate-spin",
    tone: "muted",
    retryable: false,
  },
  done: {
    labelKey: "channels.connectMany.coexist.done",
    Icon: CheckCircle2Icon,
    iconClassName: "text-emerald-600",
    tone: "muted",
    retryable: false,
  },
  failed: {
    labelKey: "channels.connectMany.coexist.failed",
    Icon: TriangleAlertIcon,
    iconClassName: "text-amber-600",
    tone: "warning",
    retryable: true,
  },
  /**
   * The operator asked for the sync, but the provider does not offer it for
   * this account (`coexistEligible: false`). Nothing failed and nothing can
   * be retried — the row simply says why it did not happen, using the same
   * copy the popup shows for the same reason.
   */
  skipped: {
    labelKey: "coexist.errors.notEligible",
    Icon: MinusCircleIcon,
    iconClassName: "text-muted-foreground",
    tone: "muted",
    retryable: false,
  },
} as const satisfies Record<CoexistRowVisualState, CoexistRowStatusConfig>

/** Both tables decide the Retry action together: a retryable connect state, or a failed coexist call on an otherwise connected row. */
export function isRowRetryable(
  state: RowVisualState,
  coexist?: { status: CoexistRowVisualState },
): boolean {
  return (
    ROW_STATUS[state].retryable ||
    (coexist ? COEXIST_ROW_STATUS[coexist.status].retryable : false)
  )
}

/** Reason text shown next to `failed` rows. `alreadyConnected` has none of its own — the `duplicated` badge label already says it. */
export const REASON_MESSAGE_KEYS: Partial<
  Record<ConnectFailureReason, MessageKey>
> = {
  notSelectable: "channels.connectMany.reason.notSelectable",
  channelLimit: "channels.connectMany.reason.channelLimit",
  workspaceLimit: "channels.connectMany.reason.workspaceLimit",
  providerRejected: "channels.connectMany.reason.providerRejected",
  unknown: "channels.connectMany.reason.unknown",
}

/**
 * The toast/note copy for a single connect outcome that did not end in
 * `"connected"` — reused by `useConnectFlow` (single-item path) and
 * `WhatsappCreate`'s direct-submit branch so both surfaces pick the same key
 * for the same outcome instead of drifting. `duplicated` reads the
 * channel-specific `duplicatedKey`; every other status reads `reason` off
 * `REASON_MESSAGE_KEYS`, falling back to the generic "unknown" copy.
 */
export function connectFailureMessageKey(
  channel: ConnectPickerChannel,
  outcome: { status: ConnectItemStatus; reason?: ConnectFailureReason },
): MessageKey {
  if (outcome.status === "duplicated") {
    return CONNECT_CHANNEL_REGISTRY[channel].duplicatedKey
  }
  return (
    REASON_MESSAGE_KEYS[outcome.reason ?? "unknown"] ??
    "channels.connectMany.reason.unknown"
  )
}

/** Amber note under a `connected` row carrying a warning (e.g. follow-up failed). */
export const WARNING_MESSAGE_KEYS: Record<ConnectWarning, MessageKey> = {
  followUpFailed: "channels.connectMany.reason.followUpFailed",
}

export type RowNote = {
  key: MessageKey
  tone: "warning" | "muted"
  /** The provider's own sentence, shown under the translated reason — never in place of it. */
  detail?: string
}

/**
 * The note shown under a connect-many row's badge: a warning takes priority
 * over a failure reason. `alreadyConnected` has no entry in
 * `REASON_MESSAGE_KEYS` (the `duplicated` badge label already says it), so it
 * renders no note — same as today. A failure that carried the provider's own
 * sentence passes it through as `detail`: the translated reason stays the
 * headline, the provider's words go underneath it.
 */
export function rowNote(
  outcome: ConnectOutcome | undefined,
): RowNote | undefined {
  if (!outcome) {
    return
  }
  if (outcome.warning) {
    return { key: WARNING_MESSAGE_KEYS[outcome.warning], tone: "warning" }
  }
  if (outcome.reason) {
    const key = REASON_MESSAGE_KEYS[outcome.reason]
    return key ? { key, tone: "muted", detail: outcome.detail } : undefined
  }
  return
}

/** Narrows a connected, coexist-eligible outcome to one that actually carries an `integrationId` — the shape a coexist call needs. */
export function isCoexistTarget(
  outcome: ConnectOutcome,
): outcome is ConnectOutcome & { status: "connected"; integrationId: string } {
  return (
    outcome.status === "connected" &&
    outcome.coexistEligible &&
    outcome.integrationId !== undefined
  )
}

/** Alert copy above the row list when the batch stops on a session-level error. */
export const SESSION_ERROR_MESSAGE_KEYS: Record<
  ConnectSessionErrorCode,
  MessageKey
> = {
  sessionExpired: "channels.connectMany.sessionError.sessionExpired",
  notMember: "channels.connectMany.sessionError.notMember",
  trialExpired: "channels.connectMany.sessionError.trialExpired",
  macLimitReached: "channels.connectMany.sessionError.macLimitReached",
  credentialMissing: "channels.connectMany.sessionError.credentialMissing",
}

/**
 * Session errors that make every post-connect step unreachable: those steps
 * (WhatsApp verification / manual result, and any future channel extra) call
 * workspace-authorized routes, which `workspaceAuthorizedMidddleware` would
 * deny for exactly these cases — so Continue finishes straight away rather
 * than opening a step that can only fail, and its label says so. Only
 * `sessionExpired` and `credentialMissing` (not membership/plan-gated) may
 * still lead into one.
 */
export const SESSION_ERRORS_SKIPPING_EXTRA_STEPS: readonly ConnectSessionErrorCode[] =
  ["notMember", "trialExpired", "macLimitReached"]
