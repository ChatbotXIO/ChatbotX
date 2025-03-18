import { Textarea } from "@/components/ui/textarea"
import { useTranslate } from "@tolgee/react"

export function AddNotesNodeEditor() {
  const { t } = useTranslate()

  return (
    <>
      <Textarea placeholder={t("flows.addNotesInput")} className="max-h-52" />
    </>
  )
}
