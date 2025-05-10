import { Textarea } from "@/components/ui/textarea"
import { useTranslate } from "@tolgee/react"
import { useState, useEffect, useCallback, memo, useMemo } from "react"
import { useFormContext } from "react-hook-form"
import { useDebouncedCallback } from "use-debounce"

const TemplateFooterComponent = ({
  parentName,
}: {
  parentName: string
}) => {
  const { t } = useTranslate()
  const { getValues, setValue } = useFormContext()

  const [localFooter, setLocalFooter] = useState(
    () => getValues(`${parentName}.footer`) || "",
  )
  const [showForm, setShowForm] = useState(false)

  const handleChange = useDebouncedCallback((value) => {
    setValue(`${parentName}.footer`, value, { shouldValidate: true })
  }, 200)

  useEffect(() => {
    if (!showForm) {
      setLocalFooter(getValues(`${parentName}.footer`) || "")
    }
  }, [getValues, parentName, showForm])

  const handleStartEditing = useCallback(() => {
    setLocalFooter(getValues(`${parentName}.footer`) || "")
    setShowForm(true)
  }, [getValues, parentName])

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setLocalFooter(e.target.value)
      handleChange(e.target.value)
    },
    [handleChange],
  )

  const displayText = useMemo(() => {
    return getValues(`${parentName}.footer`) || `---- ${t("common.edit")} ----`
  }, [getValues, parentName, t])

  return (
    <>
      {!showForm ? (
        <pre
          className="cursor-pointer text-gray-300"
          onClick={handleStartEditing}
          onKeyUp={() => {}}
        >
          {displayText}
        </pre>
      ) : (
        <div className="flex flex-col gap-2">
          <Textarea
            autoFocus
            placeholder="Enter text"
            value={localFooter}
            maxLength={60}
            onChange={handleTextChange}
          />
        </div>
      )}
    </>
  )
}

export const TemplateFooter = memo(TemplateFooterComponent)
