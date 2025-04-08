import { Textarea } from "@/components/ui/textarea"
import { useTranslate } from "@tolgee/react"
import { useState, useEffect } from "react"
import { useFormContext } from "react-hook-form"
import { useDebouncedCallback } from "use-debounce"

export const TemplateFooter = ({
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
  }, 100)

  useEffect(() => {
    if (!showForm) {
      setLocalFooter(getValues(`${parentName}.footer`) || "")
    }
  }, [getValues, parentName, showForm])

  const handleStartEditing = () => {
    setLocalFooter(getValues(`${parentName}.footer`) || "")
    setShowForm(true)
  }

  return (
    <>
      {!showForm ? (
        <pre
          className="cursor-pointer text-gray-300"
          onClick={handleStartEditing}
          onKeyUp={() => {}}
        >
          {getValues(`${parentName}.footer`) || `---- ${t("common.edit")} ----`}
        </pre>
      ) : (
        <div className="flex flex-col gap-2">
          <Textarea
            autoFocus
            placeholder="Enter text"
            value={localFooter}
            maxLength={60}
            onChange={(e) => {
              setLocalFooter(e.target.value)
              handleChange(e.target.value)
            }}
          />
        </div>
      )}
    </>
  )
}
