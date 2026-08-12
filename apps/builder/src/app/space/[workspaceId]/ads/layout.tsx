import type { ReactNode } from "react"
import { AdsNav } from "@/features/ads/components/ads-nav"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

type AdsLayoutProps = {
  children: ReactNode
  params: Promise<{ workspaceId: string }>
}

export default async function AdsLayout({ children, params }: AdsLayoutProps) {
  await resolveGuardedWorkspaceId(params, "superAdmin")

  return (
    <div className="flex gap-6 p-4">
      <AdsNav />
      {/* The account switcher lives inside each page's title row (see
          AdsAccountControl). Reconnect calls router.refresh(), which re-runs
          the page and reloads the stored permission status. */}
      <div className="flex min-w-0 flex-1 flex-col gap-5">{children}</div>
    </div>
  )
}
