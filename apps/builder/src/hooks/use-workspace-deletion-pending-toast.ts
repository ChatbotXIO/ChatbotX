"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { toast } from "sonner"
import { WORKSPACE_DELETION_PENDING_PARAM } from "@/lib/workspace/deletion-pending-param"

export function useWorkspaceDeletionPendingToast() {
  const t = useTranslations("workspace.deletion")
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    if (searchParams.get(WORKSPACE_DELETION_PENDING_PARAM) !== "1") {
      return
    }

    toast.error(t("pendingBlockedToast"))
    const params = new URLSearchParams(searchParams.toString())
    params.delete(WORKSPACE_DELETION_PENDING_PARAM)
    router.replace(params.size ? `/?${params.toString()}` : "/")
  }, [searchParams, router, t])
}
