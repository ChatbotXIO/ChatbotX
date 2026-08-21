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

// A Meta Dataset ID is a numeric string (mirrors the server's dataset-id
// schema). Validate the format on the client so a typo gets a clear message
// instead of a misleading "token could not access the dataset" from the server.
const DATASET_ID_PATTERN = /^\d+$/

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

  // A pasted Dataset ID is validated and saved as-is ("Save"); an empty field
  // auto-creates a linked dataset ("Create Dataset"). The label mirrors which
  // action the button will run.
  const trimmedDatasetId = datasetInput.trim()
  const hasDatasetId = trimmedDatasetId.length > 0
  const isDatasetIdInvalid =
    hasDatasetId && !DATASET_ID_PATTERN.test(trimmedDatasetId)

  const onSave = () => {
    if (hasDatasetId) {
      if (isDatasetIdInvalid) {
        return
      }
      setDataset.execute({ datasetId: trimmedDatasetId })
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
          aria-invalid={isDatasetIdInvalid}
          className="font-mono"
          onChange={(event) => setDatasetInput(event.target.value)}
          placeholder={t("metaConversions.datasetIdPlaceholder")}
          value={datasetInput}
        />
        {isDatasetIdInvalid ? (
          <p className="text-destructive text-xs">
            {t("metaConversions.errors.invalidDatasetId")}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={isPending || isDatasetIdInvalid}
            onClick={onSave}
            type="button"
          >
            {isPending ? <Loader2Icon className="animate-spin" /> : null}
            {t(
              hasDatasetId
                ? "metaConversions.finalize.save"
                : "metaConversions.finalize.createDataset",
            )}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          {t("metaConversions.finalize.caveat")}
        </p>
      </CardContent>
    </Card>
  )
}
