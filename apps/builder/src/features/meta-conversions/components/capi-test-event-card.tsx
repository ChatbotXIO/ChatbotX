"use client"

import type { MetaConversionsChannel } from "@chatbotx.io/business"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  ExternalLinkIcon,
  FlaskConicalIcon,
  Loader2Icon,
  SendIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useId, useState } from "react"
import { toast } from "sonner"
import { saveCapiTestEventCodeAction } from "../actions/save-capi-test-event-code.action"
import { sendCapiTestEventAction } from "../actions/send-capi-test-event.action"
import { CapiTestEventDialog } from "./capi-test-event-dialog"

type CapiTestEventCardProps = {
  workspaceId: string
  integrationId: string
  channel: MetaConversionsChannel
  datasetId: string | null
  testEventCode: string | null
}

/**
 * Events Manager "Test events" helper for one channel integration: save or
 * clear the `test_event_code`, and post one sample event to a messaging id
 * the admin types in so the full payload can be inspected on Meta's side
 * without ever attributing it to a real contact.
 */
export function CapiTestEventCard({
  workspaceId,
  integrationId,
  channel,
  datasetId,
  testEventCode,
}: CapiTestEventCardProps) {
  const t = useTranslations("metaConversions")
  const router = useRouter()
  const inputId = useId()
  const [draftCode, setDraftCode] = useState(testEventCode ?? "")
  const [isSendOpen, setIsSendOpen] = useState(false)

  const save = useAction(
    saveCapiTestEventCodeAction.bind(null, workspaceId, integrationId),
    {
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("errors.invalidTestEventCode"))
      },
      onSuccess: ({ data }) => {
        toast.success(
          data?.testEventCode ? t("testEvents.saved") : t("testEvents.cleared"),
        )
        router.refresh()
      },
    },
  )

  const send = useAction(
    sendCapiTestEventAction.bind(null, workspaceId, integrationId),
    {
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("errors.saveFailed"))
      },
      onSuccess: () => {
        setIsSendOpen(false)
        toast.success(t("testEvents.sent"))
      },
    },
  )

  const trimmedDraft = draftCode.trim()
  const isUnchanged = trimmedDraft === (testEventCode ?? "")
  const isBusy = save.isPending || send.isPending

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 font-medium text-sm">
          <FlaskConicalIcon className="size-4" />
          {t("testEvents.title")}
        </div>
        <p className="text-muted-foreground text-xs">
          {t("testEvents.description")}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={inputId}>{t("testEvents.codeLabel")}</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-xs font-mono"
            id={inputId}
            maxLength={64}
            onChange={(event) => setDraftCode(event.target.value)}
            placeholder={t("testEvents.codePlaceholder")}
            value={draftCode}
          />
          <Button
            disabled={isBusy || isUnchanged}
            onClick={() =>
              save.execute({ channel, testEventCode: trimmedDraft })
            }
            type="button"
          >
            {save.isPending ? <Loader2Icon className="animate-spin" /> : null}
            {t("testEvents.save")}
          </Button>
          {testEventCode ? (
            <Button
              disabled={isBusy}
              onClick={() => {
                setDraftCode("")
                save.execute({ channel, testEventCode: "" })
              }}
              type="button"
              variant="ghost"
            >
              {t("testEvents.clear")}
            </Button>
          ) : null}
        </div>
      </div>

      {testEventCode ? (
        <p className="text-amber-600 text-xs dark:text-amber-400">
          {t("testEvents.activeNotice")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={isBusy || !testEventCode}
          onClick={() => setIsSendOpen(true)}
          type="button"
          variant="secondary"
        >
          {send.isPending ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <SendIcon />
          )}
          {t("testEvents.send")}
        </Button>
        {datasetId ? (
          <Button type="button" variant="ghost">
            <Link
              href={`https://business.facebook.com/events_manager2/list/dataset/${datasetId}/test_events`}
              target="_blank"
            >
              <span className="flex items-center gap-2">
                <ExternalLinkIcon className="size-4" />
                {t("testEvents.openTestEvents")}
              </span>
            </Link>
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">
        {t("testEvents.sendHint")}
      </p>
      <CapiTestEventDialog
        channel={channel}
        isPending={send.isPending}
        onOpenChange={setIsSendOpen}
        onSend={(messagingId) => send.execute({ channel, messagingId })}
        open={isSendOpen}
      />
    </div>
  )
}
