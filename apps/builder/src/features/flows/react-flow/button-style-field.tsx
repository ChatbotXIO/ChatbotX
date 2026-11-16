"use client"

import {
  type ButtonStyle,
  type ButtonStyleSupport,
  getChannelFlowPolicy,
} from "@chatbotx.io/flow-config"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useWatch } from "react-hook-form"

/**
 * The styles the button dialog offers, or `null` to hide the picker. Read off
 * the channel's flow policy (never by naming a channel), and never for a quick
 * reply, which no channel styles.
 */
export const resolveButtonStylePicker = (props: {
  channel: string | undefined
  isQuickReply: boolean
}): ButtonStyleSupport | null =>
  props.isQuickReply
    ? null
    : (getChannelFlowPolicy(props.channel)?.buttonStyles ?? null)

const styleLabelKeys = {
  primary: "fields.button.style.options.primary",
  secondary: "fields.button.style.options.secondary",
  link: "fields.button.style.options.link",
} as const satisfies Record<ButtonStyle, string>

/**
 * The styles listed besides the "(default)" entry: every style but the
 * channel default, which that entry already stands for.
 */
export const buttonStyleMenuOptions = (
  support: ButtonStyleSupport,
): ButtonStyle[] => support.options.filter((style) => style !== support.default)

/**
 * The select's shown value: the default style (set explicitly, e.g. through
 * the public API) shows as the "(default)" entry, since the menu does not
 * list it. Display only — the stored value is left as is.
 */
export const displayedButtonStyle = (
  value: string | undefined,
  support: ButtonStyleSupport,
): string => (value && value !== support.default ? value : "")

/**
 * The button's `style`. The "(default)" entry clears it, so the button
 * follows the channel default; an unset style is sent as that default.
 */
export function ButtonStyleField({ support }: { support: ButtonStyleSupport }) {
  const t = useTranslations()
  const style = useWatch<{ style?: string }, "style">({ name: "style" })
  const options = useMemo(
    () =>
      buttonStyleMenuOptions(support).map((option) => ({
        value: option,
        label: t(styleLabelKeys[option]),
      })),
    [support, t],
  )
  const defaultLabel = t("fields.button.style.default", {
    style: t(styleLabelKeys[support.default]),
  })

  return (
    <SelectField
      allowClear
      clearLabel={defaultLabel}
      description={t("fields.button.style.description")}
      label={t("fields.button.style.label")}
      name="style"
      options={options}
      placeholder={defaultLabel}
      // Overrides SelectField's `field.value` (its props spread after it).
      value={displayedButtonStyle(style, support)}
    />
  )
}
