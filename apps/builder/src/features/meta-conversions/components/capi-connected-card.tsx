"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { ExternalLinkIcon, Loader2Icon, UnplugIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import type { disconnectMessengerCapiAction } from "@/features/integration-messenger/actions/disconnect-capi.action"

type CapiConnectedCardProps = {
  workspaceId: string
  integrationId: string
  datasetId: string | null
  // Messenger/Instagram/WhatsApp disconnect actions share one signature; the
  // Messenger action type stands in as the shared contract for every tab.
  disconnectAction: typeof disconnectMessengerCapiAction
}

export function CapiConnectedCard({
  workspaceId,
  integrationId,
  datasetId,
  disconnectAction,
}: CapiConnectedCardProps) {
  const t = useTranslations()
  const router = useRouter()
  const disconnect = useAction(
    disconnectAction.bind(null, workspaceId, integrationId),
    {
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("metaConversions.errors.saveFailed"))
      },
      onSuccess: () => {
        router.refresh()
      },
    },
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border bg-muted/30 p-4">
        <div>
          <div className="text-muted-foreground text-sm">
            {t("metaConversions.datasetId")}
          </div>
          <div className="mt-1 break-all font-mono text-sm">
            {datasetId ?? t("messages.none")}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={disconnect.isPending}
          onClick={() => disconnect.execute()}
          type="button"
          variant="destructive"
        >
          {disconnect.isPending ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <UnplugIcon />
          )}
          {t("metaConversions.disconnect")}
        </Button>
        {datasetId ? (
          <Button type="button" variant="secondary">
            <Link
              href={`https://business.facebook.com/events_manager2/list/dataset/${datasetId}`}
              target="_blank"
            >
              <span className="flex items-center gap-2">
                <ExternalLinkIcon className="size-4" />
                {t("metaConversions.openEventManager")}
              </span>
            </Link>
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">
        {t("metaConversions.help.delay")}
      </p>
    </div>
  )
}
