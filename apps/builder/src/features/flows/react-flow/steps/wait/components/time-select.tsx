import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"

type TimeSelectProps = {
  name: string
}

const TimeSelect = (props: TimeSelectProps) => {
  const { name } = props
  const t = useTranslations()

  const times: { value: string; label: string }[] = []
  for (let hour = 0; hour < 24; hour++) {
    const formattedHour = hour.toString().padStart(2, "0")
    times.push({
      value: `${formattedHour}:00:00`,
      label: `${formattedHour}:00`,
    })
  }

  return (
    <SelectField
      name={name}
      options={times}
      placeholder={t("flows.wait.selectTimePlaceholder")}
    />
  )
}

export default TimeSelect
