"use client"

import {
  hasSameStructure,
  isFileAnswer,
  type MiniAppDefinition,
  type MiniAppFileAnswer,
} from "@chatbotx.io/mini-app"
import { useTranslations } from "next-intl"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import { saveMiniAppScreenAction } from "../actions/save-mini-app-screen.action"
import { submitMiniAppAction } from "../actions/submit-mini-app.action"
import {
  type MiniAppUploader,
  MiniAppUploaderContext,
} from "../components/file-upload-field"
import { MiniAppRunner } from "./mini-app-runner"

const HTTP_CREATED = 201

/**
 * Posts one file to the public upload route. XHR rather than fetch so the
 * visitor sees upload progress; a failure rejects with the route's error code.
 */
const postUpload = (input: {
  miniAppId: string
  token?: string
  inputName: string
  file: File
  onProgress: (fraction: number) => void
}) =>
  new Promise<MiniAppFileAnswer>((resolve, reject) => {
    const body = new FormData()
    body.append("file", input.file)
    body.append("inputName", input.inputName)
    if (input.token) {
      body.append("token", input.token)
    }
    const request = new XMLHttpRequest()
    request.open("POST", `/api/mini-apps/${input.miniAppId}/uploads`)
    request.responseType = "json"
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        input.onProgress(event.loaded / event.total)
      }
    }
    request.onload = () => {
      const response = request.response as
        | (MiniAppFileAnswer & { error?: string })
        | null
      if (request.status === HTTP_CREATED && response?.uploadId) {
        resolve(response)
      } else {
        reject(response?.error ?? "upload_failed")
      }
    }
    request.onerror = () => reject("upload_failed")
    request.send(body)
  })

/** File answers are submitted as their upload ids; the server resolves the files. */
const toSubmittedAnswers = (answers: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(answers).map(([name, value]) => [
      name,
      isFileAnswer(value) ? value.map((file) => file.uploadId) : value,
    ]),
  )

export function PublicMiniApp({
  miniAppId,
  definition: initialDefinition,
  token,
}: {
  miniAppId: string
  definition: MiniAppDefinition
  token?: string
}) {
  const t = useTranslations("miniApps.public")
  // Replaced after each screen is saved, so `{{variables}}` show new values.
  const [definition, setDefinition] = useState(initialDefinition)
  const upload = useCallback<MiniAppUploader>(
    ({ inputName, file, onProgress }) =>
      postUpload({ miniAppId, token, inputName, file, onProgress }),
    [miniAppId, token],
  )

  return (
    <MiniAppUploaderContext.Provider value={upload}>
      <MiniAppRunner
        className="flex-1"
        definition={definition}
        onComplete={async (answers) => {
          const result = await submitMiniAppAction({
            miniAppId,
            token,
            answers: toSubmittedAnswers(answers),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          })
          if (!result?.data?.success) {
            const message = result?.serverError ?? t("submitFailed")
            toast.error(message)
            throw new Error(message)
          }
        }}
        onNavigate={
          token
            ? async (screenKey, answers) => {
                const result = await saveMiniAppScreenAction({
                  miniAppId,
                  token,
                  screenKey,
                  answers: toSubmittedAnswers(answers),
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                })
                const next = result?.data?.definition
                // The author may have changed the Mini App since this page
                // opened; swapping screens mid-form would lose the visitor's
                // place, so only refreshed texts are taken.
                if (next) {
                  setDefinition((current) =>
                    hasSameStructure(current, next) ? next : current,
                  )
                }
              }
            : undefined
        }
      />
    </MiniAppUploaderContext.Provider>
  )
}
