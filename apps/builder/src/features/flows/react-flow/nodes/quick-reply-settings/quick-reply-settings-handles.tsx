"use client"

import { listQuickReplySettingsHandles } from "@chatbotx.io/flow-config"
import { Position } from "@xyflow/react"
import { useTranslations } from "next-intl"
import { BaseHandle } from "@/components/base-handle"

const handleLabelKeyByKind = {
  followUp: "flows.quickReplySettings.followUp.handle",
  retry: "flows.quickReplySettings.retry.handle",
} as const

export function QuickReplySettingsHandles({ details }: { details: unknown }) {
  const t = useTranslations()
  const handles = listQuickReplySettingsHandles(details)
  if (handles.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-1">
      {handles.map((handle) => (
        <div
          className="relative w-full rounded border border-dashed px-3 py-1 text-end text-muted-foreground text-xs"
          key={handle.id}
        >
          {t(handleLabelKeyByKind[handle.kind])}
          {/* React Flow routes from physical Position.Right. */}
          <BaseHandle
            className="right-3!"
            id={handle.id}
            position={Position.Right}
            type="source"
          />
        </div>
      ))}
    </div>
  )
}
