"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { authClient } from "@/lib/auth/auth-client"

export default function TestPage() {
  const createOrganization = async () => {
    const { data, error } = await authClient.organization.create({
      name: "My Organization", // required
      slug: "my-org", // required
      logo: "https://example.com/logo.png",
      metadata: {},
      userId: "some_user_id",
      keepCurrentActiveOrganization: false,
    })

    console.log(data, error)
  }

  return <Button onClick={createOrganization}>create organization</Button>
}
