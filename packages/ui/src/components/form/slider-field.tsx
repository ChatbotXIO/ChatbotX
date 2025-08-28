import type { FieldPath, FieldValues } from "react-hook-form"
import { Slider } from "../ui/slider"
import { FormFieldWrapper } from "./field-wrapper"

type SliderFieldProps<T extends FieldValues> = {
  name: FieldPath<T>
  label?: string
  description?: string
  isRequired?: boolean
} & React.ComponentProps<typeof Slider>

export function SliderField<T extends FieldValues>({
  name,
  label,
  description,
  isRequired,
  ...props
}: SliderFieldProps<T>) {
  const { min, max, step } = props
  return (
    <FormFieldWrapper
      description={description}
      isRequired={isRequired}
      label={label}
      name={name}
    >
      {(field) => (
        <div className="flex items-center gap-4">
          <Slider
            defaultValue={[field.value]}
            max={max}
            min={min}
            onValueChange={(value) => field.onChange(value[0])}
            step={step}
          />
          <div className="w-20 shrink-1">
            <span className="font-medium text-sm">{field.value}</span>
          </div>
        </div>
      )}
    </FormFieldWrapper>
  )
}
