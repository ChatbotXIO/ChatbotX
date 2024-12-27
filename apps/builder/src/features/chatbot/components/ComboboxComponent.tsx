import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormControl, FormDescription, FormItem, FormLabel } from "@/components/ui/form";

interface CustomComboboxProps<T> {
  label: string;
  description: string;
  placeholder: string;
  options: T[];
  value: string | null;
  onChange: (value: string | null) => void;
  getOptionLabel: (option: T) => string;
  getOptionValue: (option: T) => string | number;
  openPopover: boolean
  setoOpenPopover: (openPopover: boolean) => void
}

export function ComboboxComponent<T>({
  label,
  description,
  placeholder,
  options,
  value,
  onChange,
  getOptionLabel,
  getOptionValue,
  openPopover,
  setoOpenPopover
}: CustomComboboxProps<T>) {

  const selectedOption = options.find((opt) => getOptionValue(opt) === value);

  return (
    <FormItem>
      <FormLabel>{label}</FormLabel>
      <FormDescription>{description}</FormDescription>
      <FormControl>
        <Popover open={openPopover} onOpenChange={setoOpenPopover}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox">
              {selectedOption ? getOptionLabel(selectedOption) : placeholder}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0">
            <Command>
              <CommandInput placeholder={`Search ${label.toLowerCase()}...`} />
              <CommandList>
                {options.length === 0 && (
                  <CommandEmpty>No {label.toLowerCase()} found.</CommandEmpty>
                )}
                <CommandItem
                  value="none"
                  onSelect={() => {
                    { onChange(null); setoOpenPopover(false) }
                  }}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${value === null ? "opacity-100" : "opacity-0"}`}
                  />
                  None
                </CommandItem>
                {options.map((option, index) => (
                  <CommandItem
                    key={index}
                    value={getOptionValue(option).toString()}
                    onSelect={() => { onChange(getOptionValue(option).toString()); setoOpenPopover(false) }}
                  >
                    <Check
                      className={`mr-2 h-4 w-4 ${value === getOptionValue(option) ? "opacity-100" : "opacity-0"
                        }`}
                    />
                    {getOptionLabel(option)}
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </FormControl>
    </FormItem>
  );
}
