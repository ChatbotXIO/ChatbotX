"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
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
import { type TemplateType, templateTypes } from "../type"

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
      value: templateTypes.enum.Text,
    },
    {
      icon: ImageIcon,
      name: t("whatsapp.messageTemplate.image.label"),
      value: templateTypes.enum.Image,
    },
    {
      icon: VideoIcon,
      name: t("whatsapp.messageTemplate.video.label"),
      value: templateTypes.enum.Video,
    },
    {
      icon: FileIcon,
      name: t("whatsapp.messageTemplate.document.label"),
      value: templateTypes.enum.Document,
    },
    {
      icon: CopyIcon,
      name: t("whatsapp.messageTemplate.carouselImage.label"),
      value: templateTypes.enum.CarouselImage,
    },
    {
      icon: CopyIcon,
      name: t("whatsapp.messageTemplate.carouselVideo.label"),
      value: templateTypes.enum.CarouselVideo,
    },
    {
      icon: MapIcon,
      name: t("whatsapp.messageTemplate.location.label"),
      value: templateTypes.enum.Location,
    },
    {
      icon: StoreIcon,
      name: t("whatsapp.messageTemplate.viewCatalog.label"),
      value: templateTypes.enum.ViewCatalog,
    },
    {
      icon: StoreIcon,
      name: t("whatsapp.messageTemplate.viewProduct.label"),
      value: templateTypes.enum.ViewProduct,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4">
      {validTypes.map((validType) => (
        <Button
          className="flex h-auto! w-full items-center justify-start gap-4 truncate p-6 text-xl"
          disabled={validType.value === templateTypes.enum.Location}
          key={validType.value}
          onClick={() => props.onSelectTemplateType(validType.value)}
          variant="secondary"
        >
          <validType.icon className="h-6! w-auto!" size={24} />
          {validType.name}
        </Button>
      ))}
    </div>
  )
}
