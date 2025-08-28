import { authClient } from "@/lib/auth-client"

export default async function TestAnonymousPage() {
  const _user = await authClient.signIn.anonymous()

  return <div>TestAnonymousPage</div>
}
