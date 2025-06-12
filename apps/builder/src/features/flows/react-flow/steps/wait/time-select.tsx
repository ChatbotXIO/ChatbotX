import { SelectField } from "@/components/form/select-field"

export const TimeSelect = ({ name }: { name: string }) => {
  const times = []
  for (let hour = 0; hour < 24; hour++) {
    const formattedHour = hour.toString().padStart(2, "0")
    times.push({
      value: `${formattedHour}:00:00`,
      label: `${formattedHour}:00`,
    })
  }

  return <SelectField name={name} placeholder="Select a time" options={times} />
}
