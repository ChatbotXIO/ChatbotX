import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { RespondIcon } from "@/components/respond-icon"
import "./emoji.picker.css"

const BaseEmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: () => (
    <Skeleton className="h-[420px] w-[345px] rounded-[5px] bg-app-surface" />
  ),
})

// EmojiPicker do composer — pixel-perfect Respond.io 2026-05-25
// iteração 16 (Pedro: "deixar exatamente igual do responde io, com a
// mesma quantidade de emojis cabendo na tela, os icones em cima").
//
// Mapeamento Chrome MCP no emoji-mart do Respond.io ao vivo:
// - Picker 345×420 px
// - bg #222225 (app-surface) + radius 5 px
// - 10 categoria anchors no topo (33×42 cada)
// - Inativo branco, ativo #AE65C5 (roxo) + underline 3 px
// - Search input "Pesquisa" 32 px
// - Apple-style emojis 22 px
//
// Skin tones picker + preview bottom — REMOVIDOS (Respond.io não tem).
// Search ATIVO (Respond.io tem "Pesquisa").
const EmojiPicker = (props: {
  label?: string
  disabled?: boolean
  onSelectEmoji: (v: string) => void
}) => {
  const { label, disabled = false, onSelectEmoji } = props
  const t = useTranslations()

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              aria-label={t("messages.composer.emoji")}
              className="size-8 rounded-md text-text-secondary hover:bg-white/[0.06] hover:text-foreground"
              disabled={disabled}
              size="icon"
              variant="ghost"
            >
              <RespondIcon name="emoji-normal" size="lg" />
              {label}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">
          {t("messages.composer.emoji")}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className="w-auto rounded-[5px] border-0 bg-transparent p-0 shadow-none"
        sideOffset={6}
      >
        <BaseEmojiPicker
          autoFocusSearch={false}
          emojiStyle={"apple" as never}
          height={420}
          lazyLoadEmojis
          onEmojiClick={(v) => onSelectEmoji(v.emoji)}
          previewConfig={{ showPreview: false }}
          searchPlaceholder={t("messages.composer.emojiSearch")}
          skinTonesDisabled
          theme={"dark" as never}
          width={345}
        />
      </PopoverContent>
    </Popover>
  )
}

export default EmojiPicker
