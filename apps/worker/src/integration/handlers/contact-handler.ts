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
import type { FlowStepProps } from "./step-handler"

export async function setContactCustomField({
  conversation,
  step,
}: FlowStepProps<SetCustomFieldStepSchema>) {
  await prisma.contactCustomField.upsert({
    create: {
      contactId: conversation.contactId,
      customFieldId: step.customFieldId,
      value: step.value,
    },
    where: {
      contactId_customFieldId: {
        contactId: conversation.contactId,
        customFieldId: step.customFieldId,
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
}: FlowStepProps<ClearCustomFieldStepSchema>) {
  await prisma.contactCustomField.deleteMany({
    where: {
      contactId: conversation.contactId,
      customFieldId: step.customFieldId,
    },
  })
}

export async function addContactNotes({
  conversation,
  step,
}: FlowStepProps<AddNotesStepSchema>) {
  await prisma.contactNote.create({
    data: {
      contactId: conversation.contactId,
      content: step.content,
    },
  })
}

export async function blockContact({
  conversation,
}: FlowStepProps<BlockContactStepSchema>) {
  await prisma.contact.update({
    where: { id: conversation.contactId },
    data: { blockedAt: new Date() },
  })
}

export async function markEmailVerified({
  conversation,
}: FlowStepProps<MarkEmailVerifiedStepSchema>) {
  await prisma.contact.update({
    where: { id: conversation.contactId },
    data: { emailVerified: true },
  })
}

export async function optInEmail({
  conversation,
}: FlowStepProps<OptInEmailStepSchema>) {
  await prisma.contact.update({
    where: { id: conversation.contactId },
    data: { emailOptIn: true },
  })
}

export async function optOutEmail({
  conversation,
}: FlowStepProps<OptOutEmailStepSchema>) {
  await prisma.contact.update({
    where: { id: conversation.contactId },
    data: { emailOptIn: false },
  })
}

export async function addContactTag({
  conversation,
  step,
}: FlowStepProps<AddContactTagStepSchema>) {
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
}: FlowStepProps<AddContactTagStepSchema>) {
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
}: FlowStepProps<DeleteContactStepSchema>) {
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
