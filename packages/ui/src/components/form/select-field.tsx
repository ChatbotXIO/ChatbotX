import { logger } from "@aha.chat/ui/lib/logger"
import type { SelectProps } from "@radix-ui/react-select"
import ky from "ky"
import type { LucideIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select"
import { FormFieldWrapper } from "./field-wrapper"

export type SingleSelectOption = {
  value: string
  label: string
  Icon?: LucideIcon
  disabled?: boolean
}

export type SelectOption = SingleSelectOption & {
  children?: SelectOption[]
}

export type SelectFieldProps<T extends FieldValues> = SelectProps & {
  name: FieldPath<T>
  label?: string
  placeholder?: string
  description?: string
  options?: SelectOption[]
  fetchOptionsUrl?: string
  className?: string
  allowClear?: boolean
  triggerValueChange?: (value?: string) => void
  disableValues?: string[]
} & React.ComponentProps<typeof Select>

type SelectOptionItem = {
  value: string
  label: string
  disabled?: boolean
}

const CLEAR_VALUE = "__clear__"

const SelectClear = ({
  children,
  ...props
}: Omit<React.ComponentProps<typeof SelectItem>, "value">) => (
  <SelectItem className="opacity-50" value={CLEAR_VALUE} {...props}>
    {children ?? "----"}
  </SelectItem>
)

export const SelectField = <T extends FieldValues>(
  props: SelectFieldProps<T>,
) => {
  const {
    name,
    label,
    required,
    placeholder,
    description,
    options = [],
    fetchOptionsUrl,
    allowClear,
    triggerValueChange,
    disableValues,
    ...rest
  } = props

  const [fetchedOptions, setFetchedOptions] = useState<SelectOptionItem[]>([])

  const normalizedOptions = useMemo<SelectOptionItem[]>(
    () => (options.length > 0 ? options : fetchedOptions),
    [options, fetchedOptions],
  )

  const optionItems = useMemo(
    () =>
      normalizedOptions.map((option) => (
        <SelectItem
          disabled={option.disabled ?? disableValues?.includes(option.value)}
          key={option.value}
          value={option.value}
        >
          {option.label}
        </SelectItem>
      )),
    [normalizedOptions, disableValues],
  )

  useEffect(() => {
    if (!fetchOptionsUrl || options.length > 0) {
      return
    }

    let isCancelled = false

    const fetchOptions = async () => {
      try {
        const body = await ky
          .get<{ data: { id: string; name: string }[] }>(fetchOptionsUrl)
          .json()

        if (!isCancelled) {
          setFetchedOptions(
            body.data.map((v) => ({ value: v.id, label: v.name })),
          )
        }
      } catch (error) {
        if (!isCancelled) {
          logger.error("Error fetching options:", error)
          setFetchedOptions([])
        }
      }
    }

    fetchOptions()

    return () => {
      isCancelled = true
    }
  }, [fetchOptionsUrl, options.length])

  return (
    <FormFieldWrapper<T>
      description={description}
      label={label}
      name={name}
      required={required}
    >
      {(field) => {
        const handleSelectChange = (value: string) => {
          if (value === CLEAR_VALUE) {
            field.onChange(undefined as T[FieldPath<T>])
            triggerValueChange?.(undefined)
            return
          }
          field.onChange(value as T[FieldPath<T>])
          triggerValueChange?.(value)
        }

        return (
          <Select
            onValueChange={handleSelectChange}
            value={field.value ?? ""}
            {...rest}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {allowClear && <SelectClear />}
              {optionItems}
            </SelectContent>
          </Select>
        )
      }}
    </FormFieldWrapper>
  )
}
