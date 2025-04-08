"use client"

import { useTranslate } from "@tolgee/react"
import { TemplateType } from "@/features/integration-whatsapp/message-templates/type"
import { Button } from "@/components/ui/button"
import {
  TypeIcon,
  ImageIcon,
  VideoIcon,
  FileIcon,
  CopyIcon,
  MapIcon,
  StoreIcon,
} from "lucide-react"

export function TemplateTypeSelect({
  onSelectTemplateType,
}: {
  onSelectTemplateType: (templateType: TemplateType) => void
}) {
  const { t } = useTranslate()
  const validTypes = [
    {
      icon: <TypeIcon size={24} className="!h-6 !w-auto" />,
      name: t("whatsapp.messageTemplates.Text"),
      value: TemplateType.Text,
    },
    {
      icon: <ImageIcon size={24} className="!h-6 !w-auto" />,
      name: t("whatsapp.messageTemplates.Image"),
      value: TemplateType.Image,
    },
    {
      icon: <VideoIcon size={24} className="!h-6 !w-auto" />,
      name: t("whatsapp.messageTemplates.Video"),
      value: TemplateType.Video,
    },
    {
      icon: <FileIcon size={24} className="!h-6 !w-auto" />,
      name: t("whatsapp.messageTemplates.File"),
      value: TemplateType.Document,
    },
    {
      icon: <CopyIcon size={24} className="!h-6 !w-auto" />,
      name: t("whatsapp.messageTemplates.CarouselImage"),
      value: TemplateType.CarouselImage,
    },
    {
      icon: <CopyIcon size={24} className="!h-6 !w-auto" />,
      name: t("whatsapp.messageTemplates.CarouselVideo"),
      value: TemplateType.CarouselVideo,
    },
    {
      icon: <MapIcon size={24} className="!h-6 !w-auto" />,
      name: t("whatsapp.messageTemplates.Location"),
      value: TemplateType.Location,
    },
    {
      icon: <StoreIcon size={24} className="!h-6 !w-auto" />,
      name: t("whatsapp.messageTemplates.ViewCatalog"),
      value: TemplateType.ViewCatalog,
    },
    {
      icon: <StoreIcon size={24} className="!h-6 !w-auto" />,
      name: t("whatsapp.messageTemplates.ViewProduct"),
      value: TemplateType.ViewProduct,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4">
      {validTypes.map((t) => (
        <Button
          key={t.value}
          className="flex justify-start items-center w-full gap-4 p-6 !h-auto text-xl"
          variant="secondary"
          disabled={t.value === TemplateType.Location}
          onClick={() => onSelectTemplateType(t.value)}
        >
          {t.icon}
          {t.name}
        </Button>
      ))}
    </div>
  )
}
