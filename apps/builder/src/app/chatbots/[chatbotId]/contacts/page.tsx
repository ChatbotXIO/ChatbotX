import { CreateContactDialog } from "@/features/contacts/create/create-contact-dialog";

export default async function ContactsPage(
  props: { params: Promise<{ chatbotId: string }> }
) {
  const params = await props.params;

  return (
    <div>
      <CreateContactDialog chatbotId={params.chatbotId} />
    </div>
  )
}
