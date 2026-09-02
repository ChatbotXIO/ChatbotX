"use client"

import type { DynamicImageDocument } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useTranslations } from "next-intl"
import { useState } from "react"
import {
  DYNAMIC_IMAGE_TEMPLATE_HEIGHT,
  DYNAMIC_IMAGE_TEMPLATE_WIDTH,
  DYNAMIC_IMAGE_TEMPLATES,
} from "../constants"

export type DynamicImageTemplatePickerProps = {
  onSelect: (document: DynamicImageDocument) => void
}

export function DynamicImageTemplatePicker(
  props: DynamicImageTemplatePickerProps,
) {
  const { onSelect } = props
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  const handleSelectTemplate = (templateUrl: string) => {
    // The document's image `url` is later loaded server-side (@napi-rs/canvas)
    // to bake the static background, which requires an absolute URL — unlike
    // the <img> preview below, it can't resolve a Next.js public-folder path
    // like "/dynamic-image/template-1.png" on its own.
    const absoluteUrl = new URL(templateUrl, window.location.origin).toString()
    onSelect({
      width: DYNAMIC_IMAGE_TEMPLATE_WIDTH,
      height: DYNAMIC_IMAGE_TEMPLATE_HEIGHT,
      elements: [
        {
          id: crypto.randomUUID(),
          type: "image",
          imageType: "url",
          url: absoluteUrl,
          x: 0,
          y: 0,
          width: DYNAMIC_IMAGE_TEMPLATE_WIDTH,
          height: DYNAMIC_IMAGE_TEMPLATE_HEIGHT,
          priority: false,
          imageStyle: "square",
        },
      ],
    })
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button
            className="h-auto self-start p-0"
            type="button"
            variant="link"
          >
            {t("dynamicImages.editor.template")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("dynamicImages.editor.templateDialogTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("dynamicImages.editor.templateDialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {DYNAMIC_IMAGE_TEMPLATES.map((template) => (
            <Button
              className="h-auto w-full overflow-hidden rounded-md border p-0 hover:border-primary"
              key={template.id}
              onClick={() => handleSelectTemplate(template.url)}
              type="button"
              variant="ghost"
            >
              {/* biome-ignore lint/performance/noImgElement: static public asset previewed at a fixed thumbnail size, not a route-level Next.js image */}
              <img
                alt={template.id}
                className="h-full w-full object-cover"
                height={DYNAMIC_IMAGE_TEMPLATE_HEIGHT}
                src={template.url}
                width={DYNAMIC_IMAGE_TEMPLATE_WIDTH}
              />
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
