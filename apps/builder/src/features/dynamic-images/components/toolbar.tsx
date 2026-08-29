"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import {
  ChevronDownIcon,
  ImageIcon,
  PlusIcon,
  QrCodeIcon,
  TypeIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import type { DynamicImageElementType } from "./element-defaults"

type DynamicImageEditorToolbarProps = {
  onAddElement: (type: DynamicImageElementType) => void
}

export function DynamicImageEditorToolbar(
  props: DynamicImageEditorToolbarProps,
) {
  const { onAddElement } = props
  const t = useTranslations()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            <PlusIcon />
            {t("dynamicImages.editor.addElement")}
            <ChevronDownIcon className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => onAddElement("image")}>
          <ImageIcon />
          {t("dynamicImages.editor.addImage")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddElement("text")}>
          <TypeIcon />
          {t("dynamicImages.editor.addText")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddElement("qrCode")}>
          <QrCodeIcon />
          {t("dynamicImages.editor.addQrCode")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
