import { FormInput } from "@/components/form-input"
import { SingleSelect } from "@/components/single-select"

export const TimeSelect = ({ name }: { name: string }) => {
  const times = []
  for (let hour = 0; hour < 24; hour++) {
    const formattedHour = hour.toString().padStart(2, "0")
    times.push({
      value: `${formattedHour}:00:00`,
      label: `${formattedHour}:00`,
    })
  }

  return (
    <FormInput name={name} label="">
      <SingleSelect name={name} placeholder="Select a time" options={times} />
    </FormInput>
  )
}
