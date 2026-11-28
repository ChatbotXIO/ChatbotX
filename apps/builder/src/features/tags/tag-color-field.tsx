"use client"

import { ColorPickerField } from "@chatbotx.io/ui/components/form/color-picker-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useTranslations } from "next-intl"
import { useFormContext, useWatch } from "react-hook-form"

/** First color offered when an uncolored tag gets one. */
export const DEFAULT_TAG_COLOR = "#3B82F6"

type TagColorFormValues = {
  color?: string | null
}

/**
 * The optional color of a tag inside a tag form. No color is a real state
 * (null clears it on update), so the picker only appears once a color is
 * chosen, with a button to go back to none. Plain `#RRGGBB`: tag colors carry
 * no alpha.
 */
export function TagColorField() {
  const t = useTranslations("tagColor")
  const { control, setValue } = useFormContext<TagColorFormValues>()
  const color = useWatch({ control, name: "color" })

  const setColor = (next: string | null) =>
    setValue("color", next, { shouldDirty: true, shouldValidate: true })

  return (
    <div className="grid gap-1.5">
      {color ? (
        <>
          <ColorPickerField alpha={false} label={t("label")} name="color" />
          <Button
            className="w-fit"
            onClick={() => setColor(null)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("remove")}
          </Button>
        </>
      ) : (
        <>
          <span className="font-medium text-sm">{t("label")}</span>
          <Button
            className="w-fit"
            onClick={() => setColor(DEFAULT_TAG_COLOR)}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("choose")}
          </Button>
        </>
      )}
    </div>
  )
}
