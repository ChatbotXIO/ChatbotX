"use client"

import type { MailchimpAddMemberSchema } from "@aha.chat/flow-config"
import { MailIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const MailchimpAddMemberStepViewer = ({
  data: _data,
}: {
  data: MailchimpAddMemberSchema
}) => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={MailIcon}
      title={t("flows.actions.mailchimpAddMember")}
    />
  )
}

export default MailchimpAddMemberStepViewer
