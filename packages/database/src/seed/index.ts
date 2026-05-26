import { createId } from "@chatbotx.io/utils"
import { db } from "../client"
import {
  accountModel,
  userModel,
  workspaceMemberModel,
  workspaceModel,
} from "../schema"

async function main() {
  // Skip if a user already exists (idempotent seed)
  let user = await db.query.userModel.findFirst()
  if (user) {
    return
  }

  // Create demo user
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

  // Create workspace
  const workspacesCount = await db.$count(workspaceModel)
  if (workspacesCount === 0) {
    const workspace = await db
      .insert(workspaceModel)
      .values({
        id: createId(),
        ownerId: user?.id ?? "",
        name: "DEMO",
        timezone: "Asia/Saigon",
      })
      .returning()
      .then((result) => result[0])

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
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.log(error)
    process.exit(1)
  })
