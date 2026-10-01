import { stepTypes } from "@chatbotx.io/flow-config"
import type { ThreadControlChannel } from "@chatbotx.io/utils/channel"

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
  /** Vendor guide linked from the take-over refusal; no link when absent. */
  docsUrl?: string
  /** Start step of the template tab in the "Send flow" dialog; no tab when absent. */
  templateStartType?: string
  /**
   * When the AI agent (BizAI) owns a standby thread, whether a human agent may
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
    docsUrl:
      "https://developers.facebook.com/docs/messenger-platform/handover-protocol",
    // Human handoff from BizAI: reply inline, the send takes over then rides
    // the HUMAN_AGENT tag.
    aiStandbyInlineReply: true,
  },
}
