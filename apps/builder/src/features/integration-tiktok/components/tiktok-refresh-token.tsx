"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { refreshTiktokTokenAction } from "../actions/refresh-token.action"
import type { IntegrationTiktokResource } from "../schema/resource"

export function TiktokRefreshToken({
  integrationTiktok,
}: {
  integrationTiktok: IntegrationTiktokResource
}) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()

  const { execute, isPending } = useAction(
    refreshTiktokTokenAction.bind(null, workspaceId, integrationTiktok.id),
    {
      onSuccess: () => {
        toast.success(
          t("messages.refreshTokenSuccessfully", {
            feature: t("fields.tiktok.label"),
          }),
        )
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <Button
      disabled={isPending}
      onClick={() => execute()}
      size="sm"
      variant="secondary"
    >
      {isPending && <Loader2Icon className="animate-spin" />}
      {t("tiktok.refreshToken")}
    </Button>
  )
}
