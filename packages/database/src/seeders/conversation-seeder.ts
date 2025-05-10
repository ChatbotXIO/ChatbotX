import { faker } from "@faker-js/faker"
import {
  ContentType,
  Gender,
  InboxType,
  MessageType,
  type Prisma,
  SenderType,
} from "../../generated/client"
import { prisma } from ".."

async function main() {
  const chatbot = await prisma.chatbot.findFirst({
    where: {
      name: "FREE",
    },
  })
  if (!chatbot) return

  let inbox = await prisma.inbox.findFirst()
  if (inbox) return

  inbox = await prisma.inbox.create({
    data: {
      chatbotId: chatbot.id,
      inboxType: InboxType.CHAT_WIDGET,
      integrationChatWidget: {
        create: {
          chatbotId: chatbot.id,
          name: "ChatWidget",
          auth: {
            authType: "NONE",
          },
        },
      },
    },
  })

  const maxContacts = 49

  const contactsData: Prisma.ContactCreateManyInput[] = []
  for (let i = 0; i < maxContacts; i++) {
    contactsData.push({
      chatbotId: chatbot.id,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      gender: Gender.UNKNOWN,
      email: faker.internet.email(),
      phoneNumber: faker.phone.number(),
      avatar: faker.image.avatar(),
      source: "CHATWIDGET",
    })
  }
  await prisma.contact.createMany({
    data: contactsData,
  })
  const contacts = await prisma.contact.findMany({
    where: { chatbotId: chatbot.id },
  })

  const conversationsData: Prisma.ConversationCreateManyInput[] = []
  for (let i = 0; i < maxContacts; i++) {
    conversationsData.push({
      chatbotId: chatbot.id,
      contactId: contacts[i]?.id as string,
      inboxId: inbox.id,
    })
  }

  await prisma.conversation.createMany({
    data: conversationsData,
  })

  const conversations = await prisma.conversation.findMany({
    where: { chatbotId: chatbot.id },
  })
  const messagesData: Prisma.MessageCreateManyInput[] = []
  for (let i = 0; i < maxContacts; i++) {
    messagesData.push({
      chatbotId: chatbot.id,
      senderType: SenderType.USER,
      senderId: contacts[i]?.id as string,
      conversationId: conversations[i]?.id as string,
      inboxId: inbox.id,
      messageType: MessageType.INCOMING,
      contentType: ContentType.TEXT,
      content: faker.lorem.sentence(),
    })
  }
  await prisma.message.createMany({
    data: messagesData,
  })
}

main()
  .then(() => {
    return true
  })
  .catch((error) => {
    console.error(error)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
