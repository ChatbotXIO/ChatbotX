import { createId } from "@chatbotx.io/utils"
import { db } from "../client"
import {
  accountModel,
  organizationMemberModel,
  organizationModel,
  userModel,
  workspaceMemberModel,
  workspaceModel,
  workspaceUsageModel,
} from "../schema"

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
      email: "demo@example.com",
      name: "Demo ChatbotX",
      emailVerified: true,
    })
    .returning()
    .then((result) => result[0])

  await db.insert(accountModel).values({
    accountId: user?.id ?? "",
    providerId: "credential",
    // NOTES: password is "Demo@1234" hashed with scrypt
    password:
      "641c52171319d3ae13b238da41318493:90d5458996d391675ebdea8d4902afb94acdbad160f555b0bc7fe68d70ace03dc3cf903b8a21fa8433e9a016d52741d2fb2d444ed20b329dd7effbf8d5341d87",
    userId: user?.id ?? "",
  })

  // add user to organization
  await db.insert(organizationMemberModel).values({
    organizationId: organization?.id ?? "",
    userId: user?.id ?? "",
    role: "admin",
  })

  // create workspace
  const workspacesCount = await db.$count(workspaceModel)
  if (workspacesCount === 0) {
    const workspace = await db
      .insert(workspaceModel)
      .values({
        id: createId(),
        organizationId: organization?.id ?? "",
        name: "DEMO",
        timezone: "Asia/Saigon",
      })
      .returning()
      .then((result) => result[0])

    await db.insert(workspaceUsageModel).values({
      id: createId(),
      workspaceId: workspace?.id ?? "",
      maxContacts: 999_999,
    })

    await db.insert(workspaceMemberModel).values({
      id: createId(),
      workspaceId: workspace?.id ?? "",
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
