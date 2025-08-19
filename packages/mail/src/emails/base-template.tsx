import {
  Body,
  Container,
  Head,
  Html,
  pixelBasedPreset,
  Tailwind,
} from "@react-email/components"
import type { ReactNode } from "react"

export function BaseTempate({ children }: { children: ReactNode }) {
  return (
    <Html>
      <Head />
      <Body>
        <Container>
          <Tailwind
            config={{
              presets: [pixelBasedPreset],
              theme: {
                extend: {
                  colors: {
                    brand: "#007291",
                  },
                },
              },
            }}
          >
            {children}
          </Tailwind>
        </Container>
      </Body>
    </Html>
  )
}

export default BaseTempate
