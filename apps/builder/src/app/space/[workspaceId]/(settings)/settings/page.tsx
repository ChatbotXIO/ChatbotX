import { redirect } from "next/navigation"
import { workspaceSettingsGeneralPath } from "@/lib/workspace/require-not-scheduled-for-deletion"

type SettingPageProps = {
  params: Promise<{ workspaceId: string }>
}

// Absolute on purpose. A relative target resolves against the current URL, so
// a trailing slash or a soft navigation lands on `/settings/settings/general`.
export default async function SettingPage({ params }: SettingPageProps) {
  const { workspaceId } = await params
  return redirect(workspaceSettingsGeneralPath(workspaceId))
}
