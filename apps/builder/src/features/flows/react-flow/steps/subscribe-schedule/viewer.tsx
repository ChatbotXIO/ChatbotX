"use client"

import { Layers2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { SequenceStoreProvider } from "@/features/sequences/provider/sequence-store-context"
import { useChatbotId } from "@/hooks/routing"
import { BaseStepViewer } from "../base/viewer"

const SubscribeSequenceStepViewer = () => {
  const t = useTranslations()
  const chatbotId = useChatbotId()

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
