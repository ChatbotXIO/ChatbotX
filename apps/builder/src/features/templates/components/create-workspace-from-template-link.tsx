"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAction } from "next-safe-action/hooks"
import type { MouseEvent } from "react"
import { rememberTemplateInstallIntentAction } from "../actions/template-install-intent.action"
import { CREATE_WORKSPACE_FROM_TEMPLATE_PATH } from "../lib/install-intent-marker"

/**
 * A workspace is created together with its first channel, so a new one starts
 * on the channel picker. The template of this share page goes into it, in
 * place of the tenant's default.
 */
export function CreateWorkspaceFromTemplateLink({
  shareToken,
  label,
}: {
  shareToken: string
  label: string
}) {
  const router = useRouter()
  const { executeAsync, isPending } = useAction(
    rememberTemplateInstallIntentAction,
  )

  const start = async (event: MouseEvent) => {
    event.preventDefault()
    if (isPending) {
      return
    }
    // The workspace can still be created if remembering fails.
    await executeAsync({ shareToken }).catch(() => undefined)
    router.push(CREATE_WORKSPACE_FROM_TEMPLATE_PATH)
  }

  return (
    <Link
      className="text-muted-foreground text-sm underline underline-offset-4 hover:text-foreground"
      href={CREATE_WORKSPACE_FROM_TEMPLATE_PATH}
      onClick={start}
    >
      {label}
    </Link>
  )
}
