import { FormFieldWrapper } from "@/components/form/field-wrapper"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Check, ChevronsUpDown } from "lucide-react"
import { useState } from "react"
import type { FieldPath, FieldValues } from "react-hook-form"

interface SelectFieldProps<T extends FieldValues> {
  name: FieldPath<T>
  label?: string
  isRequired?: boolean
  placeholder?: string
  description?: string
  defaultValue?: string
  options: { value: string; label: string }[]
}

export function ComboboxField<T extends FieldValues>({
  name,
  label,
  isRequired,
  placeholder,
  description,
  options,
  // ...props
}: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false)

  return (
    <FormFieldWrapper<T>
      name={name}
      label={label}
      isRequired={isRequired}
      description={description}
    >
      {(field) => (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              // role="combobox"
              aria-expanded={open}
              className={cn(
                "justify-between w-full",
                !field.value && "text-muted-foreground",
              )}
            >
              {field.value
                ? options.find((option) => option.value === field.value)?.label
                : placeholder || "Please select..."}
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0">
            <Command>
              <CommandInput placeholder="Search..." className="h-9" />
              <CommandList>
                <CommandEmpty>No record found.</CommandEmpty>
                <CommandGroup>
                  {options.map((option) => (
                    <CommandItem
                      value={option.label}
                      key={option.value}
                      onSelect={() => {
                        field.onChange(option.value as T[FieldPath<T>])
                        setOpen(false)
                      }}
                    >
                      {option.label}
                      <Check
                        className={cn(
                          "ml-auto",
                          option.value === field.value
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </FormFieldWrapper>
  )
}
