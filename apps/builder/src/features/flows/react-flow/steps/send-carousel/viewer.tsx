"use client"

import type { SendCarouselStepSchema } from "@chatbotx.io/flow-config"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@chatbotx.io/ui/components/ui/carousel"
import SendCardStepViewer from "@/features/flows/react-flow/steps/send-card/viewer"

const SendCarouselStepViewer = ({ data }: { data: SendCarouselStepSchema }) => (
  <Carousel className="pointer-events-none">
    <CarouselContent>
      {data.cards.map((card) => (
        <CarouselItem key={card.id}>
          <SendCardStepViewer data={card} />
        </CarouselItem>
      ))}
    </CarouselContent>
  </Carousel>
)

export default SendCarouselStepViewer
