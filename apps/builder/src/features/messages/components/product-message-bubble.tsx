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
import { PackageSearchIcon } from "lucide-react"
import Image from "next/image"
import { useLocale } from "next-intl"
import { formatPrice } from "@/lib/format-price"

type ProductMessageBubbleProps = {
  message: ResolvedProductMessage
}

function ProductImage({
  imageUrl,
  className,
}: {
  imageUrl: string | null
  className: string
}) {
  if (!imageUrl) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center bg-muted text-muted-foreground ${className}`}
      >
        <PackageSearchIcon aria-hidden className="size-4" />
      </div>
    )
  }
  return (
    <Image
      alt=""
      className={`shrink-0 object-cover ${className}`}
      height={64}
      src={imageUrl}
      width={64}
    />
  )
}

function ProductRow({ item }: { item: ProductMessageItem }) {
  const locale = useLocale()
  return (
    <li className="flex items-center gap-2">
      <ProductImage className="size-10 rounded" imageUrl={item.imageUrl} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-sm">{item.name}</span>
        <span className="text-muted-foreground text-xs">
          {formatPrice(locale, item.price, item.currency)}
        </span>
      </div>
    </li>
  )
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
                  <ProductImage
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
              <ProductRow item={item} key={item.productId} />
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
