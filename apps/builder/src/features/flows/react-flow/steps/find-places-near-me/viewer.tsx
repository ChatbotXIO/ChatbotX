"use client"

import { MapPinIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const FindPlacesNearMeStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={MapPinIcon}
      title={t("flows.actions.findPlacesNearMe")}
    />
  )
}

export default FindPlacesNearMeStepViewer
