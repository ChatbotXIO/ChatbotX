import { faker } from "@faker-js/faker";
import {
  Chatbot,
  Contact,
  Conversation,
  FolderType,
  Gender,
  Inbox,
  Message,
  MessageType,
  PrismaClient,
  SenderType
} from "@prisma/client";
import * as cuid2 from "@paralleldrive/cuid2";

const prisma = new PrismaClient()

async function main() {
  const user = await prisma.user.findFirstOrThrow()

  // create chatbot
  const chatbotsCount = await prisma.chatbot.count()
  if (chatbotsCount == 0) {
    const chatbots = await prisma.chatbot.createManyAndReturn({
      data: [
        {
          name: 'Ahachat FREE',
          accountTimezone: "Asia/Saigon",
          plan: "Free",
        },
        {
          name: 'Ahachat PRO',
          accountTimezone: "Asia/Saigon",
          plan: "Pro",
        }
      ] as Chatbot[]
    })
    await prisma.chatbotMember.createMany({
      data: chatbots.map((chatbot) => ({
        chatbotId: chatbot.id,
        userId: user.id,
        role: "Owner",
        isAdmin: true,
        enableAnalytics: true,
        enableFlows: true,
        enableContacts: true,
        enableOnlyAssignedContacts: true,
        enableEmailAndPhone: true,
        enableBroadcast: true,
        enableEcommerce: true,
      }))
    })
  }

  const chatbots = await prisma.chatbot.findMany({
    where: {
      chatbotMembers: {
        some: {
          userId: user.id
        }
      }
    }
  })
  const chatbot = chatbots[0]
  if (!chatbot) {
    throw new Error('Chatbot not found')
  }

  // create folders
  const data: any[] = []
  const folderTypes = Object.values(FolderType)

  for (const chatbot of chatbots) {
    const foldersCount = faker.number.int({ min: 10, max: 100 })
    for (let i = 0; i < foldersCount; i++) {
      for (const folderType of folderTypes) {
        data.push({
          name: `${folderType} ${faker.string.alpha(10)}`,
          folderType,
          chatbotId: chatbot.id,
        })
      }
    }
  }
  await prisma.folder.createMany({ data })

  // Create chat inbox
  const inboxData: any[] = []

  for (let i = 0; i < 2; i++) {
    inboxData.push({
      name: `Web Widget ${faker.string.alpha(10)}`,
      channelType: "ChannelWebWidget",
      chatbotId: chatbot.id,
      channelId: cuid2.createId(),
    })
  }
  const inboxes: Inbox[] = await prisma.inbox.createManyAndReturn({ data: inboxData })

  // Create contact
  const contactData: any[] = []
  const contactCount = faker.number.int({ min: 20, max: 50 })
  for (let i = 0; i < contactCount; i++) {
    contactData.push({
      chatbotId: chatbot.id,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      avatar: `https://picsum.photos/200/300?random=${i}`,
      email: faker.internet.email(),
      phoneNumber: faker.phone.number(),
      gender: Gender.Male,
      source: "Source",
    })
  }
  const contacts: Contact[] = await prisma.contact.createManyAndReturn({ data: contactData })

  // Create conversation
  const conversationData: any[] = []

  for (let i = 0; i < contactCount; i++) {
    conversationData.push({
      contactId: contacts[i]?.id,
      chatbotId: chatbot.id,
      contactLastSeenAt: faker.date.anytime(),
      agentLastSeenAt: faker.date.anytime()
    })
  }
  const conversations: Conversation[] = await prisma.conversation.createManyAndReturn({ data: conversationData })

  // Create messages
  const messageData: any[] = []

  for (const conversation of conversations) {
    const messageCount = faker.number.int({ min: 10, max: 100 })
    for (let i = 0; i < messageCount; i++) {
      const senderType = faker.number.int({ min: 1, max: 2 }) === 1 ? SenderType.Contact : SenderType.User
      messageData.push({
        conversationId: conversation.id,
        inboxId: inboxes[0]?.id,
        chatbotId: chatbot.id,
        content: faker.lorem.sentence(),
        messageType: MessageType.Text,
        senderType: senderType,
        senderId: senderType === SenderType.Contact ? conversation.contactId : user.id,
      })
    }
  }
  const messages: Message[] = await prisma.message.createManyAndReturn({ data: messageData })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()

    process.exit(1)
  })
