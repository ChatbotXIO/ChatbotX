import { useParams } from "next/navigation"
import { ContactNotesList } from "../contact-notes/contact-notes-list"
import { CustomFieldStoreProvider } from "../custom-fields/provider/custom-field-store-context"
import { ContactDetail } from "./contact-detail"

export const ContactInboxPanel = () => {
  const { chatbotId } = useParams<{ chatbotId: string }>()

  return (
    <CustomFieldStoreProvider chatbotId={chatbotId}>
      <div className="flex w-full flex-col gap-2">
        <ContactDetail />
        <ContactNotesList />
      </div>
    </CustomFieldStoreProvider>
  )
}
