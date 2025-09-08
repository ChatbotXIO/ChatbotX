import { prisma } from "@aha.chat/database"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { z } from "zod"

const webchatEmbedParams = z.object({
  webchatId: z.string().cuid2(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ webchatId: string }> },
) {
  try {
    const { webchatId } = webchatEmbedParams.parse(await params)

    const webchat = await prisma.integrationWebchat.findFirst({
      where: {
        id: webchatId,
        enable: true,
      },
    })

    if (!webchat) {
      return new NextResponse("Webchat not found", { status: 404 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

    const widgetScript = `
(function() {
  'use strict';
  
  const { createElement: h, useState, useEffect } = React;
  const { createRoot } = ReactDOM;
  
  // Simple state management
  const createStore = (initialState) => {
    let state = initialState;
    const listeners = new Set();
    
    return {
      getState: () => state,
      setState: (newState) => {
        state = { ...state, ...newState };
        listeners.forEach(listener => listener(state));
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
  };
  
  // Widget component
  const WebchatWidget = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    
    const config = ${JSON.stringify(webchat)};
    const baseUrl = '${baseUrl}';
    
    const sendMessage = async (text) => {
      if (!text.trim()) return;
      
      setIsLoading(true);
      
      try {
        const response = await fetch(\`\${baseUrl}/api/guest/messages\`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: text,
            guestConversationId: getGuestConversationId(),
            chatbotId: config.chatbotId,
          }),
        });
        
        if (response.ok) {
          const newMessage = await response.json();
          setMessages(prev => [...prev, newMessage]);
          setMessage('');
        }
      } catch (error) {
        console.error('Failed to send message:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    const getGuestConversationId = () => {
      const key = 'x-conversation-id';
      let guestId = localStorage.getItem(key);
      if (!guestId) {
        guestId = \`webchat_\${Date.now()}_\${Math.random().toString(36).substr(2, 9)}\`;
        localStorage.setItem(key, guestId);
      }
      return guestId;
    };
    
    const handleSendMessage = () => {
      sendMessage(message);
    };
    
    const handleKeyPress = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    };
    
    if (!isOpen) {
      return h('div', {
        style: {
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          zIndex: 9999,
        }
      }, h('button', {
        onClick: () => setIsOpen(true),
        style: {
          height: '56px',
          width: '56px',
          borderRadius: '50%',
          border: 'none',
          backgroundColor: config.brandColor,
          color: 'white',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }
      }, h('svg', {
        width: '24',
        height: '24',
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: '2',
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
      }, h('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }))));
    }
    
    return h('div', {
      style: {
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        height: '600px',
        width: '400px',
        zIndex: 9999,
      }
    }, h('div', {
      style: {
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        backgroundColor: 'white',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
      }
    }, [
      // Header
      h('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: config.brandColor,
          borderRadius: '8px 8px 0 0',
        }
      }, [
        h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }
        }, [
          config.showLogo && h('div', {
            style: {
              height: '32px',
              width: '32px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.2)',
            }
          }),
          h('h3', {
            style: {
              margin: 0,
              fontSize: '16px',
              fontWeight: '600',
              color: 'white',
            }
          }, config.name)
        ]),
        h('button', {
          onClick: () => setIsOpen(false),
          style: {
            height: '32px',
            width: '32px',
            border: 'none',
            backgroundColor: 'transparent',
            color: 'white',
            cursor: 'pointer',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }
        }, h('svg', {
          width: '16',
          height: '16',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '2',
          strokeLinecap: 'round',
          strokeLinejoin: 'round'
        }, h('line', { x1: '18', y1: '6', x2: '6', y2: '18' }), h('line', { x1: '6', y1: '6', x2: '18', y2: '18' })))
      ]),
      
      // Messages area
      h('div', {
        style: {
          flex: 1,
          overflow: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }
      }, messages.map((msg, index) => 
        h('div', {
          key: index,
          style: {
            padding: '8px 12px',
            borderRadius: '12px',
            backgroundColor: msg.sender === 'user' ? config.brandColor : '#f3f4f6',
            color: msg.sender === 'user' ? 'white' : 'black',
            alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '80%',
          }
        }, msg.content)
      )),
      
      // Input area
      config.hideMessageInput && h('div', {
        style: {
          padding: '16px',
          borderTop: '1px solid #e5e7eb',
        }
      }, h('div', {
        style: {
          display: 'flex',
          gap: '8px',
        }
      }, [
        h('input', {
          value: message,
          onChange: (e) => setMessage(e.target.value),
          onKeyPress: handleKeyPress,
          placeholder: 'Type your message...',
          disabled: isLoading,
          style: {
            flex: 1,
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            outline: 'none',
            fontSize: '14px',
          }
        }),
        h('button', {
          onClick: handleSendMessage,
          disabled: !message.trim() || isLoading,
          style: {
            padding: '8px 12px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: config.brandColor,
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }
        }, h('svg', {
          width: '16',
          height: '16',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '2',
          strokeLinecap: 'round',
          strokeLinejoin: 'round'
        }, h('line', { x1: '22', y1: '2', x2: '11', y2: '13' }), h('polygon', { points: '22,2 15,22 11,13 2,9' })))
      ]))
    ]));
  };
  
  // Initialize widget
  const container = document.getElementById('aha-chat-widget');
  if (container) {
    const root = createRoot(container);
    root.render(h(WebchatWidget));
  }
})();
`

    return new NextResponse(widgetScript, {
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": "public, max-age=3600",
      },
    })
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: Error logging
    console.error("Error generating widget script:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
