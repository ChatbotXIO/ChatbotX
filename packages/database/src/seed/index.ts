import { createId } from "@paralleldrive/cuid2"
import { db } from "../client"
import {
  accountModel,
  chatbotMemberModel,
  chatbotModel,
  chatbotUsageModel,
  organizationMemberModel,
  organizationModel,
  userModel,
} from "../drizzle/schema"

async function main() {
  let organization = await db.query.organizationModel.findFirst()
  if (organization) {
    return
  }
  organization = await db
    .insert(organizationModel)
    .values({
      id: createId(),
      name: "ChatbotX",
      createdAt: new Date(),
      domain: new URL(process.env.NEXT_PUBLIC_BUILDER_URL ?? "").hostname,
    })
    .returning()
    .then((result) => result[0])

  let user = await db.query.userModel.findFirst()
  if (user) {
    return
  }

  // create user
  user = await db
    .insert(userModel)
    .values({
      id: createId(),
      email: "demo@example.com",
      name: "Demo ChatbotX",
    })
    .returning()
    .then((result) => result[0])

  await db.insert(accountModel).values({
    id: createId(),
    accountId: user?.id ?? "",
    providerId: "credential",
    // NOTES: password is "Demo@1234" hashed with scrypt
    password:
      "641c52171319d3ae13b238da41318493:90d5458996d391675ebdea8d4902afb94acdbad160f555b0bc7fe68d70ace03dc3cf903b8a21fa8433e9a016d52741d2fb2d444ed20b329dd7effbf8d5341d87",
    userId: user?.id ?? "",
  })

  // add user to organization
  await db.insert(organizationMemberModel).values({
    id: createId(),
    organizationId: organization?.id ?? "",
    userId: user?.id ?? "",
    role: "admin",
  })

  // create chatbot
  const chatbotsCount = await db.$count(chatbotModel)
  if (chatbotsCount === 0) {
    const chatbot = await db
      .insert(chatbotModel)
      .values({
        id: createId(),
        organizationId: organization?.id ?? "",
        name: "DEMO",
        accountTimezone: "Asia/Saigon",
      })
      .returning()
      .then((result) => result[0])

    await db.insert(chatbotUsageModel).values({
      id: createId(),
      chatbotId: chatbot?.id ?? "",
      maxContacts: 999_999,
    })

    await db.insert(chatbotMemberModel).values({
      id: createId(),
      chatbotId: chatbot?.id ?? "",
      userId: user?.id ?? "",
      role: "owner",
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
    })
  }

  return true
}

main()
  .then(() => true)
  .catch((error) => {
    console.log(error)
  })
