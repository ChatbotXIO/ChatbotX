"use client"

import { Layers2Icon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { SequenceStoreProvider } from "@/features/sequences/provider/sequence-store-context"
import { BaseStepViewer } from "../base/viewer"

const SubscribeSequenceStepViewer = () => {
  const t = useTranslations()
  const { chatbotId } = useParams<{ chatbotId: string }>()

  return (
    <SequenceStoreProvider autoInitialize={true} chatbotId={chatbotId}>
      <BaseStepViewer
        icon={Layers2Icon}
        title={t("flows.actions.subscribeSequence")}
      />
    </SequenceStoreProvider>
  )
}

export default SubscribeSequenceStepViewer
