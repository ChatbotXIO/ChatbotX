"use client"

import type { Edge, Node } from "@xyflow/react"
import { useTranslations } from "next-intl"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import type { FlowResource } from "../schemas/resource"
import { FlowEditToolbar } from "./flow-edit-toolbar"

export function FrameHeader({
  flow,
  canRevertToPublished,
  hasPublishedVersion,
  cancelAutosave,
  markSaved,
}: {
  flow: FlowResource
  canRevertToPublished: boolean
  hasPublishedVersion: boolean
  cancelAutosave: (() => void) | null
  markSaved: ((nodes: Node[], edges: Edge[]) => void) | null
}) {
  const t = useTranslations()

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <div className="flex-1">
        <AppBreadcrumb
          items={[
            {
              label: t("fields.flows.label"),
              href: `/space/${flow.workspaceId}/flows`,
            },
            { label: flow.name, href: "" },
          ]}
        />
      </div>
      {/* <ThemeSwitcher /> */}

      <FlowEditToolbar
        cancelAutosave={cancelAutosave}
        canRevertToPublished={canRevertToPublished}
        flow={flow}
        hasPublishedVersion={hasPublishedVersion}
        markSaved={markSaved}
        workspaceId={flow.workspaceId}
      />
    </header>
  )
}
