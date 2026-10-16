"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import type { connectMessengerCapiAction } from "@/features/integration-messenger/actions/connect-capi.action"

type CapiConnectButtonProps = {
  workspaceId: string
  integrationId: string
  // The Messenger and Instagram connect actions share one signature; the
  // Messenger action type stands in as the shared contract.
  connectAction: typeof connectMessengerCapiAction
}

/**
 * Connect for the channels whose dedicated Conversions API connect is a Facebook
 * OAuth redirect (Messenger, Instagram). The action ends in a redirect to the
 * Facebook dialog, so the button simply stays busy until the browser leaves.
 */
export function CapiConnectButton({
  workspaceId,
  integrationId,
  connectAction,
}: CapiConnectButtonProps) {
  const t = useTranslations()
  const connect = useAction(
    connectAction.bind(null, workspaceId, integrationId),
    {
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("metaConversions.errors.saveFailed"))
      },
    },
  )

  return (
    <Button
      disabled={connect.isPending}
      onClick={() => connect.execute()}
      type="button"
    >
      {connect.isPending && <Loader2Icon className="animate-spin" />}
      {t("metaConversions.connect.button")}
    </Button>
  )
}
