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
