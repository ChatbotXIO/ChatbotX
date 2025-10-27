import { logger } from "@aha.chat/ui/lib/logger"
import type { SelectProps } from "@radix-ui/react-select"
import ky from "ky"
import { useEffect, useState } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { FormFieldWrapper } from "./field-wrapper"

type SelectFieldProps<T extends FieldValues> = SelectProps & {
  name: FieldPath<T>
  label?: string
  placeholder?: string
  description?: string
  options?: { value: string; label: string }[]
  fetchOptionsUrl?: string
  className?: string
  allowClear?: boolean
  onSelectChange?: (value?: string) => void
} & React.ComponentProps<typeof Select>

function SelectClear({
  className,
  children,
  value = null as unknown as string,
  ...props
}: Omit<React.ComponentProps<typeof SelectItem>, "value"> & {
  value?: string
}) {
  return (
    <SelectItem className="opacity-50" key={"reset"} value={value} {...props}>
      {children ?? "----"}
    </SelectItem>
  )
}

export function SelectField<T extends FieldValues>(props: SelectFieldProps<T>) {
  const {
    name,
    label,
    required,
    placeholder,
    description,
    options = [],
    fetchOptionsUrl,
    allowClear,
    onSelectChange,
    ...rest
  } = props

  const [stateOptions, setStateOptions] = useState<
    { value: string; label: string }[]
  >([])

  useEffect(() => {
    if (options && options.length > 0) {
      setStateOptions(options)
    } else if (fetchOptionsUrl) {
      const fetchOptions = async () => {
        try {
          const body = await ky
            .get<{ data: { id: string; name: string }[] }>(fetchOptionsUrl)
            .json()

          setStateOptions(
            body.data.map((v) => ({ value: v.id, label: v.name })),
          )
        } catch (error) {
          logger.error("Error fetching options:", error)
        }
      }

      fetchOptions()
    }
  }, [options, fetchOptionsUrl])

  return (
    <FormFieldWrapper<T>
      description={description}
      required={required}
      label={label}
      name={name}
    >
      {(field) => (
        <Select
          defaultValue={field.value}
          onValueChange={(value: string) => {
            field.onChange(value as T[FieldPath<T>])
            onSelectChange?.(value)
          }}
          {...rest}
          {...field}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {allowClear && <SelectClear />}
            {stateOptions.map((option) => (
              <SelectItem key={option.value} value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormFieldWrapper>
  )
}
