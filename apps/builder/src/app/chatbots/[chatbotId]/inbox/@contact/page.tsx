import ProfileAvatar from "@/features/contact-profile/profile";
import { getContactInfo } from "@/features/contact-profile/queries/contact";
import {
  getContactCustomField,
  getCustomFields,
} from "@/features/contact-profile/queries/custom-field";
import UserInfo from "@/features/contact-profile/user-info";
import { Contact } from "@prisma/client";
import { SearchParams } from "nuqs/server";

export default async function InboxContactSlot(props: {
  params: Promise<{ chatbotId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [searchParams, params] = await Promise.all([
    props.searchParams,
    props.params,
  ]);
  const { contactId } = await searchParams;

  const contactInfo = await getContactInfo(contactId as string);

  const [contactCustomFields, customFields] = await Promise.all([
    getContactCustomField({ contactId: contactId as string }),
    getCustomFields(),
  ]);

  return (
    <section className="h-full p-3 overflow-y-auto">
      <div className="mt-6">
        <ProfileAvatar contact={contactInfo as Contact} />
      </div>

      <div className="mt-6">
        <UserInfo
          chatbotId={params.chatbotId}
          contact={contactInfo as Contact}
          contactFields={contactCustomFields.data}
          fields={customFields.data}
        />
      </div>
    </section>
  );
}
