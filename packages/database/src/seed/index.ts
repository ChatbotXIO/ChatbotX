import { prisma } from ".."
import { ChatbotMemberRole } from "../generated/prisma/client"

async function main() {
  let organization = await prisma.organization.findFirst()
  if (organization) {
    return
  }
  organization = await prisma.organization.create({
    data: {
      name: "ChatbotX",
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
      email: "demo@example.com",
      name: "Demo ChatbotX",
    },
  })

  await prisma.account.create({
    data: {
      accountId: user.id,
      providerId: "credential",
      // NOTES: password is "Demo@1234" hashed with scrypt
      password:
        "641c52171319d3ae13b238da41318493:90d5458996d391675ebdea8d4902afb94acdbad160f555b0bc7fe68d70ace03dc3cf903b8a21fa8433e9a016d52741d2fb2d444ed20b329dd7effbf8d5341d87",
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
    await prisma.chatbot.create({
      data: {
        organizationId: organization.id,
        name: "DEMO",
        accountTimezone: "Asia/Saigon",
        chatbotUsage: {
          create: {
            maxContacts: 999_999,
          },
        },
        chatbotMembers: {
          create: {
            userId: user.id,
            role: ChatbotMemberRole.owner,
            permissions: {
              superAdmin: true,
              analytics: true,
              flows: true,
              contacts: true,
              onlyAssignedContacts: true,
              emailAndPhone: true,
              broadcast: true,
              ecommerce: true,
            },
          },
        },
      },
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
