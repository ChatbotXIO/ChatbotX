# Solicitud de Infraestructura — Servidor PRODUCCIÓN ChatbotX

> Para: Fer (infraestructura)
> De: Fede
> Objetivo: crear el servidor del entorno de **producción** de ChatbotX.
> La aplicación y los servicios de datos se levantan con Docker Compose.
> Referencia: https://chatbotx.io/docs/installation/docker-compose#requirements

---

## 1. Servidor (1 sola instancia)

| Recurso    | Valor                                                         |
| ---------- | ------------------------------------------------------------- |
| Tipo       | 8 vCPU / 16 GB RAM (producción real, varios workspaces)       |
| SO         | Ubuntu 24.04 LTS                                              |
| Disco      | 200 GB SSD (ampliable — crece con adjuntos)                   |
| Acceso     | **Detrás de un Load Balancer (ALB)** — sin IP pública directa |
| Elastic IP | 1 IP fija (solo si se necesita salida/SSH por IP)             |
| Software   | **Docker 24+** y **Docker Compose v2.20+** instalados         |

> En producción el servidor va **detrás de un ALB**: el ALB termina el TLS y
> reenvía el tráfico al servidor. La instancia puede estar en subnet privada.
> El LB permite escalar a más instancias si la carga crece.

## 2. Load Balancer (ALB) — lo crea Fer

| Recurso | Valor |
| ------- | ----- |
| Servicio | Application Load Balancer |
| Listener | 80 → redirige a 443 (HTTPS con certificado ACM) |
| Target | El servidor EC2 (puertos 3123, 1999, 9000) |
| Health check | Sobre el puerto 3123 (Builder) |
| Red | Subnet pública; el EC2 queda en subnet privada |

> El certificado TLS lo puede emitir ACM (gestionado por Fer) o Caddy en el
> servidor (gestionado por Fede). Se define al armar prod.

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
| Password      | Segura, generada por Fede                        |
| Puerto        | 5432                                             |
| Backup        | Snapshots EBS periódicos (Fer) o script (Fede)   |
| Dónde         | Mismo EC2 — **NO RDS** (RDS no soporta TimescaleDB) |

### 3.2 Storage de archivos — RustFS (S3-compatible)

| Recurso       | Valor                                |
| ------------- | ------------------------------------ |
| Servicio      | RustFS (S3-compatible)               |
| Access key    | `chatbotx`                           |
| Secret key    | Segura, generada por Fede            |
| Bucket        | `chatbotx` (creado y con permiso público de lectura) |
| Puerto        | 9000 (API) y 9001 (consola)          |
| Backup        | Periódico (los archivos son datos del producto) |

> La app guarda fotos, audios, documentos y avatares en este servicio.

### 3.3 Redis

| Recurso  | Valor                       |
| -------- | --------------------------- |
| Servicio | Redis 7.x u 8.x             |
| Puerto   | 6379                        |
| Backup   | Recomendado (persistencia)  |

> Colas de trabajo (BullMQ) + caché. Sin él, el worker no procesa mensajes.

## 4. Dominio (lo gestiona Fer — obligatorio en producción)

Los canales (WhatsApp, Telegram, etc.) envían webhooks a una URL pública fija.
Fer gestiona el dominio y crea los subdominios apuntando al **ALB**:

| Subdominio | Puerto interno | Para qué                     |
| ---------- | -------------- | ---------------------------- |
| `app.<dominio>` | 3123 | Builder (UI + API) |
| `ws.<dominio>`  | 1999 | Realtime (WebSocket) |
| `cdn.<dominio>` | 9000 | Storage (archivos) |

- Fer crea los registros DNS (subdominios → ALB)
- El certificado TLS lo emite ACM (Fer) o Caddy (Fede)
- Sin dominio fijo, los webhooks de los canales no funcionan

## 5. Puertos a abrir (Security Group)

| Puerto | Servicio                                     | Para qué                       |
| ------ | -------------------------------------------- | ------------------------------ |
| 22     | SSH — **solo IP del equipo**                 | Entrar al servidor desde tu PC |
| 443    | HTTPS (desde el ALB únicamente)              | Tráfico web                    |
| 3123   | Builder (solo desde el ALB)                  | Acceder a la app               |
| 1999   | Realtime (solo desde el ALB)                 | WebSocket                      |
| 9000   | Storage (solo desde el ALB)                  | Archivos                       |

> ⚠️ **NO exponer al público**: 5432 (PostgreSQL), 6379 (Redis), 9001 (consola).
> El EC2 idealmente no tiene IP pública — solo recibe tráfico del ALB.

## 6. Datos que Fer entrega a Fede

| Dato | De dónde sale |
| ---- | ------------- |
| URL del ALB / DNS | Load Balancer |
| Usuario + password/llave SSH | Acceso al servidor (por bastión o VPN) |
| Confirmación de Docker + Compose instalados | Software del server |
| Confirmación de puertos abiertos | Security Group |
| Subdominios creados (app/ws/cdn) apuntando al ALB | DNS — gestionado por Fer |
