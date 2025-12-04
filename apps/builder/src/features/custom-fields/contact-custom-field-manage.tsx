import { Button } from "@aha.chat/ui/components/ui/button"
import { PlusCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { CreateCustomFieldDialog } from "./create-custom-field"

type ContactCustomFieldManageProps = {
  chatbotId: string
}

export function ContactCustomFieldManage({
  chatbotId,
}: ContactCustomFieldManageProps) {
  const t = useTranslations()

  return (
    <CreateCustomFieldDialog
      chatbotId={chatbotId}
      folderId={null}
      onSuccess={() => {
        // mutate(customFieldsUrl)
      }}
      triggerButton={
        <Button
          className="flex cursor-pointer justify-start px-0!"
          variant="link"
        >
          <PlusCircleIcon />
          {t("actions.addFeature", { feature: t("fields.customField.label") })}
        </Button>
      }
    />
  )
}
