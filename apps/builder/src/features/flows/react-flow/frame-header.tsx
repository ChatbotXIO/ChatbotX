"use client"

import { useTranslations } from "next-intl"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import type { FlowResource } from "../schemas/resource"
import { FlowEditToolbar } from "./flow-edit-toolbar"

export function FrameHeader({ flow }: { flow: FlowResource }) {
  const t = useTranslations()

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <div className="flex-1">
        <AppBreadcrumb
          items={[
            {
              label: t("fields.flows.label"),
              href: `/chatbots/${flow.chatbotId}/flows`,
            },
            { label: flow.name, href: "" },
          ]}
        />
      </div>
      {/* <ThemeSwitcher /> */}

      <FlowEditToolbar chatbotId={flow.chatbotId} flow={flow} />
    </header>
  )
}
