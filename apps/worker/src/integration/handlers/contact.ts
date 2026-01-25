import { prisma } from "@aha.chat/database"
import type {
  AddContactTagStepSchema,
  AddNotesStepSchema,
  BlockContactStepSchema,
  ClearCustomFieldStepSchema,
  DeleteContactStepSchema,
  MarkEmailVerifiedStepSchema,
  OptInEmailStepSchema,
  OptOutEmailStepSchema,
  SetCustomFieldStepSchema,
} from "@aha.chat/flow-config"
import type { ExecuteStepProps } from "./flow"

export async function setContactCustomField({
  conversation,
  step,
}: ExecuteStepProps<SetCustomFieldStepSchema>) {
  await prisma.contactCustomField.upsert({
    create: {
      contactId: conversation.contactId,
      customFieldId: step.inputCfId,
      value: step.value,
    },
    where: {
      contactId_customFieldId: {
        contactId: conversation.contactId,
        customFieldId: step.inputCfId,
      },
    },
    update: {
      value: step.value,
    },
  })
}

export async function clearContactCustomField({
  conversation,
  step,
}: ExecuteStepProps<ClearCustomFieldStepSchema>) {
  await prisma.contactCustomField.deleteMany({
    where: {
      contactId: conversation.contactId,
      customFieldId: step.inputCfId,
    },
  })
}

export async function addContactNotes({
  conversation,
  step,
}: ExecuteStepProps<AddNotesStepSchema>) {
  await prisma.contactNote.create({
    data: {
      contactId: conversation.contactId,
      content: step.content,
    },
  })
}

export async function blockContact({
  conversation,
}: ExecuteStepProps<BlockContactStepSchema>) {
  await prisma.contact.update({
    where: { id: conversation.contactId },
    data: { blockedAt: new Date() },
  })
}

export async function markEmailVerified({
  conversation,
}: ExecuteStepProps<MarkEmailVerifiedStepSchema>) {
  await prisma.contact.update({
    where: { id: conversation.contactId },
    data: { emailVerified: true },
  })
}

export async function optInEmail({
  conversation,
}: ExecuteStepProps<OptInEmailStepSchema>) {
  await prisma.contact.update({
    where: { id: conversation.contactId },
    data: { emailOptIn: true },
  })
}

export async function optOutEmail({
  conversation,
}: ExecuteStepProps<OptOutEmailStepSchema>) {
  await prisma.contact.update({
    where: { id: conversation.contactId },
    data: { emailOptIn: false },
  })
}

export async function addContactTag({
  conversation,
  step,
}: ExecuteStepProps<AddContactTagStepSchema>) {
  await prisma.$transaction(async (tx) => {
    const tags = await tx.tag.createManyAndReturn({
      data: step.tags.map((t) => ({
        name: t,
        chatbotId: conversation.chatbotId,
      })),
      skipDuplicates: true,
    })

    await tx.contact.update({
      data: {
        tags: {
          connect: tags.map((t) => ({ id: t.id })),
        },
      },
      where: {
        id: conversation.contactId,
      },
    })
  })
}

export async function removeContactTag({
  conversation,
  step,
}: ExecuteStepProps<AddContactTagStepSchema>) {
  const tags = await prisma.tag.findMany({
    where: {
      chatbotId: conversation.id,
      name: {
        in: step.tags,
      },
    },
    select: {
      id: true,
    },
  })
  if (tags.length === 0) {
    return
  }

  await prisma.contact.update({
    data: {
      tags: {
        disconnect: tags.map((t) => ({
          id: t.id,
        })),
      },
    },
    where: {
      id: conversation.contactId,
    },
  })
}

export async function deleteContact({
  conversation,
}: ExecuteStepProps<DeleteContactStepSchema>) {
  await prisma.$transaction(async (tx) => {
    await tx.conversation.delete({
      where: {
        id: conversation.id,
      },
    })
    await tx.contact.delete({
      where: {
        id: conversation.contactId,
      },
    })
  })
}
