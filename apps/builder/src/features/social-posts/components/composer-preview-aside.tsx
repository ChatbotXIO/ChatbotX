"use client"

import { ChevronDownIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ComponentProps } from "react"
import { useState } from "react"
import { PostPreview } from "./post-preview"

/** The composer's preview column: a collapsible panel on small screens, a sticky one on large. */
export const ComposerPreviewAside = ({
  hasError,
  ...preview
}: ComponentProps<typeof PostPreview> & { hasError: boolean }) => {
  const t = useTranslations()
  const [previewOpen, setPreviewOpen] = useState(false)

  return (
    <aside className="space-y-2 lg:sticky lg:top-4 lg:self-start">
      <button
        aria-expanded={previewOpen}
        className="flex w-full items-center justify-between rounded-lg border px-3 py-2 font-semibold text-sm lg:hidden"
        onClick={() => setPreviewOpen((open) => !open)}
        type="button"
      >
        {t("composer.preview")}
        <ChevronDownIcon
          className={previewOpen ? "size-4 rotate-180" : "size-4"}
        />
      </button>
      <h2 className="hidden font-semibold text-sm lg:block">
        {t("composer.preview")}
      </h2>
      <div className={previewOpen ? "block" : "hidden lg:block"}>
        <PostPreview {...preview} />
        {hasError ? (
          <p className="mt-2 text-destructive text-sm">
            {t("composer.previewError")}
          </p>
        ) : null}
      </div>
    </aside>
  )
}
