"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@chatbotx.io/ui/components/ui/collapsible"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@chatbotx.io/ui/components/ui/sheet"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import InputColor from "@chatbotx.io/ui/components/ui/vatsalpipalava/input-color"
import { ChevronDownIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { type ReactNode, useState } from "react"
import { updateStageAction } from "../../actions/stage.action"
import { usePipelineAction } from "../../lib/use-pipeline-action"
import type { BoardColumn } from "./types"

const DEFAULT_TEXT_COLOR = "#0f172a"
const DEFAULT_BACKGROUND_COLOR = "#f1f5f9"

type StageSettingsSheetProps = {
  workspaceId: string
  pipelineId: string
  column: BoardColumn
  open: boolean
  onClose: () => void
}

/** Right-hand "Settings" panel of a stage: description and header colors. */
export function StageSettingsSheet(props: StageSettingsSheetProps) {
  const { open, onClose } = props
  const t = useTranslations("pipelines")
  return (
    <Sheet onOpenChange={(next) => !next && onClose()} open={open}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("stage.settings")}</SheetTitle>
          <SheetDescription>{props.column.stage.name}</SheetDescription>
        </SheetHeader>
        {/* Remount per open so the draft always starts from the saved stage. */}
        {open ? <StageSettingsForm {...props} /> : null}
      </SheetContent>
    </Sheet>
  )
}

function StageSettingsForm({
  workspaceId,
  pipelineId,
  column,
  onClose,
}: StageSettingsSheetProps) {
  const t = useTranslations("pipelines")
  const { stage } = column
  const [description, setDescription] = useState(stage.description ?? "")
  // null = no custom color (the column follows the theme). A color input has
  // no empty state, so the default swatch is display-only and never saved.
  const [textColor, setTextColor] = useState<string | null>(stage.textColor)
  const [backgroundColor, setBackgroundColor] = useState<string | null>(
    stage.backgroundColor,
  )
  const { execute, isPending } = useAction(
    updateStageAction.bind(null, workspaceId),
    usePipelineAction({ successMessage: "stage.saved", onDone: onClose }),
  )

  return (
    <>
      <div className="flex flex-1 flex-col overflow-y-auto border-t text-sm">
        <Section title={t("stage.general")}>
          <label className="grid gap-1.5" htmlFor="stage-description">
            {t("stage.description")}
            <Textarea
              id="stage-description"
              maxLength={300}
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </label>
        </Section>
        <Section title={t("stage.color")}>
          <div className="grid grid-cols-2 gap-3">
            <ColorSwatch
              defaultColor={DEFAULT_TEXT_COLOR}
              id="stage-text-color"
              label={t("stage.textColor")}
              onChange={setTextColor}
              resetLabel={t("stage.resetColor")}
              value={textColor}
            />
            <ColorSwatch
              defaultColor={DEFAULT_BACKGROUND_COLOR}
              id="stage-background-color"
              label={t("stage.backgroundColor")}
              onChange={setBackgroundColor}
              resetLabel={t("stage.resetColor")}
              value={backgroundColor}
            />
          </div>
        </Section>
      </div>
      <SheetFooter>
        <Button
          disabled={isPending}
          onClick={() =>
            execute({
              id: pipelineId,
              stageId: stage.id,
              description: description.trim() || null,
              textColor,
              backgroundColor,
            })
          }
        >
          {isPending ? <Loader2Icon className="animate-spin" /> : null}
          {t("save")}
        </Button>
      </SheetFooter>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Collapsible className="border-b" defaultOpen>
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 font-medium [&[data-panel-open]>svg]:rotate-180">
        {title}
        <ChevronDownIcon className="size-4 transition-transform" />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">{children}</CollapsibleContent>
    </Collapsible>
  )
}

function ColorSwatch({
  id,
  label,
  resetLabel,
  value,
  defaultColor,
  onChange,
}: {
  id: string
  label: string
  resetLabel: string
  value: string | null
  defaultColor: string
  onChange: (color: string | null) => void
}) {
  const labelId = `${id}-label`
  // The picker keeps its own draft; remount it on reset so it shows the default again.
  const [resetCount, setResetCount] = useState(0)
  return (
    <fieldset
      aria-labelledby={labelId}
      className="m-0 grid min-w-0 gap-1.5 border-0 p-0"
    >
      <span className="flex h-6 items-center justify-between">
        <span id={labelId}>{label}</span>
        {value ? (
          <Button
            className="h-6 px-2 text-xs"
            onClick={() => {
              onChange(null)
              setResetCount((count) => count + 1)
            }}
            size="sm"
            variant="ghost"
          >
            {resetLabel}
          </Button>
        ) : null}
      </span>
      <InputColor
        className="[&>div]:gap-2 [&_input]:w-24"
        key={resetCount}
        label=""
        onBlur={() => undefined}
        onChange={onChange}
        value={value ?? defaultColor}
      />
    </fieldset>
  )
}
