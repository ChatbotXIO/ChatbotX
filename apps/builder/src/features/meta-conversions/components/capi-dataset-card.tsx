"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import type { provisionMessengerCapiDatasetAction } from "@/features/integration-messenger/actions/provision-capi-dataset.action"
import type { setMessengerCapiDatasetAction } from "@/features/integration-messenger/actions/set-capi-dataset.action"

// Messenger, Instagram, and WhatsApp CAPI actions share identical bind/input
// signatures, so the Messenger action types stand in as the shared contract
// for every channel that reuses this card.
export type CapiDatasetCardActions = {
  setDataset: typeof setMessengerCapiDatasetAction
  provision: typeof provisionMessengerCapiDatasetAction
}

type CapiDatasetCardProps = {
  workspaceId: string
  integrationId: string
  actions: CapiDatasetCardActions
}

export function CapiDatasetCard({
  workspaceId,
  integrationId,
  actions,
}: CapiDatasetCardProps) {
  const t = useTranslations()
  const router = useRouter()
  const [datasetInput, setDatasetInput] = useState("")

  const onError = ({ error }: { error: { serverError?: string } }) => {
    toast.error(error.serverError ?? t("metaConversions.errors.saveFailed"))
  }
  const onSuccess = () => {
    toast.success(t("metaConversions.connected"))
    router.refresh()
  }

  const setDataset = useAction(
    actions.setDataset.bind(null, workspaceId, integrationId),
    { onError, onSuccess },
  )
  const provision = useAction(
    actions.provision.bind(null, workspaceId, integrationId),
    { onError, onSuccess },
  )

  const isPending = setDataset.isPending || provision.isPending

  // One Save button: a pasted Dataset ID is validated and used as-is; an empty
  // field falls back to auto-creating a linked dataset (the old logic).
  const onSave = () => {
    const datasetId = datasetInput.trim()
    if (datasetId.length > 0) {
      setDataset.execute({ datasetId })
      return
    }
    provision.execute()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("metaConversions.finalize.title")}
        </CardTitle>
        <CardDescription>
          {t("metaConversions.finalize.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          className="font-mono"
          onChange={(event) => setDatasetInput(event.target.value)}
          placeholder={t("metaConversions.datasetIdPlaceholder")}
          value={datasetInput}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={isPending} onClick={onSave} type="button">
            {isPending ? <Loader2Icon className="animate-spin" /> : null}
            {t("metaConversions.finalize.save")}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          {t("metaConversions.finalize.caveat")}
        </p>
      </CardContent>
    </Card>
  )
}
