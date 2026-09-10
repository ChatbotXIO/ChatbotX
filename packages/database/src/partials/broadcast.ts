import { z } from "zod"
import type { ChannelType } from "./channel"

export const broadcastScheduleTypes = z.enum(["now", "future"])
export type BroadcastScheduleType = z.infer<typeof broadcastScheduleTypes>

export const broadcastStatuses = z.enum([
  "scheduled",
  "sent",
  "sending",
  "cancelled",
  "draft",
  "failed",
])
export type BroadcastStatus = z.infer<typeof broadcastStatuses>

/** Share of targeted contacts that must have failed for the broadcast itself to be `failed`. */
export const BROADCAST_FAILED_RATE_THRESHOLD = 1
/** After hand-off, wait this long for delivery/failure outcomes before resolving the terminal status. */
export const BROADCAST_OUTCOME_GRACE_MS = 10 * 60 * 1000

export type BroadcastTerminalStatus = "sent" | "failed"

export const resolveBroadcastTerminalStatus = (input: {
  contactCount: number | null
  failedCount: number
}): BroadcastTerminalStatus => {
  if (!input.contactCount || input.contactCount <= 0) {
    return "sent"
  }
  return input.failedCount / input.contactCount >=
    BROADCAST_FAILED_RATE_THRESHOLD
    ? "failed"
    : "sent"
}

export const isBroadcastOutcomeGraceElapsed = (input: {
  handoffCompletedAt: Date
  now: Date
}): boolean =>
  input.now.getTime() - input.handoffCompletedAt.getTime() >=
  BROADCAST_OUTCOME_GRACE_MS

export const broadcastSubactions = z.enum([
  "allContacts",
  "messengerActiveContacts",
  "messengerTemplateMessage",
  "whatsappTemplateMessage",
  "whatsappWithin24Hours",
  "instagramActiveContacts",
  "telegramAllContacts",
  "tiktokActiveContacts",
])
export type BroadcastSubaction = z.infer<typeof broadcastSubactions>

type BroadcastAudienceRule = {
  requiresRecentInteractionWindow: boolean
}

export const broadcastSubactionAudienceRules: Record<
  BroadcastSubaction,
  BroadcastAudienceRule
> = {
  allContacts: { requiresRecentInteractionWindow: false },
  messengerActiveContacts: { requiresRecentInteractionWindow: true },
  messengerTemplateMessage: { requiresRecentInteractionWindow: false },
  whatsappTemplateMessage: { requiresRecentInteractionWindow: false },
  whatsappWithin24Hours: { requiresRecentInteractionWindow: true },
  instagramActiveContacts: { requiresRecentInteractionWindow: true },
  telegramAllContacts: { requiresRecentInteractionWindow: false },
  tiktokActiveContacts: { requiresRecentInteractionWindow: true },
}

export const requiresRecentInteractionWindow = (
  subaction: BroadcastSubaction | null | undefined,
): boolean =>
  subaction
    ? broadcastSubactionAudienceRules[subaction].requiresRecentInteractionWindow
    : false

/** The subactions that deliver a template (one template per page in a multi-page broadcast). */
export const templateBroadcastSubactions: readonly BroadcastSubaction[] = [
  "messengerTemplateMessage",
  "whatsappTemplateMessage",
]

export const isTemplateBroadcastSubaction = (
  subaction: BroadcastSubaction | null | undefined,
): boolean =>
  subaction ? templateBroadcastSubactions.includes(subaction) : false

export type BroadcastChannelCapability = {
  channel: ChannelType
  subactions: readonly BroadcastSubaction[]
  defaultSubaction: BroadcastSubaction
  // Only Messenger/WhatsApp expose a template-message broadcast; other channels
  // are flow-only. Keeping this on the registry is the single source of truth.
  supportsTemplateBroadcast: boolean
}

export const broadcastChannelCapabilities: readonly BroadcastChannelCapability[] =
  [
    {
      channel: "omnichannel",
      subactions: ["allContacts"],
      defaultSubaction: "allContacts",
      supportsTemplateBroadcast: false,
    },
    {
      channel: "messenger",
      subactions: ["messengerTemplateMessage", "messengerActiveContacts"],
      defaultSubaction: "messengerTemplateMessage",
      supportsTemplateBroadcast: true,
    },
    {
      channel: "whatsapp",
      subactions: ["whatsappTemplateMessage", "whatsappWithin24Hours"],
      defaultSubaction: "whatsappTemplateMessage",
      supportsTemplateBroadcast: true,
    },
    {
      channel: "zalo",
      subactions: ["allContacts"],
      defaultSubaction: "allContacts",
      supportsTemplateBroadcast: false,
    },
    {
      channel: "instagram",
      subactions: ["instagramActiveContacts"],
      defaultSubaction: "instagramActiveContacts",
      supportsTemplateBroadcast: false,
    },
    {
      channel: "telegram",
      subactions: ["telegramAllContacts"],
      defaultSubaction: "telegramAllContacts",
      supportsTemplateBroadcast: false,
    },
    {
      channel: "tiktok",
      subactions: ["tiktokActiveContacts"],
      defaultSubaction: "tiktokActiveContacts",
      supportsTemplateBroadcast: false,
    },
  ]

export const findBroadcastChannelCapability = (
  channel: ChannelType,
): BroadcastChannelCapability | undefined =>
  broadcastChannelCapabilities.find(
    (capability) => capability.channel === channel,
  )

export const broadcastFlowTypes = z.enum(["flow", "template"])
export type BroadcastFlowType = z.infer<typeof broadcastFlowTypes>

/**
 * Relation shape shared by every reader that shows which pages a broadcast
 * sends from (`db.query.broadcastModel` `with` clause).
 */
export const withBroadcastTargets = {
  targets: {
    with: {
      inbox: { columns: { id: true, name: true } },
      flow: { columns: { id: true, name: true } },
    },
  },
} as const

/**
 * How a broadcast scopes its audience and templates. `channel` is the legacy
 * layout (the `Broadcast.integration*Id` columns, else the whole channel);
 * `targets` means the `BroadcastTarget` rows are authoritative.
 */
export const broadcastTargetModes = z.enum(["channel", "targets"])
export type BroadcastTargetMode = z.infer<typeof broadcastTargetModes>

type BroadcastTargetLayout = {
  /** Stored rows carry the persisted mode; a form payload has none yet. */
  targetMode?: string | null
  targets?: readonly { inboxId: string }[] | null
}

/**
 * Whether the pages of this broadcast live on `BroadcastTarget` rows. A stored
 * row says so through `targetMode` — never through the presence of target
 * rows, which cascade away when their inbox is deleted. A payload that is not
 * stored yet is in targets mode as soon as it carries a page.
 */
export const usesBroadcastTargets = (
  broadcast: BroadcastTargetLayout,
): boolean => {
  if (broadcast.targetMode != null) {
    return broadcast.targetMode === broadcastTargetModes.enum.targets
  }
  return (broadcast.targets ?? []).length > 0
}

/** The mode to persist for a payload. */
export const resolveBroadcastTargetMode = (
  targets: readonly { inboxId: string }[] | null | undefined,
): BroadcastTargetMode =>
  (targets ?? []).length > 0
    ? broadcastTargetModes.enum.targets
    : broadcastTargetModes.enum.channel

/**
 * The inbox ids an audience query is scoped to: the target pages in targets
 * mode (an empty list once every page is gone — nobody, not the whole
 * channel), `undefined` in channel mode so the legacy resolution applies.
 */
export const resolveBroadcastTargetInboxIds = (
  broadcast: BroadcastTargetLayout,
): string[] | undefined =>
  usesBroadcastTargets(broadcast)
    ? (broadcast.targets ?? []).map((target) => target.inboxId)
    : undefined

/** The template (and params) a recipient is delivered with. */
export type BroadcastTemplateSend = {
  templateId: string
  templateData: unknown
}

/** A stored send slot: the `Broadcast` columns or one `BroadcastTarget` row. */
type BroadcastTemplateSlot = {
  flowId?: string | null
  templateId?: string | null
  templateData?: unknown
}

type BroadcastWithTargets = BroadcastTemplateSlot & {
  targetMode?: string | null
  targets?: readonly (BroadcastTemplateSlot & { inboxId: string })[] | null
}

/** The minimum a payload or row must expose to tell what it sends. */
type BroadcastTemplateSource = {
  flowId?: string | null
  templateId?: string | null
  targets?:
    | readonly { flowId?: string | null; templateId?: string | null }[]
    | null
}

/**
 * Whether any recipient of this broadcast runs a flow — the legacy
 * `Broadcast.flowId`, or a flow chosen per page on the targets.
 */
export const broadcastSendsFlow = (
  broadcast: BroadcastTemplateSource,
): boolean =>
  Boolean(broadcast.flowId) ||
  (broadcast.targets ?? []).some((target) => Boolean(target.flowId))

/**
 * Whether any recipient of this broadcast is delivered with a template — a
 * legacy single-page row keeps its template on the `Broadcast` columns, a
 * multi-page row keeps one per target. Flow delivery is independent
 * (`flowId`), so this is not the negation of "is a flow broadcast".
 */
export const broadcastSendsTemplate = (
  broadcast: BroadcastTemplateSource,
): boolean =>
  Boolean(broadcast.templateId) ||
  (broadcast.targets ?? []).some((target) => Boolean(target.templateId))

/**
 * A payload that names both a flow and a template — on the broadcast, across
 * its pages, or on one page: the two kinds are mutually exclusive (the form
 * clears one when the other is picked), and the worker would otherwise
 * deliver both messages to a recipient.
 */
export const hasFlowAndTemplate = (
  broadcast: BroadcastTemplateSource,
): boolean => broadcastSendsFlow(broadcast) && broadcastSendsTemplate(broadcast)

/** Two targets on the same page would collide on the `(broadcastId, inboxId)` key. */
export const hasDuplicateBroadcastTarget = (broadcast: {
  targets?: readonly { inboxId: string }[] | null
}): boolean => {
  const targets = broadcast.targets ?? []
  return new Set(targets.map((target) => target.inboxId)).size < targets.length
}

/** A template send where some page has no template chosen: those recipients could never be delivered. */
export const hasBroadcastTargetWithoutTemplate = (
  broadcast: BroadcastTemplateSource,
): boolean =>
  !broadcastSendsFlow(broadcast) &&
  broadcastSendsTemplate(broadcast) &&
  (broadcast.targets ?? []).some((target) => !target.templateId)

/**
 * A template send that names no page at all — neither a target row nor a
 * legacy integration id. Such a broadcast would resolve its audience to the
 * whole channel while the template belongs to one page, so it is rejected.
 */
export const isTemplateSendWithoutPage = (
  broadcast: BroadcastTemplateSource & {
    integrationWhatsappId?: string | null
    integrationMessengerId?: string | null
    targets?: readonly { inboxId: string; templateId?: string | null }[] | null
  },
): boolean =>
  broadcastSendsTemplate(broadcast) &&
  !usesBroadcastTargets(broadcast) &&
  !(broadcast.integrationWhatsappId || broadcast.integrationMessengerId)

/**
 * A targets-form send where NOT ONE page carries a template, and it is not a
 * flow send either. `broadcastSendsTemplate` alone misses this: a legacy
 * top-level `templateId` left over from before the broadcast had pages makes
 * it `true` even though every target is empty, and persistence clears that
 * legacy column once `targetMode` is `targets` — so the broadcast would
 * round-trip with nothing left to preview or send. Individual pages with no
 * template are fine (they are skipped); this only rejects the broadcast as a
 * whole having zero real templates.
 */
export const isTargetsTemplateSendWithoutTemplate = (
  broadcast: BroadcastTemplateSource & {
    targetMode?: string | null
    targets?:
      | readonly {
          inboxId: string
          flowId?: string | null
          templateId?: string | null
        }[]
      | null
  },
): boolean =>
  usesBroadcastTargets(broadcast) &&
  !broadcastSendsFlow(broadcast) &&
  !(broadcast.targets ?? []).some((target) => Boolean(target.templateId))

/**
 * A targets-form send where NOT ONE page carries a flow, and it is not a
 * template send either. Mirrors `isTargetsTemplateSendWithoutTemplate`: a
 * legacy top-level `Broadcast.flowId` left over from before the broadcast had
 * pages makes `broadcastSendsFlow` `true` even though every target is empty,
 * so `broadcastSendsFlow` alone misses this edge. Individual pages with no
 * flow are fine (they are skipped); this only rejects the broadcast as a
 * whole having zero real flows.
 */
export const isTargetsFlowSendWithoutFlow = (
  broadcast: BroadcastTemplateSource & {
    targetMode?: string | null
    targets?:
      | readonly {
          inboxId: string
          flowId?: string | null
          templateId?: string | null
        }[]
      | null
  },
): boolean =>
  usesBroadcastTargets(broadcast) &&
  !broadcastSendsTemplate(broadcast) &&
  !(broadcast.targets ?? []).some((target) => Boolean(target.flowId))

const toTemplateSend = (
  slot: BroadcastTemplateSlot | undefined,
): BroadcastTemplateSend | null =>
  slot?.templateId
    ? { templateId: slot.templateId, templateData: slot.templateData ?? null }
    : null

/**
 * The template a contact on `inboxId` receives. In targets mode only that
 * inbox's target row counts (`null` when the page has no template, or the
 * row is gone); a channel-mode (legacy single-page) broadcast reads the
 * `Broadcast` columns.
 */
export const resolveBroadcastTemplateSend = (
  broadcast: BroadcastWithTargets,
  inboxId: string,
): BroadcastTemplateSend | null =>
  toTemplateSend(resolveBroadcastSendSlot(broadcast, inboxId))

/**
 * The flow a contact on `inboxId` runs: in targets mode that inbox's target
 * row (`null` once the flow was deleted or the page has none); in channel
 * mode the legacy `Broadcast.flowId`.
 */
export const resolveBroadcastFlowSend = (
  broadcast: BroadcastWithTargets,
  inboxId: string,
): string | null => resolveBroadcastSendSlot(broadcast, inboxId)?.flowId ?? null

/**
 * Whether a contact on `inboxId` has anything to receive at all. In targets
 * mode a page whose flow was deleted (`set null`) and that never had a
 * template is a per-recipient failure — never a silent "sent".
 */
export const hasBroadcastSendForInbox = (
  broadcast: BroadcastWithTargets,
  inboxId: string,
): boolean => {
  const slot = resolveBroadcastSendSlot(broadcast, inboxId)
  return Boolean(slot && (slot.flowId || slot.templateId))
}

/** The slot (broadcast columns or the inbox's target row) a recipient is delivered from. */
const resolveBroadcastSendSlot = (
  broadcast: BroadcastWithTargets,
  inboxId: string,
): BroadcastTemplateSlot | undefined =>
  usesBroadcastTargets(broadcast)
    ? (broadcast.targets ?? []).find((target) => target.inboxId === inboxId)
    : broadcast
