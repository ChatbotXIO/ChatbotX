"use client"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@aha.chat/ui/components/ui/breadcrumb"
import { useTranslations } from "next-intl"
import type { FlowResource } from "../schemas/resource"
import { FlowEditToolbar } from "./flow-edit-toolbar"

export function FrameHeader({ flow }: { flow: FlowResource }) {
  const t = useTranslations()

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <Breadcrumb className="flex-1">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              className="capitalize"
              href={`/chatbots/${flow.chatbotId}/flows`}
            >
              {t("fields.flow.label")}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{flow.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <FlowEditToolbar chatbotId={flow.chatbotId} flow={flow} />
    </header>
  )
}
