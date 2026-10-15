"use client"

import type {
  ProductMessageItem,
  ResolvedProductMessage,
} from "@chatbotx.io/sdk"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@chatbotx.io/ui/components/ui/carousel"
import { useLocale } from "next-intl"
import { ProductThumbnail } from "@/features/products/components/product-thumbnail"
import { formatPrice } from "@/lib/format-price"
import { ProductRow } from "./product-row"

type ProductMessageBubbleProps = {
  message: ResolvedProductMessage
}

function ProductCards({ items }: { items: ProductMessageItem[] }) {
  const locale = useLocale()
  return (
    <Carousel opts={{ align: "start" }}>
      <CarouselContent className="ms-0">
        {items.map((item) => (
          <CarouselItem className="basis-36 ps-0" key={item.productId}>
            <div className="p-1">
              <Card className="py-0">
                <CardContent className="flex flex-col overflow-hidden p-0">
                  <ProductThumbnail
                    className="h-24 w-full"
                    imageUrl={item.imageUrl}
                  />
                  <div className="flex flex-col gap-0.5 px-2 py-1.5">
                    <span className="truncate font-medium text-sm">
                      {item.name}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {formatPrice(locale, item.price, item.currency)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="-start-2" />
      <CarouselNext className="-end-2" />
    </Carousel>
  )
}

/** A product appears once per message, so a section is identified by its first one. */
const sectionKey = (section: { title?: string; items: ProductMessageItem[] }) =>
  section.items[0]?.productId ?? section.title

/**
 * The products a contact was sent, as the snapshot taken at send time. The
 * body is not repeated here — the message text above already shows it.
 */
export function ProductMessageBubble({ message }: ProductMessageBubbleProps) {
  const locale = useLocale()
  if (message.display === "carousel") {
    return (
      <div className="mt-1">
        <ProductCards items={message.items} />
      </div>
    )
  }

  return (
    <div className="mt-1 flex flex-col gap-2">
      {message.header && message.body && (
        <span className="font-semibold text-sm">{message.header}</span>
      )}
      {message.sections.map((section) => (
        <section className="flex flex-col gap-1.5" key={sectionKey(section)}>
          {section.title && (
            <h4 className="font-medium text-muted-foreground text-xs">
              {section.title}
            </h4>
          )}
          <ul className="flex flex-col gap-1.5">
            {section.items.map((item) => (
              <ProductRow
                detail={formatPrice(locale, item.price, item.currency)}
                imageUrl={item.imageUrl}
                key={item.productId}
                name={item.name}
              />
            ))}
          </ul>
        </section>
      ))}
      {message.footer && (
        <span className="text-muted-foreground text-xs">{message.footer}</span>
      )}
    </div>
  )
}
