"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { CalendarDaysIcon, ExternalLinkIcon, SendIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { AppointmentCalendarSelect } from "@/features/appointment-calendars/components/appointment-calendar-select"
import { createInboxBookingLinkAction } from "@/features/appointment-management/actions/create-inbox-booking-link.action"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { disableBotAction } from "@/features/conversations/actions/disable-bot.action"
import {
  BOT_DISABLE_DURATION_MS,
  isConversationActive,
} from "@/features/conversations/utils/bot-state"

type CreateAppointmentDialogTriggerProps = {
  /** The inbox the composer was gated on, so the link books on the same one. */
  inboxId: string
  bypassThreadControlLock?: boolean
}

/**
 * The composer's "Create Appointment" button: pick a calendar, then send the
 * contact a booking link or open it to book on their behalf.
 */
export function CreateAppointmentDialogTrigger({
  inboxId,
  bypassThreadControlLock,
}: CreateAppointmentDialogTriggerProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [calendarId, setCalendarId] = useState<string | null>(null)
  const { activeConversationId, conversations, updateConversation } =
    useChatStore((state) => state)
  const conversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  )
  const workspaceId = conversation?.workspaceId ?? ""

  const { execute: disableBot } = useAction(
    disableBotAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        if (conversation) {
          updateConversation(conversation.id, {
            botEnabled: false,
            botResumeAt: new Date(Date.now() + BOT_DISABLE_DURATION_MS),
          })
        }
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const { executeAsync, isExecuting } = useAction(
    createInboxBookingLinkAction.bind(
      null,
      workspaceId,
      conversation?.id ?? "",
    ),
  )

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setCalendarId(null)
    }
  }

  const showError = (description?: string) =>
    toast.error(t("inbox.createAppointment.failed"), { description })

  const handleSend = async () => {
    if (!calendarId) {
      return
    }
    try {
      const result = await executeAsync({
        calendarId,
        inboxId,
        send: true,
        bypassThreadControlLock,
      })
      if (!result?.data) {
        showError(result?.serverError)
        return
      }
      toast.success(t("inbox.createAppointment.sent"))
      handleOpenChange(false)
      if (conversation && isConversationActive(conversation)) {
        disableBot({ ids: [conversation.id] })
      }
    } catch {
      showError()
    }
  }

  const handleGoToLink = async () => {
    if (!calendarId) {
      return
    }
    // Opened synchronously inside the click so popup blockers allow it; the
    // URL is filled in once the server has signed the link.
    const win = window.open("about:blank", "_blank")
    try {
      const result = await executeAsync({ calendarId, inboxId, send: false })
      if (!result?.data) {
        win?.close()
        showError(result?.serverError)
        return
      }
      if (win) {
        win.opener = null
        win.location.href = result.data.url
      }
      handleOpenChange(false)
    } catch {
      win?.close()
      showError()
    }
  }

  const disabled = !calendarId || isExecuting || !conversation

  return (
    <>
      <Button
        aria-label={t("inbox.createAppointment.title")}
        onClick={() => setOpen(true)}
        type="button"
        variant="ghost"
      >
        <CalendarDaysIcon size={20} />
      </Button>
      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("inbox.createAppointment.title")}</DialogTitle>
            <DialogDescription>
              {t("inbox.createAppointment.description")}
            </DialogDescription>
          </DialogHeader>
          <AppointmentCalendarSelect
            disabled={isExecuting}
            enabled={open && Boolean(workspaceId)}
            onValueChange={setCalendarId}
            value={calendarId}
            workspaceId={workspaceId}
          />
          <DialogFooter>
            <Button
              disabled={disabled}
              onClick={handleGoToLink}
              type="button"
              variant="outline"
            >
              <ExternalLinkIcon className="size-4" />
              {t("inbox.createAppointment.goToLink")}
            </Button>
            <Button disabled={disabled} onClick={handleSend} type="button">
              <SendIcon className="size-4" />
              {t("inbox.createAppointment.sendLink")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
