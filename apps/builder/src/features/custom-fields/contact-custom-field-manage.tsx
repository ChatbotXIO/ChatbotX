import { Button } from "@/components/ui/button"
import { CreateCustomFieldDialog } from "./create-custom-field-dialog"
import { PlusCircleIcon } from "lucide-react"

interface ContactCustomFieldManageProps {
  chatbotId: string
}

export function ContactCustomFieldManage({
  chatbotId,
}: ContactCustomFieldManageProps) {
  return (
    <>
      <CreateCustomFieldDialog
        chatbotId={chatbotId}
        triggerButton={
          <Button
            variant="link"
            className="flex justify-start px-0! cursor-pointer"
          >
            <PlusCircleIcon />
            Add new field
          </Button>
        }
        onSuccess={() => {
          // mutate(customFieldsUrl)
        }}
      />
    </>
  )
}
