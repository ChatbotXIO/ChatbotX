import type {
  Announcements,
  ScreenReaderInstructions,
  UniqueIdentifier,
} from "@dnd-kit/core"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import type { BoardColumn } from "../components/board/types"

type CardDragAccessibility = {
  announcements: Announcements
  screenReaderInstructions: ScreenReaderInstructions
}

/**
 * The spoken side of a card drag (dnd-kit live region): what was picked up,
 * which stage it is over, where it was dropped. Names come from the board on
 * screen, so a screen-reader user hears card and stage titles, never ids.
 */
export function useCardDragAnnouncements(
  columns: readonly BoardColumn[],
): CardDragAccessibility {
  const t = useTranslations("pipelines")
  return useMemo<CardDragAccessibility>(() => {
    const cardOf = (id: UniqueIdentifier) =>
      columns
        .flatMap((column) => column.items)
        .find((view) => view.item.id === String(id))
    const nameOf = (id: UniqueIdentifier) => cardOf(id)?.item.title ?? ""
    // Over a card, the stage is the card's; over a column, the column's own.
    const stageNameOf = (id: UniqueIdentifier) => {
      const stageId = cardOf(id)?.item.stageId ?? String(id)
      return columns.find((column) => column.stage.id === stageId)?.stage.name
    }
    return {
      announcements: {
        onDragStart: ({ active }) =>
          t("board.announce.pickedUp", { name: nameOf(active.id) }),
        onDragOver: ({ active, over }) =>
          over
            ? t("board.announce.over", {
                name: nameOf(active.id),
                stage: stageNameOf(over.id) ?? "",
              })
            : undefined,
        onDragEnd: ({ active, over }) =>
          over
            ? t("board.announce.dropped", {
                name: nameOf(active.id),
                stage: stageNameOf(over.id) ?? "",
              })
            : t("board.announce.cancelled", { name: nameOf(active.id) }),
        onDragCancel: ({ active }) =>
          t("board.announce.cancelled", { name: nameOf(active.id) }),
      },
      screenReaderInstructions: { draggable: t("board.dragInstructions") },
    }
  }, [columns, t])
}
