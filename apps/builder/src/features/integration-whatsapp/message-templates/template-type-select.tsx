"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { useTranslate } from "@tolgee/react"
import {
  CopyIcon,
  FileIcon,
  ImageIcon,
  MapIcon,
  StoreIcon,
  TypeIcon,
  VideoIcon,
} from "lucide-react"
import { TemplateType } from "@/features/integration-whatsapp/message-templates/type"

type WhatsappMessageTemplateTypeSelectProps = {
  onSelectTemplateType: (templateType: TemplateType) => void
}

export function WhatsappMessageTemplateTypeSelect(
  props: WhatsappMessageTemplateTypeSelectProps,
) {
  const { t } = useTranslate()
  const validTypes = [
    {
      icon: TypeIcon,
      name: t("whatsapp.messageTemplates.Text"),
      value: TemplateType.Text,
    },
    {
      icon: ImageIcon,
      name: t("whatsapp.messageTemplates.Image"),
      value: TemplateType.Image,
    },
    {
      icon: VideoIcon,
      name: t("whatsapp.messageTemplates.Video"),
      value: TemplateType.Video,
    },
    {
      icon: FileIcon,
      name: t("whatsapp.messageTemplates.File"),
      value: TemplateType.Document,
    },
    {
      icon: CopyIcon,
      name: t("whatsapp.messageTemplates.CarouselImage"),
      value: TemplateType.CarouselImage,
    },
    {
      icon: CopyIcon,
      name: t("whatsapp.messageTemplates.CarouselVideo"),
      value: TemplateType.CarouselVideo,
    },
    {
      icon: MapIcon,
      name: t("whatsapp.messageTemplates.Location"),
      value: TemplateType.Location,
    },
    {
      icon: StoreIcon,
      name: t("whatsapp.messageTemplates.ViewCatalog"),
      value: TemplateType.ViewCatalog,
    },
    {
      icon: StoreIcon,
      name: t("whatsapp.messageTemplates.ViewProduct"),
      value: TemplateType.ViewProduct,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4">
      {validTypes.map((validType) => (
        <Button
          className="!h-auto flex w-full items-center justify-start gap-4 truncate p-6 text-xl"
          disabled={validType.value === TemplateType.Location}
          key={validType.value}
          onClick={() => props.onSelectTemplateType(validType.value)}
          variant="secondary"
        >
          <validType.icon className="!h-6 !w-auto" size={24} />
          {validType.name}
        </Button>
      ))}
    </div>
  )
}
