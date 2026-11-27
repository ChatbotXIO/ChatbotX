"use client"

import type { CallPhoneNumberStepSchema } from "@chatbotx.io/flow-config"
import { PhoneCallIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const CallPhoneNumberStepViewer = ({
  data,
}: {
  data: CallPhoneNumberStepSchema
}) => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={PhoneCallIcon}
      title={t("fields.button.callToThisNumber")}
    >
      <div className="break-all">{data.phoneNumber}</div>
    </BaseStepViewer>
  )
}

export default CallPhoneNumberStepViewer
