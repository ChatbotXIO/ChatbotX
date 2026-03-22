import { SelectField } from "@aha.chat/ui/components/form/select-field"

type TimeSelectProps = {
  name: string
}

const TimeSelect = (props: TimeSelectProps) => {
  const { name } = props

  const times: { value: string; label: string }[] = []
  for (let hour = 0; hour < 24; hour++) {
    const formattedHour = hour.toString().padStart(2, "0")
    times.push({
      value: `${formattedHour}:00:00`,
      label: `${formattedHour}:00`,
    })
  }

  return <SelectField name={name} options={times} placeholder="Select a time" />
}

export default TimeSelect
