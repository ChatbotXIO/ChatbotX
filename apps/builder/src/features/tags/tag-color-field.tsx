"use client"

import InputColor from "@chatbotx.io/ui/components/ui/vatsalpipalava/input-color"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  isVeryLightColor,
  TAG_GRID_LIGHT_FILL_TEXT_COLOR,
  TAG_PRESET_COLORS,
} from "@chatbotx.io/utils/color"
import { CheckIcon, PipetteIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFormContext, useWatch } from "react-hook-form"

/** Color the custom picker opens on while the tag has none. */
const DEFAULT_TAG_COLOR = "#3B82F6"

type TagColorFormValues = {
  name?: string
  color?: string | null
}

/** 14px/22px regular, same as every other label in the tag dialogs. */
const LABEL_CLASS = "block font-normal text-sm leading-[22px]"

const SWATCH_CLASS =
  "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * The optional color of a tag inside a tag form: one row of square swatches,
 * the first opening the custom picker, then the presets, and a pill previewing
 * the tag name in the chosen color. No color is a real state (an older tag
 * may have none): nothing is preselected then, and once a color is picked it
 * can be changed here but not cleared. Plain
 * `#RRGGBB`: tag colors carry no alpha.
 */
export function TagColorField() {
  const t = useTranslations("tagColor")
  const { control, setValue } = useFormContext<TagColorFormValues>()
  const color = useWatch({ control, name: "color" })
  const name = useWatch({ control, name: "name" })

  const setColor = (next: string | null) =>
    setValue("color", next, { shouldDirty: true, shouldValidate: true })

  const selected = color?.toUpperCase()
  const isPreset = TAG_PRESET_COLORS.some((preset) => preset === selected)
  const customColor = color && !isPreset ? color : null
  const isCustom = customColor !== null
  const trimmedName = name?.trim()
  // White on every preset, except a nearly white custom color (same rule as
  // the composer grid), where white would vanish.
  const onColor =
    customColor && isVeryLightColor(customColor)
      ? TAG_GRID_LIGHT_FILL_TEXT_COLOR
      : "#FFFFFF"

  return (
    <div>
      <span className={LABEL_CLASS}>{t("label")}</span>
      <div className="mt-2 mb-6 flex flex-wrap gap-[14px]">
        <InputColor
          alpha={false}
          className="mt-0"
          hideInput
          onChange={setColor}
          trigger={
            <button
              aria-label={t("choose")}
              aria-pressed={isCustom}
              className={cn(
                SWATCH_CLASS,
                !isCustom &&
                  "bg-[#EAECF0] text-[#344054] dark:bg-muted dark:text-muted-foreground",
              )}
              style={customColor ? { backgroundColor: customColor } : undefined}
              type="button"
            >
              {isCustom ? (
                <CheckIcon
                  aria-hidden
                  className="size-4"
                  style={{ color: onColor }}
                />
              ) : (
                <PipetteIcon aria-hidden className="size-4" />
              )}
            </button>
          }
          value={color || DEFAULT_TAG_COLOR}
        />
        {TAG_PRESET_COLORS.map((preset) => (
          <button
            aria-label={t("presetLabel", { color: preset })}
            aria-pressed={selected === preset}
            className={SWATCH_CLASS}
            key={preset}
            onClick={() => setColor(preset)}
            style={{ backgroundColor: preset }}
            title={preset}
            type="button"
          >
            {selected === preset && (
              <CheckIcon aria-hidden className="size-4 text-white" />
            )}
          </button>
        ))}
      </div>
      <span className={LABEL_CLASS}>{t("previewLabel")}</span>
      <span
        className={cn(
          "mt-2 mb-6 block w-fit max-w-full truncate rounded-xl px-2 py-[3px] font-normal text-xs leading-4",
          !color && "bg-muted text-muted-foreground",
        )}
        data-testid="tag-color-preview"
        style={color ? { backgroundColor: color, color: onColor } : undefined}
      >
        {trimmedName || t("previewPlaceholder")}
      </span>
    </div>
  )
}
