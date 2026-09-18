"use client"

import { ExternalLinkIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import type { BroadcastPageFlow } from "../lib/broadcast-detail-pages"
import type { BroadcastInboxLabelKey } from "../lib/broadcast-inbox-label"

/** Each page of a flow broadcast with the flow it runs, linking to the flow. */
export function BroadcastDetailFlows({
  pageFlows,
  pageLabelKey,
  workspaceId,
}: {
  pageFlows: BroadcastPageFlow[]
  pageLabelKey: BroadcastInboxLabelKey
  workspaceId: string
}) {
  const t = useTranslations()

  if (pageFlows.length === 0) {
    return <div className="text-muted-foreground text-sm">-</div>
  }

  return (
    <div className="divide-y rounded-lg border text-sm">
      <div className="grid grid-cols-2 gap-3 px-3 py-2 text-muted-foreground">
        <span>{t(pageLabelKey)}</span>
        <span>{t("fields.flow.label")}</span>
      </div>
      {pageFlows.map((pageFlow) => (
        <div
          className="grid grid-cols-2 gap-3 px-3 py-2"
          key={`${pageFlow.pageId}-${pageFlow.flowId}`}
        >
          <span className="font-medium">{pageFlow.pageName}</span>
          <Link
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            href={`/space/${workspaceId}/flows/${pageFlow.flowId}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            {pageFlow.flowName}
            <ExternalLinkIcon className="size-3.5 shrink-0" />
          </Link>
        </div>
      ))}
    </div>
  )
}
