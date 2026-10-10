"use client"

import type { GoogleAdsConsent } from "@chatbotx.io/database/partials"
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  useFormField,
} from "@chatbotx.io/ui/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import { useTranslations } from "next-intl"
import {
  type ControllerRenderProps,
  useFormContext,
  useWatch,
} from "react-hook-form"
import { GoogleAdsTemplateField } from "./google-ads-template-field"
import { TranslatedFieldMessage } from "./translated-field-message"

type ConsentSettingName = keyof GoogleAdsConsent
type ConsentSourceType = GoogleAdsConsent[ConsentSettingName]["type"]

const SOURCE_TYPES: ConsentSourceType[] = [
  "notProvided",
  "granted",
  "denied",
  "variable",
]

const SOURCE_LABEL_KEYS = {
  notProvided: "googleAds.consent.source.notProvided",
  granted: "googleAds.consent.source.granted",
  denied: "googleAds.consent.source.denied",
  variable: "googleAds.consent.source.variable",
} as const satisfies Record<ConsentSourceType, string>

/** `variable` has no static helper: its helper sits under the template input. */
const SOURCE_HELP_KEYS = {
  notProvided: "googleAds.consent.help.notProvided",
  granted: "googleAds.consent.help.granted",
  denied: "googleAds.consent.help.denied",
} as const satisfies Partial<Record<ConsentSourceType, string>>

const SETTING_LABEL_KEYS = {
  adUserData: "googleAds.consent.adUserData.label",
  adPersonalization: "googleAds.consent.adPersonalization.label",
} as const satisfies Record<ConsentSettingName, string>

type SourceSelectProps = {
  field: ControllerRenderProps<GoogleAdsConsent, `${ConsentSettingName}.type`>
  helper: string | null
  isDisabled: boolean
  onPick: (next: string) => void
}

const SourceSelect = ({
  field,
  helper,
  isDisabled,
  onPick,
}: SourceSelectProps) => {
  const t = useTranslations()
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()
  const items = SOURCE_TYPES.map((value) => ({
    value,
    label: t(SOURCE_LABEL_KEYS[value]),
  }))
  // Base UI's Select root drops aria-*, so the description ids go on the trigger.
  const describedBy =
    [helper ? formDescriptionId : null, error ? formMessageId : null]
      .filter(Boolean)
      .join(" ") || undefined

  return (
    <>
      <Select
        disabled={isDisabled}
        id={formItemId}
        items={items}
        onValueChange={(next) => {
          if (typeof next === "string") {
            // First: the change below recomputes dirtiness without the template key.
            onPick(next)
            field.onChange(next)
          }
        }}
        value={field.value ?? ""}
      >
        <FormControl>
          <SelectTrigger aria-describedby={describedBy} className="w-full">
            <SelectValue />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {helper ? <FormDescription>{helper}</FormDescription> : null}
      <TranslatedFieldMessage />
    </>
  )
}

type ConsentSourceFieldProps = {
  name: ConsentSettingName
  isDisabled: boolean
}

/**
 * One consent setting: a source select (bound to `<name>.type`, controlled so
 * `form.reset` moves the visible choice) and, for "From a contact field", the
 * template input bound to `<name>.template`. A template left over from a
 * previous choice stays in the form but is stripped by the schema on submit.
 * Reading order everywhere: label, control, helper; on `md` the label sits
 * beside the control.
 */
export const ConsentSourceField = ({
  name,
  isDisabled,
}: ConsentSourceFieldProps) => {
  const t = useTranslations()
  const { control, getValues, setValue, unregister } =
    useFormContext<GoogleAdsConsent>()
  const type = useWatch({ control, name: `${name}.type` })
  const label = t(SETTING_LABEL_KEYS[name])
  const templateName = `${name}.template` as const

  // A source that never had a template has none to validate: start it empty so
  // the user sees the translated "insert a contact field" message, not zod's.
  // Leaving "variable" again drops that injected empty key so the form is not
  // left dirty against defaults that never had it.
  const syncTemplate = (next: string) => {
    const template = getValues(templateName)
    if (next === "variable" && template === undefined) {
      setValue(templateName, "")
    } else if (next !== "variable" && template === "") {
      unregister(templateName, { keepDefaultValue: true })
    }
  }

  return (
    <div className="grid gap-x-8 gap-y-2 md:grid-cols-[17rem_minmax(0,22rem)]">
      <FormField
        control={control}
        name={`${name}.type`}
        render={({ field }) => (
          <FormItem className="contents">
            <FormLabel className="leading-snug md:col-start-1 md:min-h-9 md:items-center md:self-start">
              {label}
            </FormLabel>
            <div className="flex min-w-0 flex-col gap-1.5 md:col-start-2">
              <SourceSelect
                field={field}
                helper={
                  field.value === "variable"
                    ? null
                    : t(SOURCE_HELP_KEYS[field.value])
                }
                isDisabled={isDisabled}
                onPick={syncTemplate}
              />
            </div>
          </FormItem>
        )}
      />
      {type === "variable" ? (
        // `inert` keeps the editor read-only while a save is in flight.
        <div className="min-w-0 md:col-start-2" inert={isDisabled}>
          <GoogleAdsTemplateField
            description={t("googleAds.consent.help.variable", {
              granted: "granted",
              denied: "denied",
            })}
            label={t("googleAds.consent.templateLabel", { setting: label })}
            name={templateName}
            placeholder={t("googleAds.consent.templatePlaceholder")}
            required
          />
        </div>
      ) : null}
    </div>
  )
}
