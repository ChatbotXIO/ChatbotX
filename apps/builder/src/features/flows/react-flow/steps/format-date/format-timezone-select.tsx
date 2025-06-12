import { FormInput } from "@/components/form-input"
import { SingleSelect } from "@/components/single-select"
import { FormatTimezone } from "@/features/flows/react-flow/blocks/format-date/schema"
import { useTranslate } from "@tolgee/react"
import { useMemo } from "react"

export const FormatTimezoneSelect = ({ name }: { name: string }) => {
  const { t } = useTranslate()
  const options = useMemo(() => {
    return [
      {
        value: FormatTimezone.Contact,
        label: t("flows.FormatTimezone.Contact"),
      },
      {
        value: FormatTimezone.Account,
        label: t("flows.FormatTimezone.Account"),
      },
    ]
  }, [t])

  return (
    <FormInput name={name} label={t("flows.FormatTimezone.label")}>
      <SingleSelect name={name} placeholder="Select format" options={options} />
    </FormInput>
  )
}
