import { FormFieldWrapper } from "@aha.chat/ui/components/form/field-wrapper"
import { type Tag, TagInput } from "@aha.chat/ui/components/tag-input"
import { createId } from "@paralleldrive/cuid2"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { type FieldValues, useFormContext } from "react-hook-form"
import { callAPI } from "@/lib/swr"
import type { TagCollection } from "../schemas"

type TagMultiSelectProps = {
  name: string
  label: string
  required: boolean
}

export function TagMultiSelect({ name, label, required }: TagMultiSelectProps) {
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
      label={label}
      name={name}
      required={required}
    >
      {(field) => (
        <TagInput
          {...field}
          activeTagIndex={activeTagIndex}
          autocompleteOptions={tagOptions}
          // placeholder="Enter a topic"
          className="sm:min-w-[450px]"
          enableAutocomplete={true}
          setActiveTagIndex={setActiveTagIndex}
          setTags={(newTags) => {
            setTags(newTags)
            setValue(
              name,
              (newTags as Tag[]).map((t) => t.text),
              { shouldValidate: true },
            )
          }}
          tags={tags}
        />
      )}
    </FormFieldWrapper>
  )
}
