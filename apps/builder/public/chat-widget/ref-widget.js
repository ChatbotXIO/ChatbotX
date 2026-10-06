/**
 * Ref link chat widget: a column of channel buttons (Messenger, WhatsApp, …)
 * pinned to the bottom-left corner of the host page.
 *
 *   <script async src="<appUrl>/chat-widget/ref-widget.js" data-reflink-id="<id>"></script>
 *
 * Settings (channels, authorized domains, branding) are fetched from
 * `<appUrl>/api/reflink-widget/<id>`, so editing them never requires
 * re-pasting the snippet. Any failure (unauthorized domain, deleted link, no
 * channel) renders nothing. Keep the look in sync with the dashboard preview
 * (`features/reflinks/components/reflink-chat-widget-preview.tsx`).
 */
;(() => {
  const script = document.currentScript
  if (!script) {
    return
  }

  const reflinkId = script.getAttribute("data-reflink-id")
  if (!reflinkId || window.__chatbotxRefWidgets?.[reflinkId]) {
    return
  }
  window.__chatbotxRefWidgets = window.__chatbotxRefWidgets || {}
  window.__chatbotxRefWidgets[reflinkId] = true

  const baseUrl = new URL(script.src).origin
  const ICON_CHANNELS = [
    "messenger",
    "whatsapp",
    "instagram",
    "telegram",
    "zalo",
    "webchat",
  ]

  const iconUrl = (channel) =>
    `${baseUrl}/chat-widget/icons/${ICON_CHANNELS.includes(channel) ? channel : "chat"}.svg`

  const STYLE = `
    :host { all: initial; }
    .container {
      /* Tucked into the corner like Callbell: the toggle sits ~22px from the
         bottom edge, with the small powered-by line right under it. */
      position: fixed; left: 16px; bottom: 6px; z-index: 2147483000;
      display: flex; flex-direction: column; align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      /* The closed list still takes up room above the toggle; let clicks on
         that empty area reach the page underneath. */
      pointer-events: none;
    }
    .button, .powered-by { pointer-events: auto; }
    .button {
      display: block; width: 56px; height: 56px; padding: 0; border: 0;
      border-radius: 9999px; background: #fff; cursor: pointer; overflow: hidden;
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
      transition: transform 0.15s ease;
    }
    .button:hover { transform: scale(1.08); }
    .toggle:active { transform: scale(0.94); }
    .button img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .powered-by {
      display: inline-flex; align-items: center; gap: 3px; margin-top: 6px;
      font-size: 10px; line-height: 1; color: #64748b;
    }
    .powered-by a { color: #3b82f6; text-decoration: underline; }

    /*
     * Open/close motion, modelled on Callbell's widget (react-pose): the list
     * fades as a whole while each channel slides 30px on a spring, staggered
     * 120ms top-down on open and bottom-up on close. Only transform and
     * opacity move, so the browser animates on the compositor.
     * The spring (stiffness 500, damping 25) is sampled into linear(); older
     * browsers without linear() keep the close cubic-bezier fallback.
     */
    .container {
      --fade: 0.3s cubic-bezier(0, 0, 0.2, 1);
      --spring-duration: 0.45s;
      --spring: cubic-bezier(0.34, 1.3, 0.64, 1);
    }
    @supports (transition-timing-function: linear(0, 1)) {
      .container {
        --spring: linear(0, 0.049, 0.172, 0.333, 0.505, 0.67, 0.814, 0.93, 1.016, 1.074, 1.107, 1.12, 1.117, 1.105, 1.086, 1.066, 1.045, 1.027, 1.012, 1.001, 0.993, 0.988, 0.986, 0.986, 0.987, 0.989, 0.991, 0.994, 0.996, 0.998, 1);
      }
    }
    .channels {
      display: flex; flex-direction: column; gap: 14px; margin-bottom: 14px;
      transition: opacity var(--fade);
    }
    .channels.closed {
      opacity: 0; visibility: hidden;
      transition: opacity var(--fade), visibility 0s linear 0.3s;
    }
    /* The wrapper animates open/close; the inner .button keeps its own
       hover transition, so the stagger delay never slows down hover. */
    .channel {
      will-change: transform, opacity;
      transition:
        transform var(--spring-duration) var(--spring) var(--open-delay),
        opacity var(--fade) var(--open-delay);
    }
    .channels.closed .channel {
      opacity: 0;
      transform: translateY(30px);
      transition:
        transform var(--spring-duration) var(--spring) var(--close-delay),
        opacity var(--fade) var(--close-delay);
    }
    /* Shown only while the channels are open; it keeps its room when hidden
       so the toggle never shifts. */
    .powered-by {
      opacity: 0; visibility: hidden; transform: translateY(5px);
      transition:
        transform var(--spring-duration) var(--spring) 0.35s,
        opacity var(--fade) 0.35s,
        visibility 0s linear 0.65s;
    }
    .container.open .powered-by {
      opacity: 1; visibility: visible; transform: none;
      transition:
        transform var(--spring-duration) var(--spring) 0.35s,
        opacity var(--fade) 0.35s;
    }
    @media (prefers-reduced-motion: reduce) {
      .channels, .channels.closed, .channel, .channels.closed .channel,
      .button, .powered-by, .container.open .powered-by { transition: none; }
    }
  `

  const POWERED_BY_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="#ecc94b" stroke="#ecc94b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>'

  const createElement = (tag, className, attributes) => {
    const element = document.createElement(tag)
    if (className) {
      element.className = className
    }
    for (const [key, value] of Object.entries(attributes || {})) {
      element.setAttribute(key, value)
    }
    return element
  }

  const createImage = (src, alt, fallbackSrc) => {
    const image = createElement("img", "", { src, alt })
    if (fallbackSrc) {
      image.addEventListener(
        "error",
        () => {
          image.src = fallbackSrc
        },
        { once: true },
      )
    }
    return image
  }

  const buildPoweredByUrl = (brandUrl) => {
    try {
      const url = new URL(brandUrl)
      url.searchParams.set("utm_source", window.location.hostname)
      url.searchParams.set("utm_medium", "web-widget")
      return url.toString()
    } catch {
      return brandUrl
    }
  }

  const render = ({ channels, brand }) => {
    const host = createElement("div", "", {
      "data-chatbotx-ref-widget": reflinkId,
    })
    const root = host.attachShadow({ mode: "open" })
    const style = document.createElement("style")
    style.textContent = STYLE
    root.appendChild(style)

    const container = createElement("div", "container")
    const list = createElement("div", "channels closed", {
      "aria-hidden": "true",
    })
    list.inert = true

    // Callbell's timing: 120ms apart, top-down on open (after a 20ms lead)
    // and bottom-up on close.
    const STAGGER_MS = 120
    const OPEN_LEAD_MS = 20
    for (const [index, channel] of channels.entries()) {
      const wrapper = createElement("div", "channel")
      wrapper.style.setProperty(
        "--open-delay",
        `${OPEN_LEAD_MS + index * STAGGER_MS}ms`,
      )
      wrapper.style.setProperty(
        "--close-delay",
        `${(channels.length - 1 - index) * STAGGER_MS}ms`,
      )
      const button = createElement("a", "button", {
        href: channel.url,
        target: "_blank",
        rel: "noopener noreferrer",
        title: channel.name,
        "aria-label": channel.name,
      })
      button.appendChild(createImage(iconUrl(channel.channel), channel.name))
      wrapper.appendChild(button)
      list.appendChild(wrapper)
    }

    const toggle = createElement("button", "button toggle", {
      type: "button",
      title: brand.name,
      "aria-label": brand.name,
      "aria-expanded": "false",
    })
    const fallbackLogo = iconUrl("chat")
    const logo = createImage(
      brand.logoUrl || fallbackLogo,
      brand.name,
      fallbackLogo,
    )
    toggle.appendChild(logo)
    toggle.addEventListener("click", () => {
      const open = list.classList.toggle("closed") === false
      container.classList.toggle("open", open)
      list.inert = !open
      list.setAttribute("aria-hidden", String(!open))
      toggle.setAttribute("aria-expanded", String(open))
    })

    const poweredBy = createElement("small", "powered-by")
    poweredBy.innerHTML = POWERED_BY_ICON
    const byLabel = document.createElement("span")
    byLabel.textContent = brand.poweredByLabel || "by"
    const brandLink = createElement("a", "", {
      href: buildPoweredByUrl(brand.url),
      target: "_blank",
      rel: "noopener",
    })
    brandLink.textContent = brand.name
    poweredBy.append(byLabel, brandLink)

    container.append(list, toggle, poweredBy)
    root.appendChild(container)
    if (document.body) {
      document.body.appendChild(host)
    } else {
      document.addEventListener("DOMContentLoaded", () =>
        document.body.appendChild(host),
      )
    }
  }

  fetch(`${baseUrl}/api/reflink-widget/${encodeURIComponent(reflinkId)}`)
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (data?.channels?.length) {
        render(data)
      }
    })
    .catch(() => {
      // Unauthorized domain or network failure: render nothing.
    })
})()
