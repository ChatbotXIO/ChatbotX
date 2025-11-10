import { prisma } from ".."
import { type Chatbot, ChatbotMemberRole } from "../generated/prisma/client"

async function main() {
  let organization = await prisma.organization.findFirst()
  if (organization) {
    return
  }
  organization = await prisma.organization.create({
    data: {
      name: "AhaChat AI",
      createdAt: new Date(),
      domain: new URL(process.env.NEXT_PUBLIC_BUILDER_URL ?? "").hostname,
    },
  })

  let user = await prisma.user.findFirst()
  if (user) {
    return
  }

  // create user
  user = await prisma.user.create({
    data: {
      email: "demo@aha.chat",
      name: "Demo AhaChat",
    },
  })

  await prisma.account.create({
    data: {
      accountId: user.id,
      providerId: "credential",
      // NOTES: password is "Ahachat@1234" hashed with scrypt
      password:
        "feffc83af6cb10b0475fdb825b68ece4:f109f93cf72748525e47b9ecd424d63f62f8cf27a3fff969ff1e1d26bd5636f5eb989775f6a2a8f68e3717f7a7cd42ed67dcf5cfb8c262ddc9a5c6045bc5c128",
      userId: user.id,
    },
  })

  // add user to organization
  await prisma.organizationMember.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      role: "admin",
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
        },
        {
          organizationId: organization.id,
          name: "PRO",
          accountTimezone: "Asia/Saigon",
        },
      ] as Chatbot[],
    })
    await prisma.chatbotMember.createMany({
      data: chatbots.map((chatbot) => ({
        chatbotId: chatbot.id,
        userId: user.id,
        role: ChatbotMemberRole.owner,
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

  // create folders
  // const data: Pick<Folder, "name" | "folderType" | "chatbotId">[] = []
  // const folderTypes = Object.values(FolderType)

  // for (const chatbot of chatbots) {
  //   const foldersCount = faker.number.int({ min: 3, max: 12 })
  //   for (let i = 0; i < foldersCount; i++) {
  //     for (const folderType of folderTypes) {
  //       data.push({
  //         name: `${folderType} ${faker.string.alpha(10)}`,
  //         folderType,
  //         chatbotId: chatbot.id,
  //       })
  //     }
  //   }
  // }
  // await prisma.folder.createMany({ data })

  return true
}

main()
  .then(() => true)
  .catch((error) => {
    console.log(error)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
