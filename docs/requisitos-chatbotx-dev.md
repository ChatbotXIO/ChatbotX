# Solicitud de Infraestructura — Servidor DEV ChatbotX

> Para: Fer (infraestructura)
> De: Fede
> Objetivo: crear el servidor del entorno de **desarrollo** de ChatbotX.
> La aplicación y los servicios de datos se levantan con Docker Compose.
> Referencia: https://chatbotx.io/docs/installation/docker-compose#requirements

---

## 1. Servidor (1 sola instancia)

| Recurso    | Valor                                                           |
| ---------- | --------------------------------------------------------------- |
| Tipo       | `c7i.xlarge` — 4 vCPU / 8 GB RAM (confirmado con Fer)        |
| SO         | Ubuntu 24.04 LTS                                                |
| Disco      | 50 GB SSD                                                       |
| Acceso     | **IP pública directa, SIN Load Balancer** (suficiente para dev) |
| Elastic IP | 1 IP fija asignada al servidor                                  |
| Software   | **Docker 24+** y **Docker Compose v2.20+** instalados           |

> **Todo va en este mismo servidor**: base de datos, Redis, storage y la app.
> No hace falta ningún servidor separado ni LB para dev.
> La seguridad la dan los Security Groups (puertos restringidos), no un LB.

## 2. Acceso al servidor — por Teleport (lo configura Fer)

- **NO se abre el puerto 22 (SSH)** — el acceso es por **Teleport**
- Fer instala el agente de Teleport en el server y da de alta el usuario de Fede
- Fede accede con `tsh ssh usuario@<server>`

> El puerto 22 queda cerrado al mundo. Todo el acceso administrativo
> pasa por Teleport, que es más seguro que exponer SSH.

## 3. Servicios de datos (los levanta Fede con Docker, EN EL MISMO EC2)

> Decisión: postgres y redis los levanta **Fede con Docker** usando la imagen
> oficial del proyecto (`timescale/timescaledb-ha:pg18-all`, que ya trae
> TimescaleDB + pgvector). Fer solo entrega el server con Docker instalado.

### 3.1 Base de datos — PostgreSQL

| Recurso       | Valor                                            |
| ------------- | ------------------------------------------------ |
| Motor         | PostgreSQL 18 con **TimescaleDB** + **pgvector** |
| Base de datos | `chatbotx`                                       |
| Usuario       | `chatbotx`                                       |
| Password      | `secretkey` (dev)                                |
| Puerto        | 5432                                             |
| Dónde         | Mismo EC2 — **NO RDS** (RDS no soporta TimescaleDB) |

### 3.2 Storage de archivos — RustFS (S3-compatible)

| Recurso       | Valor                                |
| ------------- | ------------------------------------ |
| Servicio      | RustFS (S3-compatible)               |
| Access key    | `chatbotx`                           |
| Secret key    | `secretkey` (dev)                    |
| Bucket        | `chatbotx` (creado y con permiso público de lectura) |
| Puerto        | 9000 (API) y 9001 (consola)          |
| Dónde         | Mismo EC2                            |

> La app guarda fotos, audios, documentos y avatares en este servicio.

### 3.3 Redis

| Recurso  | Valor              |
| -------- | ------------------ |
| Servicio | Redis 7.x u 8.x    |
| Puerto   | 6379               |
| Dónde    | Mismo EC2          |

> Colas de trabajo (BullMQ) + caché. Sin él, el worker no procesa mensajes.

## 4. Dominio (lo gestiona Fer — NECESARIO)

Los canales (Telegram, WhatsApp, etc.) envían webhooks a una URL pública.
Fer gestiona el dominio y crea los subdominios apuntando a la IP del servidor:

| Subdominio | Puerto interno | Para qué                     |
| ---------- | -------------- | ---------------------------- |
| `app.<dominio>` | 3123 | Builder (UI + API) |
| `ws.<dominio>`  | 1999 | Realtime (WebSocket) |
| `cdn.<dominio>` | 9000 | Storage (archivos) |

- Fer crea los registros DNS (subdominios → IP del servidor)
- El certificado TLS lo resuelve el reverse proxy (Caddy o nginx) — Fede lo configura
- **Es necesario desde el arranque** (los canales necesitan URL pública estable)

## 5. Puertos a abrir (Security Group)

| Puerto | Servicio                                     | ¿Se abre?        | Para qué                       |
| ------ | -------------------------------------------- | ---------------- | ------------------------------ |
| 22     | SSH                                          | ❌ **No**        | Acceso por Teleport (Fer)      |
| 80     | HTTP                                         | ✅ **Al mundo**  | Validación SSL del dominio (Let's Encrypt) |
| 443    | HTTPS                                        | ✅ **Al mundo**  | Web + webhooks de canales      |
| 3123   | Builder (UI)                                 | ❌ No            | Interno (reverse proxy)        |
| 1999   | Realtime (WebSocket)                         | ❌ No            | Interno (reverse proxy)        |
| 9000   | Storage API (RustFS)                         | ❌ No            | Interno (reverse proxy)        |
| 9001   | Consola storage                              | ❌ No (opcional) | Interno                        |
| 5432   | PostgreSQL                                   | ❌ No            | Solo localhost                 |
| 6379   | Redis                                        | ❌ No            | Solo localhost                 |

> **Resumen: al mundo solo 80 y 443.** Todo lo demás cerrado.
> El reverse proxy (Caddy o nginx) corre en el mismo server y alcanza los
> puertos internos (3123, 1999, 9000) por localhost — no hace falta exponerlos.
> El acceso administrativo al server es por Teleport, no por SSH público.

## 6. Datos que Fer entrega a Fede

| Dato | De dónde sale |
| ---- | ------------- |
| IP pública del servidor | Elastic IP |
| Acceso por Teleport (usuario dado de alta) | Teleport — configurado por Fer |
| Confirmación de Docker + Compose instalados | Software del server |
| Confirmación de puertos abiertos (80/443 al mundo) | Security Group |
| Subdominios creados (app/ws/cdn) apuntando a la IP | DNS — gestionado por Fer |
