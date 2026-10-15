"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import { updateMiniAppAction } from "../actions/update-mini-app.action"
import { useMiniAppEditor } from "./editor-context"

type SaveError = {
  serverError?: string
  validationErrors?: { name?: { _errors?: string[] } }
}

/** Saves the name and definition; a taken name is shown under the name field. */
export function useSaveMiniApp(workspaceId: string, miniAppId: string) {
  const t = useTranslations()
  const router = useRouter()
  const name = useMiniAppEditor((state) => state.name)
  const definition = useMiniAppEditor((state) => state.definition)
  const markSaved = useMiniAppEditor((state) => state.markSaved)
  const [nameError, setNameError] = useState<string | undefined>()

  const update = useAction(
    updateMiniAppAction.bind(null, workspaceId, miniAppId),
    {
      onSuccess: () => {
        markSaved()
        setNameError(undefined)
        toast.success(t("messages.savedSuccessfully"))
        router.refresh()
      },
      onError: ({ error }: { error: SaveError }) => {
        const nameMessage = error.validationErrors?.name?._errors?.[0]
        setNameError(nameMessage)
        toast.error(
          nameMessage ?? error.serverError ?? t("miniApps.editor.saveFailed"),
        )
      },
    },
  )
  const save = useCallback(() => {
    update.execute({ name: name.trim(), definition })
  }, [name, definition, update])

  return { save, isSaving: update.isPending, nameError }
}
