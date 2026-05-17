import { waitStepDateTypes } from "@chatbotx.io/flow-config"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"

type DateTypeSelectProps = {
  name: string
}

const DateTypeSelect = (props: DateTypeSelectProps) => {
  const t = useTranslations()

  const dateTypes = [
    {
      value: waitStepDateTypes.enum.specific,
      label: t("flows.wait.specific"),
    },
    {
      value: waitStepDateTypes.enum.dynamic,
      label: t("flows.wait.dynamic"),
    },
  ]

  return <SelectField name={props.name} options={dateTypes} />
}

export default DateTypeSelect
