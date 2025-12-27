import { Button } from "@aha.chat/ui/components/ui/button"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@aha.chat/ui/components/ui/carousel"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@aha.chat/ui/components/ui/tooltip"
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
} from "lucide-react"
import { memo, useState } from "react"
import { useFieldArray, useFormContext } from "react-hook-form"
import { TemplateBody } from "../components/body"
import { TemplateVideoPreview } from "../video/preview"
import { templateVideoDefaultValue } from "../video/schema"

type TemplateCarouselVideoPreviewProps = {
  parentName?: string
}

const TemplateCarouselVideoPreviewComponent = (
  props: TemplateCarouselVideoPreviewProps,
) => {
  const { parentName = "content" } = props

  const { control } = useFormContext()
  const [api, setApi] = useState<CarouselApi>()
  const [current, setCurrent] = useState<number>()

  const { fields, append, remove, swap } = useFieldArray({
    control,
    name: `${parentName}.cards`,
  })

  const addCard = () => {
    append(templateVideoDefaultValue())
    setCurrent(api?.selectedScrollSnap())
  }

  const removeCard = () => {
    remove(api?.selectedScrollSnap())
  }

  const onNext = () => {
    if (!api) {
      return
    }

    api.scrollNext()
    setCurrent(api.selectedScrollSnap())
  }

  const onPrev = () => {
    if (!api) {
      return
    }

    api.scrollPrev()
    setCurrent(api.selectedScrollSnap())
  }

  return (
    <>
      <CardContent className="rounded bg-white p-4">
        <TemplateBody parentName={`${parentName}.body`} />
      </CardContent>
      <CardContent className="relative mt-4 rounded bg-white px-8 py-4">
        <Carousel opts={{ dragFree: false }} setApi={setApi}>
          <CarouselContent>
            {fields.map((field, index) => (
              <CarouselItem className="" key={field.id}>
                <Card className="p-1">
                  <TemplateVideoPreview
                    maxButtons={2}
                    minButtons={1}
                    parentName={`${parentName}.cards.${index}`}
                  />
                </Card>
                <div className="mt-2 flex items-center justify-center">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          disabled={fields.length <= 2}
                          onClick={removeCard}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <Minus size={25} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Delete</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          disabled={index === 0}
                          onClick={() => swap(index, index - 1)}
                          type="button"
                          variant="ghost"
                        >
                          <ArrowLeft size={25} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Move Left</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          disabled={index === fields.length - 1}
                          onClick={() => swap(index, index + 1)}
                          type="button"
                          variant="ghost"
                        >
                          <ArrowRight size={25} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Move Right</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button onClick={addCard} type="button" variant="ghost">
                          <Plus size={25} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Add</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>

        {fields.length > 1 && (
          <>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="absolute top-1/2 right-0 size-8 shrink-0 -translate-y-1/2"
                    disabled={current === fields.length - 1}
                    onClick={onNext}
                    type="button"
                    variant="ghost"
                  >
                    <ChevronRight size={25} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Next</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="absolute top-1/2 -left-0 size-8 shrink-0 -translate-y-1/2"
                    disabled={current === 0}
                    onClick={onPrev}
                    type="button"
                    variant="ghost"
                  >
                    <ChevronLeft size={25} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Prev</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        )}
      </CardContent>
    </>
  )
}

export const TemplateCarouselVideoPreview = memo(
  TemplateCarouselVideoPreviewComponent,
)
