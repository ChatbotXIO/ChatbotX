import type { ReactNode } from "react"
import { useFormContext } from "react-hook-form"
import { FormControl, FormItem, FormLabel, FormMessage } from "./ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"

export const FormSelect = ({
  name,
  label,
  isRequired = true,
  items = [],
  placeholder,
}: {
  name: string
  label: ReactNode
  placeholder?: string
  isRequired?: boolean
  items: Array<{ name: string; value: string }>
}) => {
  const { getValues, setValue } = useFormContext()

  return (
    <FormItem>
      {label && (
        <FormLabel className="flex gap-1">
          {label}
          {!isRequired && (
            <span className="text-xxs self-start font-normal">(optional)</span>
          )}
        </FormLabel>
      )}
      <Select
        onValueChange={(e) => setValue(name, e)}
        defaultValue={getValues(name)}
      >
        <FormControl>
          <SelectTrigger>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <FormMessage />
    </FormItem>
  )
}
