import type { FieldPath, FieldValues } from "react-hook-form"
import { cn } from "../../lib/utils"
import { Label } from "../ui/label"
import { RadioGroup, RadioGroupItem } from "../ui/radio-group"
import { FormFieldWrapper } from "./field-wrapper"

type RadioGroupFieldProps<T extends FieldValues> = React.ComponentProps<
  typeof RadioGroup
> & {
  name: FieldPath<T>
  label?: string
  description?: string
  descriptionType?: "inline" | "tooltip"
  orientation?: "horizontal" | "vertical"
  options: {
    value: string
    label: string
    description?: string
    disabled?: boolean
  }[]
}

export function RadioGroupField<T extends FieldValues>({
  name,
  label,
  required,
  description,
  descriptionType = "inline",
  orientation = "vertical",
  options,
}: RadioGroupFieldProps<T>) {
  return (
    <FormFieldWrapper
      description={description}
      descriptionType={descriptionType}
      label={label}
      name={name}
      required={required}
    >
      {(field) => (
        <RadioGroup
          className={
            orientation === "horizontal"
              ? "mt-2 flex flex-row flex-wrap gap-4"
              : "mt-2 flex flex-col"
          }
          defaultValue={field.value}
          onValueChange={field.onChange}
        >
          {options.map((option) => (
            <div className="flex items-start space-x-2" key={option.value}>
              <RadioGroupItem
                aria-describedby={
                  option.description
                    ? `${name}${option.value}-description`
                    : undefined
                }
                disabled={option.disabled}
                id={name + option.value}
                key={option.value}
                value={option.value}
              />
              <div className="grid gap-1">
                <Label
                  className={cn(
                    "font-normal",
                    option.disabled && "text-muted-foreground",
                  )}
                  htmlFor={name + option.value}
                >
                  {option.label}
                </Label>
                {option.description && (
                  <p
                    className="text-muted-foreground text-xs leading-snug"
                    id={`${name}${option.value}-description`}
                  >
                    {option.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </RadioGroup>
      )}
    </FormFieldWrapper>
  )
}
