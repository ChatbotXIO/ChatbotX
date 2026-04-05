"use client"

import { Layers2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { SequenceStoreProvider } from "@/features/sequences/provider/sequence-store-context"
import { useWorkspaceId } from "@/hooks/routing"
import { BaseStepViewer } from "../base/viewer"

const SubscribeSequenceStepViewer = () => {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()

  return (
    <SequenceStoreProvider autoInitialize={true} workspaceId={workspaceId}>
      <BaseStepViewer
        icon={Layers2Icon}
        title={t("flows.actions.subscribeSequence")}
      />
    </SequenceStoreProvider>
  )
}

export default SubscribeSequenceStepViewer
