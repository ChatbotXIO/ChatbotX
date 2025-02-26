import { faker } from "@faker-js/faker"
import { Gender, type Prisma } from "@prisma/client"
import {
  type Chatbot,
  ChatbotMemberRole,
  ChatbotPlan,
  type Folder,
  FolderType,
  PrismaClient,
} from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const chatbot = await prisma.chatbot.findFirst({
    where: {
      name: "FREE",
    },
  })
  if (!chatbot) {
    console.log("Chatbot not found")
    return
  }

  const contactsData: Prisma.ContactCreateManyInput[] = []
  for (let i = 0; i < 99; i++) {
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
  const contacts = await prisma.contact.findMany({
    where: { chatbotId: chatbot.id },
  })

  const conversationsData: Prisma.ConversationCreateManyInput[] = []
  for (let i = 0; i < 99; i++) {
    conversationsData.push({
      chatbotId: chatbot.id,
      contactId: contacts[i].id,
      inboxType: "CHATWIDGET",
    })
  }
  await prisma.conversation.createMany({
    data: conversationsData,
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
