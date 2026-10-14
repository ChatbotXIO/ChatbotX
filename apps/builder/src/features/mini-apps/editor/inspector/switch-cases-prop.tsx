"use client"

import { type MiniAppNode, slotEntries } from "@chatbotx.io/mini-app"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { nextFreeId } from "../../lib/list-editing"
import { useMiniAppEditor } from "../editor-context"
import { InspectorHint } from "./field-row"

const CASE_KEY_PATTERN = /^[A-Za-z0-9_]+$/

/** Adds, renames and removes the cases of a Switch (each case is a child slot). */
export function SwitchCasesProp({ node }: { node: MiniAppNode }) {
  const t = useTranslations("miniApps.inspector")
  const updateNodeSlots = useMiniAppEditor((state) => state.updateNodeSlots)
  const entries = slotEntries(node)
  const keys = entries.map(([key]) => key)
  const rename = (from: string, to: string) => {
    if (
      !(to && CASE_KEY_PATTERN.test(to)) ||
      (to !== from && keys.includes(to))
    ) {
      return
    }
    updateNodeSlots(
      node.id,
      entries.map(([key, children]) => [key === from ? to : key, children]),
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-medium text-sm">{t("cases")}</span>
      {keys.map((key) => (
        <div className="flex items-center gap-1" key={key}>
          <Input
            className="h-8 font-mono text-xs"
            defaultValue={key}
            onBlur={(event) => rename(key, event.target.value.trim())}
          />
          <Button
            aria-label={t("removeItem")}
            disabled={keys.length <= 1}
            onClick={() =>
              updateNodeSlots(
                node.id,
                entries.filter(([other]) => other !== key),
              )
            }
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button
        onClick={() =>
          updateNodeSlots(node.id, [...entries, [nextFreeId("case", keys), []]])
        }
        size="sm"
        type="button"
        variant="outline"
      >
        <PlusIcon className="size-4" />
        {t("addCase")}
      </Button>
      <InspectorHint>{t("casesHint")}</InspectorHint>
    </div>
  )
}
