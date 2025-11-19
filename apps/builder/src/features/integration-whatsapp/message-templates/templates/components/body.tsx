import { Button } from "@aha.chat/ui/components/ui/button"
import { Textarea } from "@aha.chat/ui/components/ui/textarea"
import { useTranslations } from "next-intl"
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { useFormContext } from "react-hook-form"
import { useDebouncedCallback } from "use-debounce"

const TemplateBodyComponent = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const { getValues, setValue } = useFormContext()

  const [localBody, setLocalBody] = useState(
    () => getValues(`${parentName}.text`) || "",
  )
  const [showForm, setShowForm] = useState(false)

  const handleChange = useDebouncedCallback((value) => {
    setValue(`${parentName}.text`, value, { shouldValidate: true })
  }, 200)

  useEffect(() => {
    if (!showForm) {
      setLocalBody(getValues(`${parentName}.text`) || "")
    }
  }, [getValues, parentName, showForm])

  const handleStartEditing = useCallback(() => {
    setLocalBody(getValues(`${parentName}.text`) || "")
    setShowForm(true)
  }, [getValues, parentName])

  const processVariables = useDebouncedCallback((value: string) => {
    const variableMatches = value.match(/\{\{(\d+)\}\}/g) || []
    const values = getValues(`${parentName}.variables`)

    if (variableMatches.length === 0) {
      setValue(`${parentName}.variables`, [], { shouldValidate: true })
      return
    }

    const newValues: string[] = []

    let index = 1
    for (const match of variableMatches) {
      if (match === `{{${index}}}`) {
        index += 1
        newValues.push(values.length ? values.shift() : "")
      }
    }
    setValue(`${parentName}.variables`, newValues, { shouldValidate: true })
  }, 200)

  const onChangeValue = useCallback(
    (value: string) => {
      setLocalBody(value)
      handleChange(value)

      processVariables(value)
    },
    [handleChange, processVariables],
  )

  const addParam = useCallback(() => {
    const values = getValues(`${parentName}.variables`)
    const newBody = `${localBody} {{${values.length + 1}}}`
    setLocalBody(newBody)
    handleChange(newBody)
    setValue(`${parentName}.variables`, [...(values || []), ""], {
      shouldValidate: true,
    })
  }, [getValues, handleChange, localBody, parentName, setValue])

  const displayText = useMemo(
    () => getValues(`${parentName}.text`) || `---- ${t("actions.update")} ----`,
    [getValues, parentName, t],
  )

  return (
    <>
      {showForm ? (
        <div className="flex flex-col gap-2">
          <Textarea
            autoFocus
            maxLength={1024}
            onChange={(e) => onChangeValue(e.target.value)}
            placeholder="Enter text"
            value={localBody}
          />
          <Button onClick={addParam} variant="link">
            {t("actions.addVariable")}
          </Button>
        </div>
      ) : (
        <Button
          className="cursor-pointer"
          onClick={handleStartEditing}
          variant="link"
        >
          {displayText}
        </Button>
      )}
    </>
  )
}

export const TemplateBody = memo(TemplateBodyComponent)
