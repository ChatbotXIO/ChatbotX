import { Button } from "@aha.chat/ui/components/ui/button"
import { PlusCircleIcon } from "lucide-react"
import { CreateCustomFieldDialog } from "./create-custom-field-dialog"

type ContactCustomFieldManageProps = {
  chatbotId: string
}

export function ContactCustomFieldManage({
  chatbotId,
}: ContactCustomFieldManageProps) {
  return (
    <CreateCustomFieldDialog
      chatbotId={chatbotId}
      onSuccess={() => {
        // mutate(customFieldsUrl)
      }}
      triggerButton={
        <Button
          className="flex cursor-pointer justify-start px-0!"
          variant="link"
        >
          <PlusCircleIcon />
          Add new field
        </Button>
      }
    />
  )
}
