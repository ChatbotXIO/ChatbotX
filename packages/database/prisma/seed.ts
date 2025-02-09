import { faker } from "@faker-js/faker"
import {
  type Chatbot,
  type Folder,
  FolderType,
  PrismaClient,
} from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  let user = await prisma.user.findFirst()
  if (user) {
    return
  }

  // create user
  user = await prisma.user.create({
    data: {
      email: "admin@ahachat.ai",
      name: "AhaChat",
    },
  })

  // create chatbot
  const chatbotsCount = await prisma.chatbot.count()
  if (chatbotsCount === 0) {
    const chatbots = await prisma.chatbot.createManyAndReturn({
      data: [
        {
          name: "FREE",
          accountTimezone: "Asia/Saigon",
          plan: "Free",
        },
        {
          name: "PRO",
          accountTimezone: "Asia/Saigon",
          plan: "Pro",
        },
      ] as Chatbot[],
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
      })),
    })
  }

  const chatbots = await prisma.chatbot.findMany({
    where: {
      chatbotMembers: {
        some: {
          userId: user.id,
        },
      },
    },
  })
  const chatbot = chatbots[0]
  if (!chatbot) {
    throw new Error("Chatbot not found")
  }

  // create folders
  const data: Pick<Folder, "name" | "folderType" | "chatbotId">[] = []
  const folderTypes = Object.values(FolderType)

  for (const chatbot of chatbots) {
    const foldersCount = faker.number.int({ min: 5, max: 20 })
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
  // const inboxData: Pick<
  //   Inbox,
  //   "name" | "channelType" | "chatbotId" | "channelId"
  // >[] = []

  // for (let i = 0; i < 2; i++) {
  //   inboxData.push({
  //     name: `Web Widget ${faker.string.alpha(10)}`,
  //     channelType: "ChannelWebWidget",
  //     chatbotId: chatbot.id,
  //     channelId: cuid2.createId(),
  //   })
  // }
  // const inboxes: Inbox[] = await prisma.inbox.createManyAndReturn({
  //   data: inboxData,
  // })

  // // Create contact
  // const contactData: Pick<
  //   Contact,
  //   | "chatbotId"
  //   | "firstName"
  //   | "lastName"
  //   | "avatar"
  //   | "email"
  //   | "phoneNumber"
  //   | "gender"
  //   | "source"
  // >[] = []
  // const contactCount = faker.number.int({ min: 20, max: 50 })
  // for (let i = 0; i < contactCount; i++) {
  //   contactData.push({
  //     chatbotId: chatbot.id,
  //     firstName: faker.person.firstName(),
  //     lastName: faker.person.lastName(),
  //     avatar: `https://picsum.photos/200/300?random=${i}`,
  //     email: faker.internet.email(),
  //     phoneNumber: faker.phone.number(),
  //     gender: Gender.Male,
  //     source: "Source",
  //   })
  // }
  // const contacts: Contact[] = await prisma.contact.createManyAndReturn({
  //   data: contactData,
  // })

  // // Create conversation
  // const conversationData: Pick<
  //   Conversation,
  //   "contactId" | "chatbotId" | "contactLastSeenAt" | "agentLastSeenAt"
  // >[] = []

  // for (let i = 0; i < contactCount; i++) {
  //   conversationData.push({
  //     contactId: contacts[i]?.id,
  //     chatbotId: chatbot.id,
  //     contactLastSeenAt: faker.date.anytime(),
  //     agentLastSeenAt: faker.date.anytime(),
  //   })
  // }
  // const conversations: Conversation[] =
  //   await prisma.conversation.createManyAndReturn({ data: conversationData })

  // // Create messages
  // const messageData: Pick<
  //   Message,
  //   | "conversationId"
  //   | "inboxId"
  //   | "chatbotId"
  //   | "content"
  //   | "messageType"
  //   | "senderType"
  //   | "senderId"
  //   | "createdAt"
  //   | "updatedAt"
  // >[] = []

  // for (const conversation of conversations) {
  //   const messageCount = faker.number.int({ min: 10, max: 100 })
  //   for (let i = 0; i < messageCount; i++) {
  //     const senderType =
  //       faker.number.int({ min: 1, max: 2 }) === 1
  //         ? SenderType.Contact
  //         : SenderType.User
  //     messageData.push({
  //       conversationId: conversation.id,
  //       inboxId: inboxes[0]?.id,
  //       chatbotId: chatbot.id,
  //       content: faker.lorem.sentence(),
  //       messageType: MessageType.Text,
  //       senderType: senderType,
  //       senderId:
  //         senderType === SenderType.Contact ? conversation.contactId : user.id,
  //       createdAt: faker.date.anytime(),
  //       updatedAt: faker.date.anytime(),
  //     })
  //   }
  // }
  // await prisma.message.createManyAndReturn({ data: messageData })
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
