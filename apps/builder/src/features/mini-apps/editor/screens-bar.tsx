"use client"

import { isTerminalScreen, screenLabel } from "@chatbotx.io/mini-app"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { CheckCircle2Icon, PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useDefaultText } from "../lib/use-default-text"
import { useMiniAppEditor } from "./editor-context"

/** The screen tabs: click to open one, drag to reorder, or add a screen. */
export function ScreensBar() {
  const t = useTranslations("miniApps.editor")
  const screens = useMiniAppEditor((state) => state.definition.screens)
  const selectedScreenKey = useMiniAppEditor((state) => state.selectedScreenKey)
  const selectScreen = useMiniAppEditor((state) => state.selectScreen)
  const addScreen = useMiniAppEditor((state) => state.addScreen)
  const defaultText = useDefaultText()
  const moveScreen = useMiniAppEditor((state) => state.moveScreen)
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b px-3 py-2">
      {screens.map((screen, index) => (
        <button
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm",
            screen.key === selectedScreenKey
              ? "border-primary bg-primary/10 text-primary"
              : "hover:bg-muted",
          )}
          draggable
          key={screen.key}
          onClick={() => selectScreen(screen.key)}
          onDragOver={(event) => event.preventDefault()}
          onDragStart={(event) =>
            event.dataTransfer.setData("text/plain", String(index))
          }
          onDrop={(event) => {
            const from = Number(event.dataTransfer.getData("text/plain"))
            if (!Number.isNaN(from) && from !== index) {
              moveScreen(from, index)
            }
          }}
          type="button"
        >
          <span className="text-muted-foreground text-xs">{index + 1}</span>
          {screenLabel(screen)}
          {isTerminalScreen(screen) ? (
            <CheckCircle2Icon className="size-3.5 text-green-600" />
          ) : null}
        </button>
      ))}
      <Button
        onClick={() => addScreen(t("newScreenTitle"), defaultText)}
        size="sm"
        variant="ghost"
      >
        <PlusIcon className="size-4" />
        {t("addScreen")}
      </Button>
    </div>
  )
}
