import { getCurrentUserId } from "@/auth";
import { Contact, prisma, Prisma } from "@ahachat.ai/database";

export const getContactInfo = async (
  contactId: string,
): Promise<Contact | null> => {
  const userId = await getCurrentUserId();

  try {
    const where: Prisma.ContactWhereInput = {
      id: contactId,
    };

    const result = await prisma.contact.findFirst({
      where,
    });

    return result;
  } catch (err) {
    return null;
  }
};
