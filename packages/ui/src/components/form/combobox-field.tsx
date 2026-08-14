import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@chatbotx.io/ui/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { Check, ChevronsUpDown } from "lucide-react"
import { useMemo, useState } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"
import { CLEAR_VALUE } from "./constants"
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
    <CommandItem
      disabled={disabled}
      onSelect={() => onSelect(option.value)}
      value={option.label}
    >
      {option.icon && <option.icon className="h-4 w-4" />}
      {option.label}
      <Check
        className={cn(
          "ms-auto h-4 w-4",
          isSelected ? "opacity-100" : "opacity-0",
        )}
      />
    </CommandItem>
  )
}

export type ComboboxFieldProps<T extends FieldValues> = {
  name: FieldPath<T>
  label?: string
  required?: boolean
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  description?: string
  descriptionType?: "inline" | "tooltip"
  formItemClassName?: string
  options: SelectOption[]
  className?: string
  popoverClassName?: string
  side?: React.ComponentProps<typeof PopoverContent>["side"]
  triggerValueChange?: (value: string) => void
  disableValues?: string[]
  portal?: boolean
  allowClear?: boolean
  clearLabel?: string
  emptyValue?: null | undefined
}

export function ComboboxField<T extends FieldValues>({
  className,
  popoverClassName,
  name,
  label,
  required,
  placeholder,
  searchPlaceholder,
  emptyText,
  description,
  descriptionType = "inline",
  formItemClassName,
  options,
  side,
  triggerValueChange,
  disableValues,
  portal,
  allowClear,
  clearLabel,
  emptyValue,
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
      descriptionType={descriptionType}
      formItemClassName={formItemClassName}
      label={label}
      name={name}
      required={required}
    >
      {(field) => {
        // Resolve the label for the current value, including an empty-value
        // "none" option so a cleared selection can still show its marker.
        const selectedLabel = optionMap.get(field.value ?? "") ?? null

        const handleSelect = (value: string) => {
          if (value === CLEAR_VALUE) {
            field.onChange(emptyValue as T[FieldPath<T>])
            triggerValueChange?.("")
            setOpen(false)
            return
          }
          field.onChange(value as T[FieldPath<T>])
          triggerValueChange?.(value)
          setOpen(false)
        }

        return (
          <Popover modal={true} onOpenChange={setOpen} open={open}>
            <PopoverTrigger
              render={
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
                  <span className="min-w-0 truncate">
                    {selectedLabel || placeholder || "Please select..."}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              }
            />
            <PopoverContent
              align="start"
              className={cn("w-50 p-0", popoverClassName)}
              portal={portal}
              side={side}
            >
              <Command>
                <CommandInput
                  className="h-9"
                  placeholder={searchPlaceholder ?? "Search..."}
                />
                <CommandList>
                  <CommandEmpty>{emptyText ?? "No record found."}</CommandEmpty>
                  {allowClear && (
                    <CommandItem
                      className="text-muted-foreground"
                      onSelect={() => handleSelect(CLEAR_VALUE)}
                      value={clearLabel || "----"}
                    >
                      {clearLabel || "----"}
                      <Check
                        className={cn(
                          "ms-auto h-4 w-4",
                          field.value ? "opacity-0" : "opacity-100",
                        )}
                      />
                    </CommandItem>
                  )}
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
