import type { ReactNode } from "react"
import { useFormContext } from "react-hook-form"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form"
import { Input } from "./ui/input"

export const FormInput = ({
  name,
  label,
  placeholder = "",
  isRequired = true,
}: {
  name: string
  label: ReactNode
  placeholder?: string
  isRequired?: boolean
}) => {
  const { control } = useFormContext()

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          {label && (
            <FormLabel className="flex gap-1">
              {label}
              {!isRequired && (
                <span className="text-xxs self-start font-normal">
                  (optional)
                </span>
              )}
            </FormLabel>
          )}
          <FormControl>
            <Input placeholder={placeholder} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
