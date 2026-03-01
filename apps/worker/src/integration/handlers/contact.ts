import { prisma } from "@aha.chat/database"
import {
  FieldType,
  type Gender,
  reservedCustomFieldNames,
} from "@aha.chat/database/types"
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

export async function saveResultToCustomField({
  contactId,
  customFieldId,
  fullText,
  messageCount,
  chatbotId,
}: {
  contactId: string | null
  customFieldId: string
  fullText: string
  messageCount: number
  chatbotId: string
}): Promise<void> {
  if (!contactId) {
    return
  }
  if (!customFieldId.trim()) {
    return
  }
  if (messageCount === 0) {
    return
  }
  if (!fullText) {
    return
  }

  const isReservedField = Object.values(reservedCustomFieldNames).includes(
    customFieldId as (typeof reservedCustomFieldNames)[keyof typeof reservedCustomFieldNames],
  )

  if (isReservedField) {
    const updateData: Partial<{
      firstName: string
      lastName: string
      email: string
      phoneNumber: string
      avatar: string
      gender: Gender
    }> = {}

    switch (customFieldId) {
      case reservedCustomFieldNames.first_name:
        updateData.firstName = fullText
        break
      case reservedCustomFieldNames.last_name:
        updateData.lastName = fullText
        break
      case reservedCustomFieldNames.full_name: {
        const trimmedName = fullText.trim()
        const spaceIndex = trimmedName.indexOf(" ")
        if (spaceIndex > 0) {
          updateData.firstName = trimmedName.substring(0, spaceIndex)
          updateData.lastName = trimmedName.substring(spaceIndex + 1).trim()
        } else if (trimmedName.length > 0) {
          updateData.firstName = trimmedName
        }
        break
      }
      case reservedCustomFieldNames.email:
        updateData.email = fullText
        break
      case reservedCustomFieldNames.phone_number:
        updateData.phoneNumber = fullText
        break
      case reservedCustomFieldNames.avatar:
        updateData.avatar = fullText
        break
      case reservedCustomFieldNames.gender:
        if (
          fullText === "male" ||
          fullText === "female" ||
          fullText === "unknown"
        ) {
          updateData.gender = fullText as Gender
        }
        break
      default:
        return
    }

    await prisma.contact.update({
      where: { id: contactId },
      data: updateData,
    })
    return
  }

  const customField = await prisma.field.findFirst({
    where: {
      id: customFieldId,
      fieldType: FieldType.customField,
      chatbotId,
    },
  })

  if (!customField) {
    return
  }

  await prisma.contactCustomField.upsert({
    where: {
      contactId_customFieldId: {
        contactId,
        customFieldId,
      },
    },
    update: {
      value: fullText,
    },
    create: {
      contactId,
      customFieldId,
      value: fullText,
    },
  })
}

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
