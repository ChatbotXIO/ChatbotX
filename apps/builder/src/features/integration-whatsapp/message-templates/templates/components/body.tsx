import { Textarea } from "@/components/ui/textarea"
import { useTranslate } from "@tolgee/react"
import { useState, useEffect } from "react"
import { useFormContext } from "react-hook-form"
import { useDebouncedCallback } from "use-debounce"

export const TemplateBody = ({
  parentName,
}: {
  parentName: string
}) => {
  const { t } = useTranslate()
  const { getValues, setValue } = useFormContext()

  const [localBody, setLocalBody] = useState(
    () => getValues(`${parentName}.text`) || "",
  )
  const [showForm, setShowForm] = useState(false)

  const handleChange = useDebouncedCallback((value) => {
    setValue(`${parentName}.text`, value, { shouldValidate: true })
  }, 100)

  useEffect(() => {
    if (!showForm) {
      setLocalBody(getValues(`${parentName}.text`) || "")
    }
  }, [getValues, parentName, showForm])

  const handleStartEditing = () => {
    setLocalBody(getValues(`${parentName}.text`) || "")
    setShowForm(true)
  }
  const onChangeValue = (value: string) => {
    setLocalBody(value)
    handleChange(value)

    // Find all variable patterns like {{1}}, {{2}}, etc.
    const variableMatches = value.match(/\{\{(\d+)\}\}/g) || []

    if (variableMatches.length === 0) {
      // No variables found, clear the array
      setValue(`${parentName}.variables`, [], { shouldValidate: true })
    } else {
      let index = 1
      const values = getValues(`${parentName}.variables`)
      const newValues = []
      for (const match of variableMatches) {
        if (match === `{{${index}}}`) {
          index++
          newValues.push(values.length ? values.shift() : "")
        }
      }

      // Update the variables array
      setValue(`${parentName}.variables`, newValues, { shouldValidate: true })
    }
  }

  const addParam = () => {
    const values = getValues(`${parentName}.variables`)
    setLocalBody(`${localBody} {{${values.length + 1}}}`)
    handleChange(`${localBody} {{${values.length + 1}}}`)
    setValue(`${parentName}.variables`, [...(values || []), ""], {
      shouldValidate: true,
    })
  }

  return (
    <>
      {!showForm ? (
        <pre
          className="cursor-pointer"
          onClick={handleStartEditing}
          onKeyUp={() => {}}
        >
          {getValues(`${parentName}.text`) || `---- ${t("common.edit")} ----`}
        </pre>
      ) : (
        <div className="flex flex-col gap-2">
          <Textarea
            autoFocus
            placeholder="Enter text"
            value={localBody}
            maxLength={1024}
            onChange={(e) => onChangeValue(e.target.value)}
          />
          <div
            className="flex justify-end hover:underline cursor-pointer text-xs"
            onClick={addParam}
            onKeyUp={() => {}}
          >
            {t("common.addVariable")}
          </div>
        </div>
      )}
    </>
  )
}
