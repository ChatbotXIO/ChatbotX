"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { useQuery } from "@tanstack/react-query"
import { HistoryIcon, Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import type { z } from "zod"
import { useInvalidateContacts } from "@/features/contacts/hooks/use-contacts"
import { useInvalidateCustomFields } from "@/features/custom-fields/provider/custom-field-hook"
import { useInvalidateTags } from "@/features/tags/provider/tag-hook"
import { orpc } from "@/lib/orpc/query"
import { startContactSyncAction } from "../actions/contact-sync.action"
import { useContactSyncLabels } from "../hooks/use-contact-sync-labels"
import { useInvalidateContactSyncs } from "../hooks/use-invalidate-contact-syncs"
import { contactSyncHistoryPath } from "../lib/routes"
import type { contactSyncSourceResource } from "../schema/public"
import { ContactSyncMapping } from "./contact-sync-mapping"
import { ContactSyncProgress } from "./contact-sync-progress"

type ContactSyncSource = z.infer<typeof contactSyncSourceResource>

type Options = {
  syncTags: boolean
  syncCustomFields: boolean
  overwriteExisting: boolean
}

const OPTION_KEYS = {
  syncTags: "contactSync.options.syncTags",
  syncCustomFields: "contactSync.options.syncCustomFields",
  overwriteExisting: "contactSync.options.overwriteExisting",
} as const satisfies Record<keyof Options, string>

const DEFAULT_OPTIONS: Options = {
  syncTags: true,
  syncCustomFields: true,
  overwriteExisting: false,
}

function SourceRow({
  source,
  selected,
  onToggle,
}: {
  source: ContactSyncSource
  selected: boolean
  onToggle: (selected: boolean) => void
}) {
  const t = useTranslations()
  const labels = useContactSyncLabels()
  const checkboxId = `contact-sync-source-${source.inboxId}`

  return (
    <li className="flex items-start gap-3 rounded-md border p-3">
      <Checkbox
        checked={selected}
        disabled={!source.eligible}
        id={checkboxId}
        onCheckedChange={(checked) => onToggle(checked === true)}
      />
      <Label
        className="flex min-w-0 flex-col items-start gap-1"
        htmlFor={checkboxId}
      >
        <span className="truncate">{source.inboxName}</span>
        <span className="font-normal text-muted-foreground text-xs">
          {t("contactSync.source.mapsTo", {
            channel: labels.channel(source.channel),
            page: source.sourceName ?? source.accountId,
          })}
        </span>
      </Label>
    </li>
  )
}

function SyncForm({
  workspaceId,
  sources,
  onStarted,
}: {
  workspaceId: string
  sources: ContactSyncSource[]
  onStarted: (runId: string) => void
}) {
  const t = useTranslations()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const start = useAction(startContactSyncAction.bind(null, workspaceId), {
    onSuccess: ({ data }) => data && onStarted(data.runId),
    onError: ({ error }) => {
      toast.error(
        error.validationErrors?._errors?.[0] ??
          error.serverError ??
          t("contactSync.errors.generic"),
      )
    },
  })

  const sourceById = new Map(
    sources.map((source) => [source.inboxId, source] as const),
  )
  const toggle = (inboxId: string, isSelected: boolean) =>
    setSelectedIds((current) =>
      isSelected
        ? [...current.filter((id) => id !== inboxId), inboxId]
        : current.filter((id) => id !== inboxId),
    )

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        {sources.map((source) => (
          <SourceRow
            key={source.inboxId}
            onToggle={(isSelected) => toggle(source.inboxId, isSelected)}
            selected={selectedIds.includes(source.inboxId)}
            source={source}
          />
        ))}
      </ul>

      <div className="flex flex-col gap-3">
        {(Object.keys(OPTION_KEYS) as (keyof Options)[]).map((key) => (
          <div className="flex items-center justify-between gap-3" key={key}>
            <Label htmlFor={`contact-sync-${key}`}>{t(OPTION_KEYS[key])}</Label>
            <Switch
              checked={options[key]}
              id={`contact-sync-${key}`}
              onCheckedChange={(checked) =>
                setOptions((current) => ({ ...current, [key]: checked }))
              }
            />
          </div>
        ))}
        <p className="text-muted-foreground text-xs">
          {t("contactSync.options.hint")}
        </p>
      </div>

      {selectedIds.length > 0 &&
        (options.syncTags || options.syncCustomFields) && (
          <div className="flex flex-col gap-3">
            <button
              className="self-start text-primary text-sm underline-offset-4 hover:underline"
              onClick={() => setShowAdvanced((value) => !value)}
              type="button"
            >
              {t(
                showAdvanced
                  ? "contactSync.advanced.hide"
                  : "contactSync.advanced.show",
              )}
            </button>
            {showAdvanced &&
              selectedIds.map((inboxId) => (
                <section className="rounded-md border p-3" key={inboxId}>
                  <h3 className="mb-3 font-medium text-sm">
                    {sourceById.get(inboxId)?.inboxName}
                  </h3>
                  <ContactSyncMapping
                    inboxId={inboxId}
                    workspaceId={workspaceId}
                  />
                </section>
              ))}
          </div>
        )}

      <div className="flex justify-end">
        <Button
          disabled={selectedIds.length === 0 || start.isPending}
          onClick={() =>
            start.execute({
              ...options,
              sources: selectedIds.map((inboxId) => ({ inboxId })),
            })
          }
        >
          {start.isPending && <Loader2Icon className="animate-spin" />}
          {t("contactSync.start")}
        </Button>
      </div>
    </div>
  )
}

/**
 * "Sync with AhaChat" from the contacts Import menu. Controlled, and rendered
 * outside that menu: a dialog nested in an open menu made the menu lose its
 * anchor (and jump to the corner) when both closed at once.
 */
export function ContactSyncDialog({
  workspaceId,
  open,
  onOpenChange: setOpen,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const format = useFormatter()
  const refresh = useInvalidateContactSyncs()
  const invalidateContacts = useInvalidateContacts()
  const invalidateTags = useInvalidateTags()
  const invalidateCustomFields = useInvalidateCustomFields()
  const [runId, setRunId] = useState<string | null>(null)

  const availability = useQuery(
    orpc.contactSyncAPIs.getAvailability.queryOptions({
      input: { workspaceId },
      enabled: open,
    }),
  )
  const sources = useQuery(
    orpc.contactSyncAPIs.listSources.queryOptions({
      input: { workspaceId },
      enabled: open,
    }),
  )

  const activeRunId = runId ?? availability.data?.activeRunId ?? null
  const isLoading = availability.isPending || sources.isPending
  const isError = availability.isError || sources.isError

  const renderBody = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center py-8">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        </div>
      )
    }
    if (isError) {
      return (
        <div className="flex flex-col items-start gap-2 text-sm">
          <p className="text-destructive">{t("contactSync.errors.generic")}</p>
          <Button onClick={refresh} size="sm" variant="outline">
            {t("actions.retry")}
          </Button>
        </div>
      )
    }
    if (activeRunId) {
      return (
        <ContactSyncProgress
          onSettled={() => {
            setRunId(null)
            setOpen(false)
            // A sync may have created tags and custom fields as well.
            invalidateContacts()
            invalidateTags()
            invalidateCustomFields()
            refresh()
          }}
          runId={activeRunId}
          workspaceId={workspaceId}
        />
      )
    }
    if (
      availability.data?.blockedReason === "cooldown" &&
      availability.data.nextSyncAt
    ) {
      return (
        <p className="text-sm">
          {t("contactSync.cooldown", {
            time: format.dateTime(availability.data.nextSyncAt, {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          })}
        </p>
      )
    }
    const all = sources.data?.data ?? []
    // Only pages AhaChat knows are offered; the ones it has no match for are
    // not worth a row. An unreachable AhaChat is not "no match", so say so.
    const mapped = all.filter((source) => source.eligible)
    if (mapped.length === 0) {
      if (
        all.some((source) => source.ineligibleReason === "ahachatUnavailable")
      ) {
        return (
          <div className="flex flex-col items-start gap-2 text-sm">
            <p className="text-destructive">
              {t("contactSync.ineligible.ahachatUnavailable")}
            </p>
            <Button onClick={refresh} size="sm" variant="outline">
              {t("actions.retry")}
            </Button>
          </div>
        )
      }
      return (
        <p className="text-muted-foreground text-sm">
          {t(
            all.length === 0
              ? "contactSync.empty"
              : "contactSync.noneInAhachat",
          )}
        </p>
      )
    }
    return (
      <SyncForm
        onStarted={(id) => {
          setRunId(id)
          refresh()
        }}
        sources={mapped}
        workspaceId={workspaceId}
      />
    )
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("contactSync.title")}</DialogTitle>
          <DialogDescription>{t("contactSync.description")}</DialogDescription>
          <Link
            className="inline-flex items-center gap-1 self-start text-primary text-sm underline-offset-4 hover:underline"
            href={contactSyncHistoryPath(workspaceId)}
            // Close now: the history page renders on the server, and until it
            // replaces this page the open dialog would stay on screen.
            onClick={() => setOpen(false)}
          >
            <HistoryIcon className="size-4" />
            {t("contactSync.history.open")}
          </Link>
        </DialogHeader>
        {renderBody()}
      </DialogContent>
    </Dialog>
  )
}
