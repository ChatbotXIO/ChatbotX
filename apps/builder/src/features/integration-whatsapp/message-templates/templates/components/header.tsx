import { Textarea } from "@/components/ui/textarea"
import { useTranslate } from "@tolgee/react"
import { useState, useEffect } from "react"
import { useFormContext } from "react-hook-form"
import { useDebouncedCallback } from "use-debounce"

export const TemplateHeader = ({
  parentName,
}: {
  parentName: string
}) => {
  const { t } = useTranslate()
  const { getValues, setValue } = useFormContext()

  const [localHeader, setLocalHeader] = useState(
    () => getValues(`${parentName}.text`) || "",
  )
  const [showForm, setShowForm] = useState(false)

  const handleChange = useDebouncedCallback((value) => {
    setValue(`${parentName}.text`, value, { shouldValidate: true })
  }, 100)

  useEffect(() => {
    if (!showForm) {
      setLocalHeader(getValues(`${parentName}.text`) || "")
    }
  }, [getValues, parentName, showForm])

  const handleStartEditing = () => {
    setLocalHeader(getValues(`${parentName}.text`) || "")
    setShowForm(true)
  }

  const onChangeValue = (value: string) => {
    setLocalHeader(value)
    handleChange(value)
    // Keep header variable allow only 1 variable
    if (!value.includes("{{1}}")) {
      setValue(`${parentName}.variables`, [], { shouldValidate: true })
    } else {
      const values = getValues(`${parentName}.variables`)
      if (!values.length) {
        setValue(`${parentName}.variables`, [""], { shouldValidate: true })
      }
    }
  }

  const addParam = () => {
    const values = getValues(`${parentName}.variables`)
    if (values.length === 0) {
      setLocalHeader(`${localHeader} {{${values.length + 1}}}`)
      handleChange(`${localHeader} {{${values.length + 1}}}`)
      setValue(`${parentName}.variables`, [...(values || []), ""], {
        shouldValidate: true,
      })
    }
  }

  return (
    <>
      {!showForm ? (
        <pre
          className="cursor-pointer font-bold"
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
            value={localHeader}
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
