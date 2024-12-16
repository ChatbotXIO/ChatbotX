import { CreateContactDialog } from "@/features/contacts/create-contact-dialog";
export default function ContactsPage({ children, params }: { children: React.ReactNode, params: { chatbotId: string } }) {
  return (
    <div>
      <CreateContactDialog chatbotId={params.chatbotId} />
    </div>
  )
}
