import { Button } from "@aha.chat/ui/components/ui/button"
import { Textarea } from "@aha.chat/ui/components/ui/textarea"
import { useTranslations } from "next-intl"
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { useFormContext } from "react-hook-form"
import { useDebouncedCallback } from "use-debounce"

const TemplateFooterComponent = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
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

  const displayText = useMemo(
    () => getValues(`${parentName}.footer`) || `---- ${t("actions.edit")} ----`,
    [getValues, parentName, t],
  )

  return (
    <>
      {showForm ? (
        <div className="flex flex-col gap-2">
          <Textarea
            autoFocus
            maxLength={60}
            onChange={handleTextChange}
            placeholder="Enter text"
            value={localFooter}
          />
        </div>
      ) : (
        <Button
          className="cursor-pointer text-gray-300"
          onClick={handleStartEditing}
          variant="link"
        >
          {displayText}
        </Button>
      )}
    </>
  )
}

export const TemplateFooter = memo(TemplateFooterComponent)
