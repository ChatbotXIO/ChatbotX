"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import type { ThreadControlChannel } from "@chatbotx.io/utils/channel"
import {
  HandIcon,
  Loader2Icon,
  TriangleAlertIcon,
  WorkflowIcon,
  XIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { THREAD_CONTROL_TONES } from "@/features/conversations/components/thread-control-tone"
import { useThreadControlAction } from "@/features/conversations/hooks/use-thread-control-action"
import { THREAD_CONTROL_CHANNEL_UI } from "../lib/thread-control-channel-ui"
import { SendFlowDialogTrigger } from "./input-menu"

type ThreadControlLockedComposerProps = {
  /** The routing-capable channel of the locked thread. */
  channel: ThreadControlChannel
  /**
   * BizAI inline-reply case: "Take over" only reveals the composer (calls
   * `onDismiss`, no Meta call) — the take happens on the first send, with the
   * HUMAN_AGENT tag. `false` keeps the classic explicit Meta take-over.
   */
  revealOnTakeOver: boolean
  workspaceId: string
  conversationId: string
  contactInboxId: string
  onDismiss: () => void
}

/**
 * Replaces the message box while another responder (Meta AI or a partner)
 * owns the thread on a routing-capable channel: a free-form reply would either be rejected or
 * silently steal the thread. "Take over" asks Meta explicitly; "Send flow"
 * appears only on channels whose templates bypass thread control
 * (`templateStartType`, e.g. WhatsApp HSM) — a standby send of anything else is
 * blocked by the send gate, so on a channel without that bypass (Messenger) the
 * only path is take-over. The composer's draft lives in the parent's form
 * state, so it reappears untouched after a take-over.
 */
export function ThreadControlLockedComposer({
  channel,
  revealOnTakeOver,
  workspaceId,
  conversationId,
  contactInboxId,
  onDismiss,
}: ThreadControlLockedComposerProps) {
  const t = useTranslations()
  const { docsUrl, takeRefusedMessageKey, templateStartType } =
    THREAD_CONTROL_CHANNEL_UI[channel]
  const { execute, isExecuting, isNotEscalation } = useThreadControlAction({
    workspaceId,
    conversationId,
  })

  return (
    <div
      className={cn(
        "relative m-3 flex shrink-0 flex-col items-center gap-3 rounded-xl border px-4 py-3 text-center",
        THREAD_CONTROL_TONES.standby.className,
      )}
      role="status"
    >
      <Button
        aria-label={t("conversationRouting.composer.dismiss")}
        className="absolute top-2 right-2 size-7"
        onClick={onDismiss}
        size="icon"
        type="button"
        variant="ghost"
      >
        <XIcon aria-hidden />
      </Button>
      <div className="flex flex-col items-center gap-1">
        <p className="flex items-center justify-center gap-2 font-medium text-sm">
          <TriangleAlertIcon aria-hidden className="size-4 shrink-0" />
          {t("conversationRouting.composer.title")}
        </p>
        <p className="text-foreground/80 text-sm">
          {t("conversationRouting.composer.description")}
        </p>
      </div>
      <div className="flex w-full flex-col justify-center gap-2 sm:w-auto sm:flex-row sm:items-center">
        <Button
          className="w-full sm:w-auto"
          disabled={isExecuting}
          onClick={() =>
            revealOnTakeOver
              ? onDismiss()
              : execute({ contactInboxId, action: "take" })
          }
          type="button"
        >
          {isExecuting ? (
            <Loader2Icon aria-hidden className="animate-spin" />
          ) : (
            <HandIcon aria-hidden />
          )}
          {t("conversationRouting.composer.takeOver")}
        </Button>
        {templateStartType && (
          <SendFlowDialogTrigger templateStartType={templateStartType}>
            <Button
              className="w-full sm:w-auto"
              disabled={isExecuting}
              type="button"
              variant="outline"
            >
              <WorkflowIcon aria-hidden />
              {t("actions.sendFlow")}
            </Button>
          </SendFlowDialogTrigger>
        )}
      </div>
      {isNotEscalation && (
        <p className="text-destructive text-sm">
          {t(takeRefusedMessageKey)}
          {docsUrl && (
            <>
              {" "}
              <a
                className="underline underline-offset-2"
                href={docsUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                {t("conversationRouting.composer.learnMore")}
              </a>
            </>
          )}
        </p>
      )}
    </div>
  )
}
