"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  CopyIcon,
  FileIcon,
  ImageIcon,
  MapIcon,
  StoreIcon,
  TypeIcon,
  VideoIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { TemplateType } from "@/features/integration-whatsapp/message-templates/type"

type WhatsappMessageTemplateTypeSelectProps = {
  onSelectTemplateType: (templateType: TemplateType) => void
}

export function WhatsappMessageTemplateTypeSelect(
  props: WhatsappMessageTemplateTypeSelectProps,
) {
  const t = useTranslations()

  const validTypes = [
    {
      icon: TypeIcon,
      name: t("whatsapp.messageTemplate.text.label"),
      value: TemplateType.Text,
    },
    {
      icon: ImageIcon,
      name: t("whatsapp.messageTemplate.image.label"),
      value: TemplateType.Image,
    },
    {
      icon: VideoIcon,
      name: t("whatsapp.messageTemplate.video.label"),
      value: TemplateType.Video,
    },
    {
      icon: FileIcon,
      name: t("whatsapp.messageTemplate.document.label"),
      value: TemplateType.Document,
    },
    {
      icon: CopyIcon,
      name: t("whatsapp.messageTemplate.carouselImage.label"),
      value: TemplateType.CarouselImage,
    },
    {
      icon: CopyIcon,
      name: t("whatsapp.messageTemplate.carouselVideo.label"),
      value: TemplateType.CarouselVideo,
    },
    {
      icon: MapIcon,
      name: t("whatsapp.messageTemplate.location.label"),
      value: TemplateType.Location,
    },
    {
      icon: StoreIcon,
      name: t("whatsapp.messageTemplate.viewCatalog.label"),
      value: TemplateType.ViewCatalog,
    },
    {
      icon: StoreIcon,
      name: t("whatsapp.messageTemplate.viewProduct.label"),
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
