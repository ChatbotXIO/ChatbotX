;((window) => {
  // Prevent multiple initializations
  if (window.csmChatWidget) {
    return
  }

  const csmChatWidget = {
    webchatUrl: null,
    floatButton: null,
    floatHtml: null,
    init(config) {
      csmChatWidget.webchatUrl = getCurrentScriptURL()
      if (!csmChatWidget.webchatUrl) {
        return
      }

      // Load stylesheet
      const cssUrl = new URL(
        "/chat-widget/plugin.css",
        csmChatWidget.webchatUrl,
      ).toString()
      loadStylesheet(cssUrl).catch(() => {
        // stylesheet load failure is non-fatal; widget renders without custom styles
      })

      // Load icon
      const iconUrl = new URL(
        "/chat-widget/plugin-toggle.svg",
        csmChatWidget.webchatUrl,
      ).toString()

      const url = new URL("/webchat", csmChatWidget.webchatUrl)

      if (config.workspaceId) {
        url.searchParams.set("workspaceId", config.workspaceId)
      }
      if (config.webchatId) {
        url.searchParams.set("webchatId", config.webchatId)
      }
      if (config.hideHeader) {
        url.searchParams.set("hideHeader", config.hideHeader)
      }
      if (config.showLogo) {
        url.searchParams.set("showLogo", config.showLogo)
      }
      if (config.hideMessageInput) {
        url.searchParams.set("hideMessageInput", config.hideMessageInput)
      }
      if (config.brandColor) {
        url.searchParams.set("brandColor", config.brandColor)
      }

      url.searchParams.set("domain", window.location.hostname)

      csmChatWidget.floatButton = `<button type="button" class="ahc-btn"><img src="${iconUrl}" alt="Chat"></button>`
      csmChatWidget.floatHtml = `<div class="ahc-iframe-container"><iframe id="ahc-iframe" src="${url.toString()}"></iframe></div>`

      appendHtml(document.body, csmChatWidget.floatButton)
      appendHtml(document.body, csmChatWidget.floatHtml)

      const btn = document.querySelector(".ahc-btn")
      const container = document.querySelector(".ahc-iframe-container")

      if (!(btn && container)) {
        return
      }

      if (config.brandColor) {
        btn.style.backgroundColor = config.brandColor
      }

      btn.addEventListener("click", () => {
        const isOpen = container.classList.toggle("ahc-iframe-container--open")
        btn.classList.toggle("ahc-btn--open", isOpen)
      })

      const iframeOrigin = new URL(csmChatWidget.webchatUrl).origin

      window.addEventListener("message", (event) => {
        if (event.origin !== iframeOrigin) {
          return
        }
        if (event.data?.type === "ahc:hide") {
          container.classList.remove("ahc-iframe-container--open")
          btn.classList.remove("ahc-btn--open")
        }
      })
    },
  }

  function getCurrentScriptURL() {
    // Method 1: currentScript (best for synchronous scripts)
    if (document.currentScript) {
      return document.currentScript.src
    }

    if (typeof import.meta !== "undefined" && import.meta.url) {
      // Method 2: import.meta.url (for ES modules)
      return import.meta.url
    }

    // Method 3: From scripts collection (fallback)
    const scripts = document.scripts
    if (scripts.length > 0) {
      return scripts.at(-1).src
    }

    // Method 4: Stack trace (last resort)
    try {
      throw new Error("Fake error")
    } catch (e) {
      const stack = e.stack || e.stacktrace
      const lines = stack.split("\n")
      for (const line of lines) {
        // biome-ignore lint/performance/useTopLevelRegex: safe ignore
        const match = line.match(/(http[s]?:\/\/[^)]+)/)
        if (match && !match[0].includes("getCurrentScriptURL")) {
          return match[0]
        }
      }
    }

    return null
  }

  function loadStylesheet(href) {
    return new Promise((resolve, reject) => {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = href
      link.onload = resolve
      link.onerror = reject
      document.head.appendChild(link)
    })
  }

  window.csmChatWidget = csmChatWidget

  function appendHtml(el, str) {
    const div = document.createElement("div")
    div.innerHTML = str
    while (div.children.length > 0) {
      el.appendChild(div.children[0])
    }
  }
})(window)
