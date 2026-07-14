import { db } from "@chatbotx.io/database/client"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { hmacSha256Hex, timingSafeStringEqual } from "@chatbotx.io/utils/crypto"
import type { SearchParams } from "next/dist/server/request/search-params"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import z from "zod"
import { isOriginAuthorized } from "@/features/integration-webchat/lib/authorized-domain"
import { createWebchatAccessToken } from "@/features/integration-webchat/lib/webchat-access-token"
import { GuestSessionStoreProvider } from "@/features/integration-webchat/providers/store/guest-session-provider"
import { toWebchatClientConfig } from "@/features/integration-webchat/providers/store/guest-sesssion-store"
import { WebchatWrapper } from "@/features/integration-webchat/webchat-wrapper"

type WebchatPageProps = {
  searchParams: Promise<SearchParams>
}

export const dynamic = "force-dynamic"

export default async function WebchatPage(props: WebchatPageProps) {
  const searchParams = await props.searchParams

  const { data } = z
    .object({
      workspaceId: zodBigintAsString(),
      webchatId: zodBigintAsString(),
      ref: z.string().optional(),
      domain: z.string().optional(),
      parentOrigin: z.string().optional(),
      externalId: z.string().optional(),
      externalHash: z.string().optional(),
    })
    .safeParse(searchParams)
  if (!data) {
    return notFound()
  }

  const targetWebchat = await db.query.integrationWebchatModel.findFirst({
    where: {
      id: data.webchatId,
      workspaceId: data.workspaceId,
    },
  })

  if (!targetWebchat) {
    return notFound()
  }

  const requestHeaders = await headers()
  const embeddingOrigin = requestHeaders.get("referer")
  if (!isOriginAuthorized(embeddingOrigin, targetWebchat.authorizedDomains)) {
    const t = await getTranslations("webchat.unauthorizedDomain")

    return (
      <main className="flex h-screen w-screen items-center justify-center bg-background p-6 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="font-semibold text-lg">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("description")}</p>
        </div>
      </main>
    )
  }

  // Optional customer-computed identity upgrade: the customer signs their chat
  // visitor's external id server-side with the webchat's identitySecret. When
  // a secret is configured and both externalId + externalHash verify, we vouch
  // for the identity by baking it into the access token. If no secret is
  // configured we ignore any supplied hash and treat the session as anonymous
  // — an additive upgrade, never a new failure mode.
  let verifiedExternalId: string | null = null
  if (data.externalId && data.externalHash && targetWebchat.identitySecret) {
    const expectedHash = await hmacSha256Hex(
      targetWebchat.identitySecret,
      data.externalId,
    )
    if (timingSafeStringEqual(data.externalHash, expectedHash)) {
      verifiedExternalId = data.externalId
    }
  }

  const accessToken = await createWebchatAccessToken({
    origin: embeddingOrigin,
    webchatId: targetWebchat.id,
    workspaceId: targetWebchat.workspaceId,
    verifiedExternalId,
  })

  return (
    <GuestSessionStoreProvider
      accessToken={accessToken}
      config={toWebchatClientConfig(targetWebchat)}
    >
      <WebchatWrapper parentOrigin={embeddingOrigin} referral={data.ref} />
    </GuestSessionStoreProvider>
  )
}
