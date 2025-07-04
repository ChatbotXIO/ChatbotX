import { FormFieldWrapper } from "@/components/form/field-wrapper"
import { callAPI } from "@/lib/swr"
import { createId } from "@paralleldrive/cuid2"
import { TagInput, type Tag } from "emblor"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { useFormContext, type FieldValues } from "react-hook-form"
import type { TagCollection } from "../schemas"

interface TagMultiSelectProps {
  name: string
  label: string
  isRequired: boolean
}

export function TagMultiSelect({
  name,
  label,
  isRequired,
}: TagMultiSelectProps) {
  const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null)
  const [tags, setTags] = useState<Tag[]>([])
  const { setValue, getValues } = useFormContext()

  useEffect(() => {
    const defaultTags: string[] = getValues(name) ?? []
    setTags(
      defaultTags.map((t) => ({
        id: createId(),
        text: t,
      })),
    )
  }, [name, getValues])

  const { chatbotId } = useParams<{ chatbotId: string }>()

  // Get tags list
  const { data: tagsData } = callAPI<TagCollection>(
    `/api/chatbots/${chatbotId}/tags?perPage=9999`,
  )
  const tagOptions = (tagsData?.data ?? []).map((v) => ({
    text: v.name,
    id: v.id,
  }))

  return (
    <FormFieldWrapper<FieldValues>
      name={name}
      label={label}
      isRequired={isRequired}
    >
      {(field) => (
        <TagInput
          {...field}
          enableAutocomplete={true}
          autocompleteOptions={tagOptions}
          // placeholder="Enter a topic"
          tags={tags}
          className="sm:min-w-[450px]"
          setTags={(newTags) => {
            setTags(newTags)
            setValue(
              name,
              (newTags as Tag[]).map((t) => t.text),
              { shouldValidate: true },
            )
          }}
          activeTagIndex={activeTagIndex}
          setActiveTagIndex={setActiveTagIndex}
        />
      )}
    </FormFieldWrapper>
  )
}
