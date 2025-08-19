import { ContactNotesList } from "../contact-notes/contact-notes-list"
import { ContactDetail } from "./contact-detail"

export const ContactInboxPanel = () => {
  return (
    <div className="flex w-full flex-col gap-2">
      <ContactDetail />
      <ContactNotesList />
    </div>
  )
}
