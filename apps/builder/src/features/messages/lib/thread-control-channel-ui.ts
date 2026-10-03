import { stepTypes } from "@chatbotx.io/flow-config"
import type { ThreadControlChannel } from "@chatbotx.io/utils/channel"

export type ThreadControlPassTarget = "escalation" | "aiAgent"

/** Per-channel copy/behaviour of the locked composer. */
type ThreadControlChannelUi = {
  /** i18n key of the inline copy shown when the channel refuses a take-over. */
  takeRefusedMessageKey: string
  /** Whether the channel can be asked who owns the thread ("Sync owner" button). */
  supportsOwnerSync: boolean
  /** Whether the channel can release the thread (Messenger cannot: it refuses `release`). */
  supportsRelease: boolean
  /** Whether the channel can pass the thread to another app. */
  supportsPass: boolean
  /**
   * Who a pass hands the thread to, which picks the confirm/toast copy and the
   * surface: `escalation` (WhatsApp's escalation partner) stays in the actions
   * menu; `aiAgent` (Messenger's AI hand-over, "return to the AI") also gets a
   * dedicated header button.
   */
  passTarget: ThreadControlPassTarget
  /**
   * Whether an idle thread can be passed, not only one we own. A Messenger
   * primary receiver holds an idle thread, so returning it to the AI is valid;
   * a WhatsApp thread is passed only while we own it as the routed partner.
   */
  passFromIdle: boolean
  /** Vendor guide linked from the take-over refusal; no link when absent. */
  docsUrl?: string
  /** Start step of the template tab in the "Send flow" dialog; no tab when absent. */
  templateStartType?: string
  /**
   * When the AI agent (AI hand-over) owns a standby thread, whether a human agent may
   * reply inline: the composer stays OPEN and the first send takes the thread
   * over before delivering (e.g. Messenger, which then rides the HUMAN_AGENT
   * tag). `false` keeps the thread locked behind an explicit take-over (e.g.
   * WhatsApp, whose standby send gate has no take-over-on-send path).
   */
  aiStandbyInlineReply: boolean
}

/**
 * Keyed by every routing-capable channel (exhaustive on purpose: adding a
 * channel to `threadControlChannels` fails to compile until it is described
 * here), so the shared composer never names a channel itself.
 */
export const THREAD_CONTROL_CHANNEL_UI: Record<
  ThreadControlChannel,
  ThreadControlChannelUi
> = {
  whatsapp: {
    takeRefusedMessageKey: "conversationRouting.composer.notEscalation",
    supportsOwnerSync: false,
    supportsRelease: true,
    supportsPass: true,
    passTarget: "escalation",
    passFromIdle: false,
    docsUrl:
      "https://developers.facebook.com/documentation/business-messaging/whatsapp/conversation-routing/thread-control",
    templateStartType: stepTypes.enum.sendWaTemplateMessage,
    // WhatsApp replies from standby via a template, not inline take-over.
    aiStandbyInlineReply: false,
  },
  messenger: {
    takeRefusedMessageKey: "conversationRouting.composer.notPrimaryReceiver",
    supportsOwnerSync: true,
    supportsRelease: false,
    supportsPass: true,
    passTarget: "aiAgent",
    passFromIdle: true,
    docsUrl:
      "https://developers.facebook.com/docs/messenger-platform/handover-protocol",
    // Human handoff from AI hand-over: reply inline, the send takes over then rides
    // the HUMAN_AGENT tag.
    aiStandbyInlineReply: true,
  },
}

type ThreadControlPassCopyKeys = {
  title: string
  description: string
  confirm: string
  success: string
}

/**
 * i18n keys of the pass confirmation and its success toast, keyed by who the
 * channel hands the thread to (`THREAD_CONTROL_CHANNEL_UI[channel].passTarget`).
 * Exhaustive on purpose: a new target fails to compile until it has copy. Full
 * literal keys (no string building) so the i18n checker can see them.
 */
export const THREAD_CONTROL_PASS_COPY_KEYS = {
  escalation: {
    title: "conversationRouting.pass.title",
    description: "conversationRouting.pass.description",
    confirm: "conversationRouting.pass.confirm",
    success: "conversationRouting.pass.success",
  },
  aiAgent: {
    title: "conversationRouting.aiHandover.title",
    description: "conversationRouting.aiHandover.description",
    confirm: "conversationRouting.aiHandover.confirm",
    success: "conversationRouting.aiHandover.success",
  },
} as const satisfies Record<ThreadControlPassTarget, ThreadControlPassCopyKeys>
