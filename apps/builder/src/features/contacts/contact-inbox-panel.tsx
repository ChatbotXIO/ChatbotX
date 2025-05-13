import { ContactDetail } from "./contact-detail"
import { ContactNotesList } from "../contact-notes/contact-notes-list"

export const ContactInboxPanel = () => {
  return (
    <div className="flex flex-col w-full gap-2">
      <ContactDetail />
      <ContactNotesList />
    </div>
  )
}
