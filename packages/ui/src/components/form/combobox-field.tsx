import { FormFieldWrapper } from "@aha.chat/ui/components/form/field-wrapper"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@aha.chat/ui/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover"
import { cn } from "@aha.chat/ui/lib/utils"
import type { PopoverContentProps } from "@radix-ui/react-popover"
import { Check, ChevronsUpDown } from "lucide-react"
import { useMemo, useState } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"
import type { SelectOption } from "./select-field"

type OptionItemProps = {
  option: SelectOption
  selectedValue: string | undefined
  onSelect: (value: string) => void
  disabled?: boolean
}

export const OptionItem = ({
  option,
  selectedValue,
  onSelect,
  disabled,
}: OptionItemProps) => {
  const isSelected = option.value === selectedValue
  return (
    <CommandItem disabled={disabled} onSelect={onSelect} value={option.value}>
      {option.Icon && <option.Icon className="h-4 w-4" />}
      {option.label}
      <Check
        className={cn(
          "ml-auto h-4 w-4",
          isSelected ? "opacity-100" : "opacity-0",
        )}
      />
    </CommandItem>
  )
}

type ComboboxFieldProps<T extends FieldValues> = {
  name: FieldPath<T>
  label?: string
  required?: boolean
  placeholder?: string
  description?: string
  options: SelectOption[]
  className?: string
  side?: PopoverContentProps["side"]
  triggerValueChange?: (value: string) => void
  disableValues?: string[]
}

export function ComboboxField<T extends FieldValues>({
  className,
  name,
  label,
  required,
  placeholder,
  description,
  options,
  side,
  triggerValueChange,
  disableValues,
}: ComboboxFieldProps<T>) {
  const [open, setOpen] = useState(false)

  const flattenedOptions = useMemo(
    () => options.flatMap((option) => option.children ?? [option]),
    [options],
  )

  const optionMap = useMemo(
    () =>
      new Map(flattenedOptions.map((option) => [option.value, option.label])),
    [flattenedOptions],
  )

  return (
    <FormFieldWrapper<T>
      description={description}
      label={label}
      name={name}
      required={required}
    >
      {(field) => {
        const selectedLabel = field.value ? optionMap.get(field.value) : null

        const handleSelect = (value: string) => {
          field.onChange(value as T[FieldPath<T>])
          triggerValueChange?.(value)
          setOpen(false)
        }

        return (
          <Popover modal={true} onOpenChange={setOpen} open={open}>
            <PopoverTrigger asChild>
              <Button
                aria-expanded={open}
                aria-label={label || "Select option"}
                className={cn(
                  "w-full justify-between",
                  className,
                  !field.value && "text-muted-foreground",
                )}
                role="combobox"
                variant="outline"
              >
                {selectedLabel || placeholder || "Please select..."}
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[200px] p-0"
              portal={false}
              side={side}
            >
              <Command>
                <CommandInput className="h-9" placeholder="Search..." />
                <CommandList>
                  <CommandEmpty>No record found.</CommandEmpty>
                  {options.map((option) =>
                    option.children ? (
                      <CommandGroup heading={option.label} key={option.value}>
                        {option.children.map((child) => (
                          <OptionItem
                            disabled={disableValues?.includes(child.value)}
                            key={child.value}
                            onSelect={handleSelect}
                            option={child}
                            selectedValue={field.value}
                          />
                        ))}
                      </CommandGroup>
                    ) : (
                      <OptionItem
                        disabled={disableValues?.includes(option.value)}
                        key={option.value}
                        onSelect={handleSelect}
                        option={option}
                        selectedValue={field.value}
                      />
                    ),
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )
      }}
    </FormFieldWrapper>
  )
}
