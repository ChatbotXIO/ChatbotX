import { Button } from "@aha.chat/ui/components/ui/button"
import { Textarea } from "@aha.chat/ui/components/ui/textarea"
import { useTranslations } from "next-intl"
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { useFormContext } from "react-hook-form"
import { useDebouncedCallback } from "use-debounce"

const TemplateHeaderComponent = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const { getValues, setValue } = useFormContext()

  const [localHeader, setLocalHeader] = useState(
    () => getValues(`${parentName}.text`) || "",
  )
  const [showForm, setShowForm] = useState(false)

  const handleChange = useDebouncedCallback((value) => {
    setValue(`${parentName}.text`, value, { shouldValidate: true })
  }, 200)

  useEffect(() => {
    if (!showForm) {
      setLocalHeader(getValues(`${parentName}.text`) || "")
    }
  }, [getValues, parentName, showForm])

  const handleStartEditing = useCallback(() => {
    setLocalHeader(getValues(`${parentName}.text`) || "")
    setShowForm(true)
  }, [getValues, parentName])

  const processVariables = useDebouncedCallback((value: string) => {
    if (!value.includes("{{1}}")) {
      setValue(`${parentName}.variables`, [], { shouldValidate: true })

      return
    }
    const values = getValues(`${parentName}.variables`)
    setValue(`${parentName}.variables`, values.length ? values : [""], {
      shouldValidate: true,
    })
  }, 200)

  const onChangeValue = useCallback(
    (value: string) => {
      setLocalHeader(value)
      handleChange(value)
      processVariables(value)
    },
    [handleChange, processVariables],
  )

  const addParam = useCallback(() => {
    const values = getValues(`${parentName}.variables`)
    if (values.length === 0) {
      const newHeader = `${localHeader} {{${values.length + 1}}}`
      setLocalHeader(newHeader)
      handleChange(newHeader)
      setValue(`${parentName}.variables`, [...(values || []), ""], {
        shouldValidate: true,
      })
    }
  }, [getValues, handleChange, localHeader, parentName, setValue])

  const displayText = useMemo(
    () => getValues(`${parentName}.text`) || `---- ${t("actions.edit")} ----`,
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
            value={localHeader}
          />
          <Button
            className="flex cursor-pointer justify-end text-xs hover:underline"
            onClick={addParam}
            variant="link"
          >
            {t("actions.addVariable")}
          </Button>
        </div>
      ) : (
        <Button
          className="cursor-pointer font-bold"
          onClick={handleStartEditing}
          variant="link"
        >
          {displayText}
        </Button>
      )}
    </>
  )
}

export const TemplateHeader = memo(TemplateHeaderComponent)
