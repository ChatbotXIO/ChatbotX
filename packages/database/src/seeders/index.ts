import baseLogger from "@aha.chat/logger"
import { faker } from "@faker-js/faker"
import { prisma } from ".."
import {
  type Chatbot,
  ChatbotMemberRole,
  ChatbotPlan,
  type Folder,
  FolderType,
} from "../generated/prisma/client"

async function main() {
  let organization = await prisma.organization.findFirst()
  if (organization) {
    return
  }
  organization = await prisma.organization.create({
    data: {
      name: "AhaChat AI",
      createdAt: new Date(),
    },
  })

  let user = await prisma.user.findFirst()
  if (user) {
    return
  }

  // create user
  user = await prisma.user.create({
    data: {
      email: "admin@aha.chat",
      name: "AhaChat",
    },
  })

  // add user to organization
  await prisma.organizationMember.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      role: "ADMIN",
    },
  })

  // create chatbot
  const chatbotsCount = await prisma.chatbot.count()
  if (chatbotsCount === 0) {
    const chatbots = await prisma.chatbot.createManyAndReturn({
      data: [
        {
          organizationId: organization.id,
          name: "FREE",
          accountTimezone: "Asia/Saigon",
          plan: ChatbotPlan.FREE,
        },
        {
          organizationId: organization.id,
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
  .catch((_error) => {
    baseLogger.error(_error)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
