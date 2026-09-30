"use client"

import { stepTypes } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
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
import { SendFlowDialogTrigger } from "./input-menu"

/** Meta's thread-control guide, linked from the take-over refusal. */
const THREAD_CONTROL_DOCS_URL =
  "https://developers.facebook.com/documentation/business-messaging/whatsapp/conversation-routing/thread-control"

type ThreadControlLockedComposerProps = {
  workspaceId: string
  conversationId: string
  contactInboxId: string
  onDismiss: () => void
}

/**
 * Replaces the message box while another responder (Meta AI or a partner)
 * owns the WhatsApp thread: a free-form reply would either be rejected or
 * silently steal the thread. "Take over" asks Meta explicitly; "Send flow"
 * stays available for flows holding templates. The composer's draft lives in
 * the parent's form state, so it reappears untouched after a take-over.
 */
export function ThreadControlLockedComposer({
  workspaceId,
  conversationId,
  contactInboxId,
  onDismiss,
}: ThreadControlLockedComposerProps) {
  const t = useTranslations()
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
          onClick={() => execute({ contactInboxId, action: "take" })}
          type="button"
        >
          {isExecuting ? (
            <Loader2Icon aria-hidden className="animate-spin" />
          ) : (
            <HandIcon aria-hidden />
          )}
          {t("conversationRouting.composer.takeOver")}
        </Button>
        <SendFlowDialogTrigger
          templateStartType={stepTypes.enum.sendWaTemplateMessage}
        >
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
      </div>
      {isNotEscalation && (
        <p className="text-destructive text-sm">
          {t("conversationRouting.composer.notEscalation")}{" "}
          <a
            className="underline underline-offset-2"
            href={THREAD_CONTROL_DOCS_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("conversationRouting.composer.learnMore")}
          </a>
        </p>
      )}
    </div>
  )
}
