import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useId } from "react"

/** The stage title; hovering or focusing it shows the stage description when it has one. */
export function StageName({
  name,
  description,
}: {
  name: string
  description: string | null
}) {
  const descriptionId = useId()
  if (!description?.trim()) {
    return <h3 className="min-w-0 truncate font-bold text-sm">{name}</h3>
  }
  // The trigger is a button inside the heading, so keyboard users can focus it;
  // the tooltip does not describe its trigger, so screen readers get the
  // description from a hidden copy instead.
  return (
    <>
      <h3 className="min-w-0 font-bold text-sm">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                aria-describedby={descriptionId}
                className="block max-w-full truncate rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="button"
              />
            }
          >
            {name}
          </TooltipTrigger>
          <TooltipContent align="start" side="bottom">
            <p className="whitespace-pre-line break-words">{description}</p>
          </TooltipContent>
        </Tooltip>
      </h3>
      {/* Outside the heading, so it is not read as part of the stage name. */}
      <span className="sr-only" id={descriptionId}>
        {description}
      </span>
    </>
  )
}
