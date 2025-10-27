import { useState } from "react"
import { useFormContext, type FieldPath, type FieldValues } from "react-hook-form"
import {
  Select,
} from "../ui/select"
import { FormFieldWrapper } from "./field-wrapper"
import { TagInput, type Tag } from "../tag-input"

type TagInputFieldProps<T extends FieldValues> = {
  name: FieldPath<T>
  label?: string
  placeholder?: string
  description?: string
  autocompleteOptions?: Tag[]
  fetchOptionsUrl?: string
  className?: string
} & React.ComponentProps<typeof Select>

export function TagInputField<T extends FieldValues>(props: TagInputFieldProps<T>) {
  const {
    name,
    label,
    required,
    placeholder,
    description,
    ...tagInputProps
  } = props

  const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null)
  const [tags, setTags] = useState<Tag[]>([])
  const { setValue } = useFormContext()

  return (
    <FormFieldWrapper<T>
      description={description}
      required={required}
      label={label}
      name={name}
    >
      {(field) => (
        <TagInput
        {...field}
        {...tagInputProps}

        activeTagIndex={activeTagIndex}
        setActiveTagIndex={setActiveTagIndex}
        placeholder={placeholder}
        className="sm:min-w-[450px]"
        enableAutocomplete={true}
        tags={field.value}
        setTags={(value) => {
          console.log(value)
          setTags(value)
            // setValue(
            //   name,
            //   value.map((t) => t.text),
            //   { shouldValidate: true },
            // )
        }}
        />
      )}
    </FormFieldWrapper>
  )
}
