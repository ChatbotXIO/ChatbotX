"use client"

import { MegaphoneIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { GoogleAdsConversionFields } from "@/features/integration-google-ads/components/google-ads-conversion-fields"
import { BaseStepEditor } from "../base/editor"

type SendGoogleAdsConversionEditorProps = {
  parentName: string
}

export const SendGoogleAdsConversionEditor = ({
  parentName,
}: SendGoogleAdsConversionEditorProps) => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={MegaphoneIcon}
      title={t("flows.actions.sendGoogleAdsConversion")}
    >
      <GoogleAdsConversionFields parentName={parentName} />
    </BaseStepEditor>
  )
}
