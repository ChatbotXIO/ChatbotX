import { Children, type ReactNode } from "react"
import { useFormContext } from "react-hook-form"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form"
import { Input } from "./ui/input"
import { Textarea } from "./ui/textarea"

type InputType = "input" | "textarea"

export const FormInput = ({
  name,
  label,
  inputType = "input",
  placeholder = "",
  isRequired = true,
  children,
}: {
  name: string
  label: ReactNode
  inputType?: InputType
  placeholder?: string
  isRequired?: boolean
  children?: ReactNode
}) => {
  const { control } = useFormContext()
  const hasChildren = Children.count(children) > 0

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
          {hasChildren ? (
            children
          ) : (
            <FormControl>
              {inputType === "input" ? (
                <Input placeholder={placeholder} {...field} />
              ) : (
                <Textarea placeholder={placeholder} {...field} />
              )}
            </FormControl>
          )}

          <FormMessage />
        </FormItem>
      )}
    />
  )
}
