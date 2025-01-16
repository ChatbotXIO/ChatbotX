import { Textarea } from "@/components/ui/textarea"
import { useTranslate } from "@tolgee/react"

export default function AddNotesEditor() {
  const { t } = useTranslate()

  return (
    <>
      <Textarea placeholder={t("flows.addNotesInput")} className="max-h-52" />
    </>
  )
}
