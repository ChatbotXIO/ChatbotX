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
import { useMemo, useState, type ReactElement } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"
import type { SelectOption } from "./select-field"

interface OptionItemProps {
  option: SelectOption
  selectedValue: string | undefined
  onSelect: (value: string) => void
}

const OptionItem = ({ option, selectedValue, onSelect }: OptionItemProps) => {
  const isSelected = option.value === selectedValue
  return (
    <CommandItem value={option.value} onSelect={onSelect}>
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

interface ComboboxFieldProps<T extends FieldValues> {
  name: FieldPath<T>
  label?: string
  required?: boolean
  placeholder?: string
  description?: string
  options: SelectOption[]
  className?: string
  side?: PopoverContentProps["side"]
  triggerValueChange?: (value: string) => void
}

export function ComboboxField<T extends FieldValues>({
  className,
  name,
  label,
  required,
  placeholder,
  description,
  options,
  side = "right",
  triggerValueChange,
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
      name={name}
      label={label}
      required={required}
      description={description}
    >
      {(field) => {
        const selectedLabel = field.value ? optionMap.get(field.value) : null

        const handleSelect = (value: string) => {
          field.onChange(value as T[FieldPath<T>])
          triggerValueChange?.(value)
          setOpen(false)
        }

        return (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                aria-label={label || "Select option"}
                className={cn(
                  "w-full justify-between",
                  className,
                  !field.value && "text-muted-foreground",
                )}
              >
                {selectedLabel || placeholder || "Please select..."}
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start" side={side}>
              <Command>
                <CommandInput placeholder="Search..." className="h-9" />
                <CommandList>
                  <CommandEmpty>No record found.</CommandEmpty>
                  {options.map((option) =>
                    option.children ? (
                      <CommandGroup key={option.value} heading={option.label}>
                        {option.children.map((child) => (
                          <OptionItem
                            key={child.value}
                            option={child}
                            selectedValue={field.value}
                            onSelect={handleSelect}
                          />
                        ))}
                      </CommandGroup>
                    ) : (
                      <OptionItem
                        key={option.value}
                        option={option}
                        selectedValue={field.value}
                        onSelect={handleSelect}
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
