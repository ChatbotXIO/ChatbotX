"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import ky from "ky"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import type { FlowResource } from "../schemas/resource"

export function FlowAnalyticsHeader({ flow }: { flow: FlowResource }) {
  const t = useTranslations()
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await ky.delete(
        `/api/workspaces/${flow.workspaceId}/flows/${flow.id}/stats`,
      )
      router.push(`/space/${flow.workspaceId}/flows/${flow.id}`)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <div className="flex-1">
        <AppBreadcrumb
          items={[
            {
              label: t("fields.flows.label"),
              href: `/space/${flow.workspaceId}/flows`,
            },
            {
              label: flow.name,
              href: `/space/${flow.workspaceId}/flows/${flow.id}`,
            },
            { label: t("actions.analytics"), href: "" },
          ]}
        />
      </div>

      <Button
        disabled={isDeleting}
        onClick={handleDelete}
        size="sm"
        variant="destructive"
      >
        {isDeleting && <Loader2Icon className="animate-spin" />}
        {t("actions.deleteAnalytics")}
      </Button>
    </header>
  )
}
