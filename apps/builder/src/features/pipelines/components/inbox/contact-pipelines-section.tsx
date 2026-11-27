"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useQuery } from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { orpc } from "@/lib/orpc/query"
import { concernsContact } from "../../lib/contact-panel-refresh"
import { itemNounKeys } from "../../lib/item-noun"
import { usePipelineDetail } from "../../lib/use-pipeline-detail"
import { usePipelineOptions } from "../../lib/use-pipeline-options"
import { usePipelineRealtimeRefetch } from "../../lib/use-pipeline-realtime-refetch"
import { AddItemSheet } from "../add-item/add-item-sheet"
import { OptionSelect } from "../shared/option-select"

/** A contact's pipeline items, with a shortcut to add one (inbox side panel). */
export function ContactPipelinesSection({
  workspaceId,
  contactId,
  contactName,
}: {
  workspaceId: string
  contactId: string
  contactName: string
}) {
  const t = useTranslations("pipelines")
  const [pipelineId, setPipelineId] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const items = useQuery(
    orpc.pipelinesAPI.privateListContactItemsAPI.queryOptions({
      input: { workspaceId, contactId },
    }),
  )
  // A flow or another member can change this contact's items, or the pipeline
  // itself, while the panel is open. Refetch every pipeline query on screen
  // (items, the picker and the chosen pipeline's stages) for this contact's
  // items, for pipeline-wide changes, and for events from publishers that do
  // not send a contact yet.
  usePipelineRealtimeRefetch((event) => concernsContact(event.data, contactId))
  // The picker's options load the first time it is opened, not with the panel.
  const [isPickerUsed, setIsPickerUsed] = useState(false)
  const pipelineOptions = usePipelineOptions({
    enabled: isPickerUsed,
    workspaceId,
  })
  const detail = usePipelineDetail(workspaceId, pipelineId, {
    enabled: Boolean(pipelineId),
  })

  // A failed refetch keeps the last data: the pipeline may be gone.
  const canAdd = Boolean(
    pipelineId && !detail.isError && detail.data?.permissions.canEdit,
  )

  if (items.isPending) {
    return <p className="text-muted-foreground text-xs">{t("item.loading")}</p>
  }

  const errorRow = (
    <div className="flex items-center gap-2">
      <p className="text-destructive text-xs">{t("panel.error")}</p>
      <Button onClick={() => items.refetch()} size="sm" variant="outline">
        {t("retry")}
      </Button>
    </div>
  )

  // A failed refetch keeps the last list: show the error inline so an open
  // add sheet (and a save in flight) stays mounted.
  if (!items.data) {
    return errorRow
  }

  return (
    <div className="grid gap-3 text-sm">
      {items.isError ? errorRow : null}
      {items.data.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t("panel.empty")}</p>
      ) : null}
      <ul className="grid gap-1.5">
        {items.data.map((view) => (
          <li key={view.item.id}>
            <Link
              className="flex flex-col rounded-md border px-3 py-2 hover:bg-muted"
              href={`/space/${workspaceId}/pipelines/${view.pipeline.id}`}
            >
              <span className="font-medium">{view.item.title}</span>
              <span className="text-muted-foreground text-xs">
                {view.pipeline.name} ·{" "}
                {view.pipeline.settings.statusLabels[view.item.status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="grid gap-2">
        <OptionSelect
          ariaLabel={t("panel.choosePipeline")}
          emptyLabel={t("panel.choosePipeline")}
          onOpenChange={(isOpen) => isOpen && setIsPickerUsed(true)}
          onValueChange={setPipelineId}
          options={pipelineOptions.pipelines.map((entry) => ({
            value: entry.id,
            label: entry.name,
          }))}
          value={pipelineId}
        />
        <Button
          disabled={!canAdd}
          onClick={() => setIsAdding(true)}
          size="sm"
          variant="outline"
        >
          <PlusIcon />
          {detail.data
            ? t(itemNounKeys[detail.data.pipeline.type].add)
            : t("panel.add")}
        </Button>
      </div>
      {detail.data ? (
        <AddItemSheet
          disabled={!canAdd}
          fields={detail.data.fields}
          initialContact={{ id: contactId, name: contactName }}
          key={`${pipelineId}:${contactId}`}
          onOpenChange={setIsAdding}
          open={isAdding}
          pipeline={detail.data.pipeline}
          stages={detail.data.stages}
          workspaceId={workspaceId}
        />
      ) : null}
    </div>
  )
}
