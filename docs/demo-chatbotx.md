# Demo ChatbotX — Guión para presentar

> Guión completo: qué mostrar y **qué decir** en cada pantalla. Duración: **10–12 min**.
> Preparar la noche anterior (checklist al final). Si algo falla → Plan B (última sección).

---

## ⚠️ Antes de arrancar (riesgos)

| Riesgo | Solución |
|---|---|
| Flujo "Autodiag" roto (se traba en "Estamos iniciando") | Arreglado en el builder la noche anterior — o NO mostrar ese camino |
| WhatsApp sin conectar | Decir: "está en configuración, esperando acceso a la cuenta de Meta" |
| URL de ngrok rotó | NO tocar ngrok antes/durante la demo |
| No buildees durante la demo | La máquina se congela |

---

# 🎤 GUIÓN

## 0. Preparación (2 min antes, sin que lo vean)

- Login `demo@example.com` en `http://localhost:3123` (ya logueado, pestaña lista)
- Telegram abierto en el celu
- Verificar bot: mandar "Hola" → responde

---

## 1. INTRO — Qué es ChatbotX (1 min)

**Qué mostrar:** nada, solo hablar.

**Qué decir:**
> "Esto es ChatbotX: una plataforma para crear **bots de atención al cliente** que funcionan en **todos los canales** — Telegram, WhatsApp, Messenger, Instagram, webchat — con un **inbox único** donde los agentes humanos pueden intervenir cuando el bot no alcanza.
>
> Lo que van a ver hoy es el caso real de **Fibi**: el asistente de Fibrazo que hace **autodiagnóstico de conexiones** — el cliente llega, el bot lo guía, detecta el problema y genera el ticket. Todo integrado con nuestro sistema (sysbrazo/Odoo).
>
> Van a ver 4 cosas: **el bot funcionando en vivo**, **cómo se arman los flujos**, **cómo trabajan los agentes** (equipos, reparto, permisos) y **la administración de la plataforma**."

---

## 2. LOGIN + HOME (1 min)

**Qué mostrar:** la home con el workspace "Fibi".

**Qué decir:**
> "Esta es la home. Acá cada negocio tiene sus **workspaces** — cada workspace es un bot con sus canales, contactos y flujos.
>
> Un detalle importante: **solo el administrador de la plataforma puede crear workspaces**. Los agentes que contratamos no pueden andar creando espacios propios — se los agrega al workspace que corresponde, con los permisos justos. Eso lo vemos en un minuto."

---

## 3. PANEL DE PLATAFORMA — Super Admin (1 min)

**Mostrar:** `/admin/platform-credentials`

**Qué decir:**
> "Este es el panel del **super admin**. Acá se administra la plataforma entera:
> - Las **credenciales de los canales** — la app de Facebook, la config de WhatsApp (que estamos conectando), el webhook de Telegram.
> - Qué canales están **habilitados** para los workspaces.
> - También branding, plantillas de email, y el registro de auditoría.
>
> Una sola configuración central, y todos los workspaces la usan. El asesor de la empresa no tiene acceso a esto — solo el administrador."

---

## 4. ⭐ EL MOMENTO CLAVE — Bot en vivo (4 min)

**Mostrar:** el celu + `/space/11641218806005760/inbox`

**Qué decir (mientras pasa):**
> "Ahora la parte más linda. **Le escribo al bot desde mi celular**… *(mandar "Hola")*
>
> *(el bot responde el saludo)*
>
> Miren: el bot responde al instante — saluda, y **guía al cliente** pidiéndole los datos. Y todo esto **aparece en vivo en el inbox** acá del panel, sin refrescar — es tiempo real, por websocket.
>
> *(mostrar la conversación apareciendo en el inbox)*
>
> Ahora lo importante: si en algún momento el bot no alcanza, **un agente humano puede tomar la conversación** — yo le respondo desde acá… *(responder desde el panel)* …y el mensaje **llega al celular**. Bot y humano conviviendo en la misma conversación.
>
> *(si da tiempo: mostrar el flujo guiando — pedir cédula, detectar problema, ofrecer autodiagnóstico)*
>
> **La clave:** el bot atiende 24/7, pero el humano aparece cuando hace falta — y todo queda en un solo hilo."

**Tips:**
- Prepará la conversación con el bot ANTES (que el flujo de bienvenida esté probado).
- Si el flujo de autodiagnóstico completo está roto, NO lo pruebes en vivo — quedate con saludo + guía + respuesta humana.

---

## 5. FLOW BUILDER (2 min)

**Mostrar:** `/space/11641218806005760/flows` — abrir el flujo de bienvenida (o el Autodiag)

**Qué decir:**
> "Así se arma todo esto — **sin escribir código**. Este es el flujo que vieron recién:
> - *(señalar nodos)* Este nodo **envía el mensaje**, este **espera la respuesta del cliente**, acá hay una **condición** que decide el camino según lo que contestó…
> - *(señalar el callApi)* Y acá está lo interesante para nosotros: un paso que **llama a nuestro sistema** (sysbrazo) — el bot le pasa los datos del cliente a nuestra API, y eso genera el ticket en Odoo.
>
> Se arma arrastrando nodos, se publica con un clic, y los cambios **aplican al instante** — no hace falta redeploy ni esperar a nadie."

---

## 6. EQUIPOS Y ASIGNACIÓN (2 min)

**Mostrar:** `/space/11641218806005760/settings/inbox-teams`

**Qué decir:**
> "Cuando el bot no alcanza, las conversaciones pasan a **agentes humanos**. Y acá está el orden:
> - Armamos **equipos** — este es 'Soporte Autodiag', donde trabajan los asesores que atienden los autodiagnósticos.
> - Las conversaciones se **asignan automáticamente y en forma equitativa**: el sistema le da cada conversación al asesor que **menos carga tenga** en las últimas 8 horas. *(mostrar el paso auto-assign en el flujo ColaSoporteAD)*
> - Nadie se satura y nadie queda libre mientras otro se llena — se reparte solo.
> - Y además se puede asignar manualmente desde la conversación."

---

## 7. PERMISOS Y ROLES (2 min)

**Mostrar:** `/space/11641218806005760/settings/admins`

**Qué decir:**
> "Acá se administra **quién puede hacer qué**:
> - **Owner** (dueño): acceso total al workspace.
> - **Agent** (asesor): solo lo que le habilitemos — en este caso **contactos, chat y analytics**, pero no puede tocar flujos ni broadcasts ni configuración.
>
> *(loguearse como el asesor en otra pestaña)*
>
> Si entro como el asesor: ve **solo su bandeja y sus contactos** — no ve la configuración, no ve los flujos, no puede romper nada. Cada uno ve lo que necesita, y nada más.
>
> **Para la empresa:** podemos darle acceso a gente externa sin miedo — no tocan lo que no deben."

---

## 8. CONTACTOS + CUSTOM FIELDS (1 min)

**Mostrar:** `/space/11641218806005760/contacts` — abrir el contacto de la conversación

**Qué decir:**
> "Cada persona que habla con el bot queda **identificada** en el sistema — con su canal, su historial y sus **campos personalizados**.
>
> Un detalle técnico que nos costó resolver: dos clientes pueden tener el **mismo teléfono** (pasa seguido). Nosotros identificamos a cada contacto por un **identificador único** del sistema, así no se mezclan las conversaciones ni los tickets. *(mencionar el fix del sourceId)*"

---

## 9. ANALYTICS / DASHBOARD (1 min)

**Mostrar:** `/space/11641218806005760/dashboard`

**Qué decir:**
> "Y acá medimos cómo está andando todo: mensajes del bot vs mensajes de humanos, contactos nuevos por canal, conversaciones activas.
>
> Sirve para demostrar el **ahorro real**: cuántas conversaciones resolvió el bot solo y cuántas tuvieron que pasar a un humano."

---

## 10. TOOLS (1 min)

**Mostrar:** `/space/11641218806005760/tools`

**Qué decir:**
> "Además del chat, la plataforma trae herramientas: **códigos QR** que entran directo al bot, **reflinks** para campañas, **minigames** (el jackpot que vieron), agendamiento, cupones, cuestionarios…
>
> *(mostrar 2-3 rápido, sin detenerse)*"

---

## 11. CIERRE — Roadmap (1 min)

**Qué decir:**
> "Para cerrar, dónde estamos:
> - **Funcionando hoy:** el bot de Telegram con autodiagnóstico e integración con nuestro sistema, equipos con reparto equitativo, permisos por rol, panel de super admin.
> - **En proceso:** **WhatsApp** — ya pedimos el acceso a la cuenta de Meta y estamos en la configuración final.
> - **Viene:** gestión de usuarios desde el panel, encuestas, y agentes de IA.
>
> Gracias — ¿preguntas?"

---

# 🔗 URLs clave

| Qué | URL |
|---|---|
| Login / Home | `http://localhost:3123` |
| Panel super admin | `/admin/platform-credentials` |
| Inbox (chat) | `/space/11641218806005760/inbox` |
| Flows | `/space/11641218806005760/flows` |
| Equipos | `/space/11641218806005760/settings/inbox-teams` |
| Miembros / roles | `/space/11641218806005760/settings/admins` |
| Contactos | `/space/11641218806005760/contacts` |
| Analytics | `/space/11641218806005760/dashboard` |
| Tools | `/space/11641218806005760/tools` |

**Cuentas:** super admin `demo@example.com` · asesor `federico.rampi+asesor@42mate.com`

---

# ✅ Checklist pre-demo (la noche anterior)

- [ ] Arreglar el flujo Autodiag en el builder (o decidir NO mostrarlo)
- [ ] Probar bot live: "Hola" → responde el welcome
- [ ] Login del asesor andando (pestaña aparte)
- [ ] NO tocar ngrok / NO buildees durante la demo
- [ ] Celu con Telegram cargado y bot iniciado

---

# 🆘 Plan B (si algo falla)

| Falla | Qué hacer |
|---|---|
| El bot no responde | Verificar worker + cola (runbook). Si no: "mostramos la conversación de antes" y seguimos con flows |
| Inbox no actualiza | F5 + revisar URL ngrok en `.env` |
| Se cae la máquina | Seguir desde el celu mostrando la conversación del bot |
| El flujo se traba | "Esto es lo que estamos desarrollando" → saltar al siguiente punto |

---

# 📝 Notas del presentador

- **Vendé el VALOR, no el detalle técnico**: "atiende solo", "se reparte la carga", "cada uno ve lo suyo", "sin escribir código".
- **El minuto 4 (bot en vivo) es el que vende** — preparalo bien.
- Si preguntan por WhatsApp: "en configuración, esperando acceso a Meta — el pipeline ya está probado con Telegram".
- Si preguntan por escala: "arquitectura de colas — aguanta ráfagas; el límite hoy es la máquina local, no la plataforma".
- Andá con calma, respirá, y si algo falla: **Plan B**.
