import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@chatbotx.io/ui/components/ui/carousel"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
} from "lucide-react"
import { useTranslations } from "next-intl"
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
  const t = useTranslations()

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
                      <TooltipTrigger
                        render={
                          <Button
                            disabled={fields.length <= 2}
                            onClick={removeCard}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <Minus size={25} />
                          </Button>
                        }
                      />
                      <TooltipContent>
                        <p>{t("actions.delete")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            disabled={index === 0}
                            onClick={() => swap(index, index - 1)}
                            type="button"
                            variant="ghost"
                          >
                            <ArrowLeft className="rtl:rotate-180" size={25} />
                          </Button>
                        }
                      />
                      <TooltipContent>
                        <p>{t("actions.moveEarlier")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            disabled={index === fields.length - 1}
                            onClick={() => swap(index, index + 1)}
                            type="button"
                            variant="ghost"
                          >
                            <ArrowRight className="rtl:rotate-180" size={25} />
                          </Button>
                        }
                      />
                      <TooltipContent>
                        <p>{t("actions.moveLater")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            onClick={addCard}
                            type="button"
                            variant="ghost"
                          >
                            <Plus size={25} />
                          </Button>
                        }
                      />
                      <TooltipContent>
                        <p>{t("actions.add")}</p>
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
                <TooltipTrigger
                  render={
                    <Button
                      className="absolute end-0 top-1/2 size-8 shrink-0 -translate-y-1/2"
                      disabled={current === fields.length - 1}
                      onClick={onNext}
                      type="button"
                      variant="ghost"
                    >
                      <ChevronRight className="rtl:rotate-180" size={25} />
                    </Button>
                  }
                />
                <TooltipContent>
                  <p>{t("actions.next")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      className="absolute start-0 top-1/2 size-8 shrink-0 -translate-y-1/2"
                      disabled={current === 0}
                      onClick={onPrev}
                      type="button"
                      variant="ghost"
                    >
                      <ChevronLeft className="rtl:rotate-180" size={25} />
                    </Button>
                  }
                />
                <TooltipContent>
                  <p>{t("actions.prev")}</p>
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
