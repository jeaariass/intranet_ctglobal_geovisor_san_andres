# GeoVisor Carmen de Apicalá — CTGlobal
**GV-002** · Versión 1.0.0 · Stack: Node.js + Express · Vite + OpenLayers · PostgreSQL/PostGIS · GeoServer

Sistema de información geográfica web para el municipio de Carmen de Apicalá (Tolima), Colombia. Permite visualizar y consultar las capas cartográficas del Esquema de Ordenamiento Territorial (EOT), con repositorio documental, encuestas ciudadanas y gestión de accesos por roles.

---

## Tabla de contenido

- [Arquitectura](#arquitectura)
- [Requisitos](#requisitos)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Configuración local (desarrollo)](#configuración-local-desarrollo)
- [Variables de entorno](#variables-de-entorno)
- [Sistema de roles y permisos](#sistema-de-roles-y-permisos)
- [Módulos del frontend](#módulos-del-frontend)
- [API del backend](#api-del-backend)
- [Despliegue en producción](#despliegue-en-producción)
- [Nginx — configuración completa](#nginx--configuración-completa)
- [Puertos del servidor](#puertos-del-servidor)
- [Flujo de autenticación](#flujo-de-autenticación)
- [Repositorio documental](#repositorio-documental)
- [Añadir un nuevo geovisor](#añadir-un-nuevo-geovisor)

---

## Arquitectura

```
Usuario (navegador)
        │ HTTPS
        ▼
   geo.ctglobal.com.co  (Nginx · SSL Certbot)
        │
        ├─► /CARMEN_DE_APICALA/              → archivos estáticos (Vite build)
        ├─► /CARMEN_DE_APICALA/api/gv/carmen → backend Node.js :4003
        ├─► /api/gv/carmen/                  → alias sin prefijo (mismo backend)
        ├─► /api/intranet/                   → proxy a intranet CTGlobal :4000
        ├─► /geoserver/                      → proxy a GeoServer Docker :8080
        └─► /CARMEN_DE_APICALA/gv-carmen-docs/ → PDFs/documentos del backend
```

**Infraestructura VPS (200.7.107.14)**
| Servicio | Puerto | Descripción |
|---|---|---|
| Intranet CTGlobal | 4000 | Emisor único de JWT — auth centralizada |
| GeoVisor Carmen backend | 4003 | API REST de este geovisor |
| GeoServer (Docker) | 8080 | Servidor cartográfico WMS/WFS |
| PostgreSQL/PostGIS (Docker) | 5432 | Base de datos espacial |

**DNS (Hostinger)**
```
A  geo  →  200.7.107.14
```

---

## Requisitos

- Node.js ≥ 18
- npm ≥ 9
- Acceso a la intranet CTGlobal v2 (para autenticación)
- GeoServer con workspace `Carmen_Apicala` configurado

---

## Estructura del proyecto

```
gv-carmen/
├── backend/
│   ├── .env                        ← variables de entorno (NO subir a git)
│   ├── .env.example                ← plantilla de variables
│   ├── package.json
│   ├── public/
│   │   └── docs/
│   │       ├── normativa/          ← PDFs normativos
│   │       ├── diagnosticos/       ← documentos de diagnóstico
│   │       └── cartografia/        ← mapas e imágenes cartográficas
│   └── src/
│       ├── server.js               ← entrada principal
│       ├── middleware/
│       │   └── auth.js             ← verificación JWT
│       └── routes/
│           ├── verify.js           ← proxy de verificación a la intranet
│           ├── layers.js           ← configuración de capas WMS
│           ├── files.js            ← listado de PDFs
│           └── docs.js             ← gestión documental (multer)
│
└── frontend/
    ├── .env                        ← variables de desarrollo (NO subir a git)
    ├── .env.example                ← plantilla de variables
    ├── .env.production             ← variables de producción (NO subir a git)
    ├── vite.config.js
    ├── index.html                  ← mapa principal
    ├── login.html                  ← pantalla de acceso
    ├── admin-users.html            ← gestión de usuarios (solo EDITOR)
    └── src/
        ├── auth/
        │   ├── guard.js            ← protección de rutas + logout modal
        │   ├── login.js            ← lógica del formulario de login
        │   └── login.css
        ├── services/
        │   └── api.js              ← cliente HTTP (gvApi + intranetApi)
        ├── utils/
        │   ├── token.js            ← manejo del JWT en localStorage
        │   └── permissions.js      ← tabla de roles y permisos
        └── js/
            ├── main.js             ← bootstrap del geovisor
            ├── map.js              ← mapa base OpenLayers
            ├── layers.js           ← UI y lógica de capas WMS
            ├── identify.js         ← consulta de entidades (GetFeatureInfo)
            ├── measure.js          ← medición de áreas y perímetros
            ├── layerQuery.js       ← búsqueda WFS con autocomplete
            ├── print.js            ← impresión/exportación del mapa
            ├── upload.js           ← carga de GeoJSON/KML/Shapefile al mapa
            ├── coordpicker.js      ← captura de coordenadas por clic
            ├── docRepo.js          ← repositorio documental vinculado a capas
            ├── docUpload.js        ← panel drag & drop para subir documentos
            ├── encuestas.js        ← wizard de encuestas ciudadanas (6 pasos)
            ├── pdfOverlay.js       ← capas PDF georreferenciadas
            ├── config.js           ← configuración de rutas GeoServer
            └── style.css
```

---

## Configuración local (desarrollo)

### 1. Backend

```bash
cd backend
cp .env.example .env
# Edita .env con tus valores locales
npm install
npm run dev        # nodemon en :4003
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env
# Edita .env con tus valores locales
npm install
npm run dev        # Vite en :5173
```

Abre: `http://localhost:5173/CARMEN_DE_APICALA/login.html`

### Proxy Vite (solo desarrollo)

`vite.config.js` redirige automáticamente en local:

| Ruta | Destino | Uso |
|---|---|---|
| `/gv-carmen-docs` | `localhost:4003` | Archivos del repositorio documental |
| `/api/gv/carmen` | `localhost:4003` | API del geovisor |
| `/api/intranet` | `localhost:4000` | Intranet CTGlobal (auth) |
| `/geoserver` | `200.7.107.14:8080` | GeoServer (evita CORS) |

---

## Variables de entorno

### `backend/.env`

```dotenv
PORT=4003
NODE_ENV=development

# DEBE coincidir exactamente con el JWT_SECRET de la intranet CTGlobal
JWT_SECRET=tu_clave_secreta_aqui

INTRANET_URL=http://localhost:4000
API_KEY=ctg_live_gv002_carmen_apicala

GEOSERVER_URL=http://200.7.107.14:8080/geoserver
GEOSERVER_WORKSPACE=carmen_apicala

PUBLIC_URL=https://geo.ctglobal.com.co
```

> **Crítico:** `JWT_SECRET` debe ser idéntico al de `intranet/.env`, **sin comillas**.

### `frontend/.env`

```dotenv
VITE_API_URL=/api/gv/carmen
VITE_INTRANET_URL=/api/intranet
VITE_PROJECT_API_KEY=ctg_live_gv002_carmen_apicala
VITE_PROJECT_NAME=Carmen de Apicalá — EOT
VITE_BASE=/CARMEN_DE_APICALA/
```

### `frontend/.env.production`

```dotenv
VITE_API_URL=/api/gv/carmen
VITE_INTRANET_URL=/api/intranet
VITE_PROJECT_API_KEY=ctg_live_gv002_carmen_apicala
VITE_PROJECT_NAME=Carmen de Apicalá — EOT
VITE_BASE=/CARMEN_DE_APICALA/
```

---

## Sistema de roles y permisos

Definido en `frontend/src/utils/permissions.js`.

| Permiso | VIEWER | FUNCIONARIO | EDITOR |
|---|:---:|:---:|:---:|
| Ver capas, buscar predio | ✓ | ✓ | ✓ |
| Medir distancia/área | ✓ | ✓ | ✓ |
| Identificar entidad (GetFeatureInfo) | ✓ | ✓ | ✓ |
| Ver tabla de atributos (WFS) | ✓ | ✓ | ✓ |
| Imprimir mapa | — | ✓ | ✓ |
| Captura de coordenadas | — | ✓ | ✓ |
| Subir archivos al mapa (GeoJSON/KML) | — | ✓ | ✓ |
| Subir documentos al repositorio | — | — | ✓ |
| Panel de gestión de usuarios | — | — | ✓ |

El rol `FUNCIONARIO` debe estar registrado en el enum `ProjectRol` del schema Prisma de la intranet:

```bash
# En el servidor de la intranet
npx prisma db push
npx prisma generate
pm2 restart intranet-ctglobal
```

---

## Módulos del frontend

### Autenticación
- `login.html` → POST `/api/intranet/api/geoauth/login`
- Guarda `ctg_token`, `ctg_session`, `ctg_user`, `ctg_project` en `localStorage`
- `guard.js` protege cada página y gestiona el logout con modal personalizado

### Mapa base
- OpenLayers cargado por CDN
- Tres mapas base: Callejero (OSM), Satelital (Esri), Terreno (OpenTopoMap)
- Coordenadas en tres formatos: Geográficas, Geodésicas MAGNA-SIRGAS 9377, Planas 3857

### Capas WMS
- Configuradas en `layers.js` con workspace `Carmen_Apicala`
- Dock inferior de capas activas con control de orden (drag & drop) y opacidad
- Grupos: Cartografía Básica, Predios Urbanos

### Repositorio documental (`docRepo.js`)
- Carga el manifiesto desde `/api/gv/carmen/docs/manifest` (requiere token)
- Tres carpetas: Normativa, Diagnósticos, Cartografía
- Visor de PDF e imágenes embebido
- Historial local en `localStorage`

### Encuestas ciudadanas (`encuestas.js`)
- Wizard de 6 pasos: Ubicación → Percepción → Diagnóstico → Inventario → Participación → Historial
- Captura de coordenadas por clic en el mapa
- Persistencia local en `localStorage` (clave: `cda_surveys_v1`)
- Sin base de datos — preparado para conectar a Postgres

---

## API del backend

Base URL en producción: `https://geo.ctglobal.com.co/api/gv/carmen`

Todos los endpoints requieren `Authorization: Bearer <token>` excepto `/health`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del servidor |
| GET | `/verify` | Verificar token con la intranet |
| GET | `/layers` | Configuración de capas WMS del proyecto |
| GET | `/files/pdfs` | Listado de PDFs disponibles |
| GET | `/docs/manifest` | Catálogo dinámico del repositorio documental |
| GET | `/docs/categorias` | Lista de categorías del repositorio |
| POST | `/docs/upload` | Subir archivo al repositorio (multer, campo `files`) |
| GET | `/docs/file/:categoria/:nombre` | Servir un archivo con auth |
| DELETE | `/docs/file/:categoria/:nombre` | Eliminar archivo (solo EDITOR) |

---

## Despliegue en producción

### 1. Código en el VPS

```bash
ssh usuario@200.7.107.14
mkdir -p /var/www/geovisores/carmen
cd /var/www/geovisores/carmen
git clone <repo> .

cd backend
npm install --production
mkdir -p public/docs/{normativa,diagnosticos,cartografia}
```

Crea `/var/www/geovisores/carmen/backend/.env` con los valores de producción.

### 2. PM2

```bash
pm2 start /var/www/geovisores/carmen/backend/src/server.js \
  --name gv-carmen \
  --cwd /var/www/geovisores/carmen/backend

pm2 save
pm2 logs gv-carmen --lines 20
```

### 3. Build del frontend

En tu **máquina local**:

```bash
cd frontend
npm run build
# Genera dist/ con index.html, login.html, admin-users.html y assets/
```

Verifica que las rutas en `dist/login.html` contengan `/CARMEN_DE_APICALA/assets/...`.

Sube el contenido de `dist/` al VPS con WinSCP:
- Destino: `/var/www/geovisores/carmen/CARMEN_DE_APICALA/`

### 4. SSL

```bash
certbot --nginx -d geo.ctglobal.com.co
systemctl reload nginx
```

### 5. CORS en la intranet

En `intranet/backend/src/server.js` asegúrate de incluir:

```javascript
const allowedOrigins = [
  'https://intranet.ctglobal.com.co',
  'https://geo.ctglobal.com.co',      // ← geovisores
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean);

app.set('trust proxy', 1);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS bloqueado: ${origin}`));
    }
  },
  credentials: true,
}));
```

```bash
pm2 restart intranet-ctglobal
```

---

## Nginx — configuración completa

`/etc/nginx/sites-available/geo-ctglobal`

```nginx
server {
    listen 80;
    server_name geo.ctglobal.com.co;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name geo.ctglobal.com.co;

    ssl_certificate     /etc/letsencrypt/live/geo.ctglobal.com.co/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/geo.ctglobal.com.co/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # ── Intranet CTGlobal (auth / login) ───────────────────────
    location /api/intranet/ {
        proxy_pass         http://localhost:4000/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # ── GeoServer ──────────────────────────────────────────────
    location /geoserver/ {
        proxy_pass         http://localhost:8080/geoserver/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_read_timeout 300s;
    }

    # ════════════════════════════════════════════════════════════
    # GeoVisor Carmen de Apicalá
    # ════════════════════════════════════════════════════════════

    # API sin prefijo (peticiones del frontend sin base path)
    location /api/gv/carmen/ {
        proxy_pass         http://localhost:4003/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # Documentos del repositorio sin prefijo
    location /gv-carmen-docs/ {
        alias /var/www/geovisores/carmen/backend/public/;
        try_files $uri =404;
    }

    # Documentos del repositorio con prefijo
    location /CARMEN_DE_APICALA/gv-carmen-docs/ {
        alias /var/www/geovisores/carmen/backend/public/;
        try_files $uri =404;
    }

    # API backend con prefijo
    location /CARMEN_DE_APICALA/api/gv/carmen/ {
        proxy_pass         http://localhost:4003/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # Frontend estático (SPA)
    location /CARMEN_DE_APICALA/ {
        root /var/www/geovisores/carmen/;
        try_files $uri $uri/ /CARMEN_DE_APICALA/index.html;
    }

    # ════════════════════════════════════════════════════════════
    # Futuros geovisores — agregar aquí
    # ════════════════════════════════════════════════════════════
    # location /FUSAGASUGA/ { ... }
}
```

```bash
nginx -t && systemctl reload nginx
```

---

## Puertos del servidor

| Puerto | Proceso PM2 | Descripción |
|---|---|---|
| 4000 | `intranet-ctglobal` | Intranet CTGlobal v2 |
| 4003 | `gv-carmen` | GeoVisor Carmen de Apicalá |
| 8080 | Docker | GeoServer 2.28.x |
| 5432 | Docker | PostgreSQL/PostGIS |

---

## Flujo de autenticación

```
1. login.html → POST /api/intranet/api/geoauth/login  (con x-api-key del proyecto)
2. Intranet valida credenciales y retorna JWT (8h) + sessionId + datos del usuario
3. Frontend guarda: ctg_token, ctg_session, ctg_user, ctg_project en localStorage
4. Cada petición al backend lleva: Authorization: Bearer <token>
5. backend/src/middleware/auth.js verifica con jwt.verify(token, JWT_SECRET)
6. Al cerrar sesión: POST /api/intranet/api/geoauth/session-end
```

---

## Repositorio documental

Los documentos se almacenan en el servidor, no en git:

```
backend/public/docs/
├── normativa/        ← Acuerdos, resoluciones, EOT
├── diagnosticos/     ← Estudios técnicos, diagnósticos sectoriales
└── cartografia/      ← Mapas JPG/PNG, PDFs cartográficos
```

Para subir documentos desde el navegador: botón **Cargar documentos** (solo rol EDITOR).

Para subir documentos directamente al servidor via WinSCP:
- Destino: `/var/www/geovisores/carmen/backend/public/docs/<categoria>/`

El manifiesto se genera dinámicamente desde disco — no hay archivo JSON que mantener.

---

## Añadir un nuevo geovisor

Ejemplo para Fusagasugá en puerto 4004:

**1. PM2**
```bash
pm2 start /var/www/geovisores/fusagasuga/backend/src/server.js \
  --name gv-fusagasuga \
  --cwd /var/www/geovisores/fusagasuga/backend
pm2 save
```

**2. Nginx** — agregar dentro del mismo `server { }`:
```nginx
location /api/gv/fusagasuga/ {
    proxy_pass http://localhost:4004/api/;
    ...
}
location /FUSAGASUGA/api/gv/fusagasuga/ {
    proxy_pass http://localhost:4004/api/;
    ...
}
location /FUSAGASUGA/gv-fusagasuga-docs/ {
    alias /var/www/geovisores/fusagasuga/backend/public/;
    try_files $uri =404;
}
location /FUSAGASUGA/ {
    root /var/www/geovisores/fusagasuga/;
    try_files $uri $uri/ /FUSAGASUGA/index.html;
}
```

**3. CORS** — agregar `https://geo.ctglobal.com.co` ya cubre todos los geovisores bajo ese subdominio. No se requiere ningún cambio adicional en la intranet.

---

## Notas de desarrollo

- Los imports dinámicos en `main.js` **no** deben usar `/* @vite-ignore */` — Vite necesita procesarlos para generar los chunks hasheados correctamente en producción.
- El `JWT_SECRET` debe ser idéntico en `backend/.env` y en `intranet/.env`, **sin comillas** alrededor del valor.
- En producción Nginx reemplaza completamente al proxy de Vite. El `vite.config.js` solo aplica en desarrollo local.
- El bloque de assets estáticos en Nginx **no** es necesario — el bloque `/CARMEN_DE_APICALA/` con `root` sirve correctamente tanto HTML como JS/CSS/imágenes.

---

## Licencia

Proyecto propietario — CTGlobal · Conexión Territorial Global SAS · 2025