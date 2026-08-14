"use client"

import { MegaphoneIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { CapiEventFields } from "@/features/meta-conversions/components/capi-event-fields"
import { BaseStepEditor } from "../base/editor"

type SendMetaCapiEventEditorProps = {
  parentName: string
}

export const SendMetaCapiEventEditor = ({
  parentName,
}: SendMetaCapiEventEditorProps) => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={MegaphoneIcon}
      title={t("flows.actions.sendMetaCapiEvent")}
    >
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">
          {t("metaConversions.flowStep.description")}
        </p>
        <p className="text-muted-foreground text-xs">
          {t("metaConversions.flowStep.whatsappNote")}
        </p>
        <CapiEventFields parentName={parentName} />
      </div>
    </BaseStepEditor>
  )
}
