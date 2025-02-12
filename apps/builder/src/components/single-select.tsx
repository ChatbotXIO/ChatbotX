"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { SelectProps } from "@radix-ui/react-select"
import { type ComponentType, forwardRef } from "react"
import { Controller, useFormContext } from "react-hook-form"
import { FormControl } from "./ui/form"

type SingleOptions = {
  /** The text to display for the option. */
  label: string
  /** The unique value associated with the option. */
  value: string
  /** Optional icon component to display alongside the option. */
  icon?: ComponentType<{ className?: string }>
}

interface SingleSelectProps extends SelectProps {
  name: string
  options: SingleOptions[]
  placeholder?: string
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  onChange?: (...event: any[]) => void
}

export const SingleSelect = forwardRef<HTMLButtonElement, SingleSelectProps>(
  ({ name, options, placeholder, onChange, ...rest }, ref) => {
    const { control } = useFormContext()

    return (
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select
            onValueChange={field.onChange}
            defaultValue={field.value}
            {...field}
            {...rest}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((o) => (
                <SelectItem value={o.value} key={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    )
  },
)

SingleSelect.displayName = "SingleSelect"
