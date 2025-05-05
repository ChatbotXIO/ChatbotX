import { useFieldArray, useFormContext } from "react-hook-form"
import { TemplateBody } from "../components/body"
import { Card, CardContent } from "@/components/ui/card"
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
} from "lucide-react"
import { templateImageDefaultValue } from "../image/schema"
import { useState } from "react"
import { TemplateImagePreview } from "../image/preview"

export const TemplateCarouselImagePreview = ({
  parentName = "content",
}: {
  parentName?: string
}) => {
  const { control } = useFormContext()
  const [api, setApi] = useState<CarouselApi>()
  const [current, setCurrent] = useState<number>()

  const { fields, append, remove, swap } = useFieldArray({
    control,
    name: `${parentName}.cards`,
  })

  const addCard = () => {
    append(templateImageDefaultValue())
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
      <CardContent className="bg-white p-4 rounded">
        <TemplateBody parentName={`${parentName}.body`} />
      </CardContent>
      <CardContent className="bg-white py-4 px-8 rounded mt-4 relative">
        <Carousel setApi={setApi} opts={{ dragFree: false }}>
          <CarouselContent>
            {fields.map((field, index) => (
              <CarouselItem className="" key={field.id}>
                <Card className="p-1">
                  <TemplateImagePreview
                    parentName={`${parentName}.cards.${index}`}
                    maxButtons={2}
                  />
                </Card>
                <div className="flex justify-center items-center mt-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={removeCard}
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={fields.length <= 2}
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
                          type="button"
                          variant="ghost"
                          onClick={() => swap(index, index - 1)}
                          disabled={index === 0}
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
                          type="button"
                          variant="ghost"
                          onClick={() => swap(index, index + 1)}
                          disabled={index === fields.length - 1}
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
                        <Button type="button" variant="ghost" onClick={addCard}>
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
                    type="button"
                    variant="ghost"
                    className="absolute size-8 shrink-0 top-1/2 right-0 -translate-y-1/2"
                    disabled={current === fields.length - 1}
                    onClick={onNext}
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
                    type="button"
                    variant="ghost"
                    className="absolute size-8 shrink-0 top-1/2 -left-0 -translate-y-1/2"
                    disabled={current === 0}
                    onClick={onPrev}
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
