"use client"

import type { CopyTextStepSchema } from "@chatbotx.io/flow-config"
import { CopyIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const CopyTextStepViewer = ({ data }: { data: CopyTextStepSchema }) => {
  const t = useTranslations()

  return (
    <BaseStepViewer icon={CopyIcon} title={t("flows.copyText.viewerTitle")}>
      <div className="line-clamp-3 break-all">{data.text}</div>
    </BaseStepViewer>
  )
}

export default CopyTextStepViewer
