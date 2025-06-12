import { faker } from "@faker-js/faker"
import {
  type Chatbot,
  ChatbotMemberRole,
  ChatbotPlan,
  type Folder,
  FolderType,
} from "../../generated/client"
import { prisma } from ".."

async function main() {
  let worksapce = await prisma.workspace.findFirst()
  if (worksapce) {
    return
  }
  worksapce = await prisma.workspace.create({
    data: {
      name: "AhaChat AI",
      domain: new URL(process.env.BASE_URL ?? "").hostname,
    },
  })

  let user = await prisma.user.findFirst()
  if (user) {
    return
  }

  // create user
  user = await prisma.user.create({
    data: {
      workspaceId: worksapce.id,
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
          workspaceId: worksapce.id,
          name: "FREE",
          accountTimezone: "Asia/Saigon",
          plan: ChatbotPlan.FREE,
        },
        {
          workspaceId: worksapce.id,
          name: "PRO",
          accountTimezone: "Asia/Saigon",
          plan: ChatbotPlan.PRO,
        },
      ] as Chatbot[],
    })
    await prisma.chatbotMember.createMany({
      data: chatbots.map((chatbot) => ({
        chatbotId: chatbot.id,
        userId: user.id,
        role: ChatbotMemberRole.OWNER,
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
    const foldersCount = faker.number.int({ min: 3, max: 12 })
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

  return true
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
