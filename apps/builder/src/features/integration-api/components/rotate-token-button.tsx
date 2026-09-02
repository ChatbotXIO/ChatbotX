"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { RefreshCwIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { rotateApiTokenAction } from "../actions/rotate-token.action"
import { TokenRevealDialog } from "./token-reveal-dialog"

export function RotateTokenButton({ id }: { id: string }) {
  const t = useTranslations()
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [revealedToken, setRevealedToken] = useState<string | null>(null)

  const { execute, isPending } = useAction(
    rotateApiTokenAction.bind(null, workspaceId, id),
    {
      onSuccess: ({ data }) => {
        if (data) {
          setRevealedToken(data.token)
        }
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <>
      <Button
        disabled={isPending}
        onClick={() => execute()}
        size="sm"
        variant="outline"
      >
        <RefreshCwIcon className="h-4 w-4" />
        {t("fields.api.rotateToken")}
      </Button>
      <TokenRevealDialog
        onOpenChange={(open) => {
          if (!open) {
            setRevealedToken(null)
          }
        }}
        token={revealedToken}
      />
    </>
  )
}
