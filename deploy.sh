#!/bin/bash
# deploy.sh — corre EN EL VPS, dentro de la carpeta del proyecto, después de
# cada `git push` desde tu máquina local.
#
# Uso (en el VPS):
#   bash deploy.sh                      # backend + frontend (si cambió) + reload pm2
#   bash deploy.sh --skip-frontend      # solo backend (hotfix de API)
#   bash deploy.sh --skip-deps          # no corre npm install
#   bash deploy.sh --frontend-only      # solo recompila el frontend; no toca pm2
#   bash deploy.sh --reload-nginx       # también valida y recarga nginx al final
#
# Requisitos previos (una sola vez, ver README.md / BASE_GEOVISORES/DEPLOY.md):
#   - Repo propio en GitHub, clonado en $APP_DIR.
#   - backend/.env con valores reales de producción (NO se versiona en git).
#   - pm2 ya tiene el proceso registrado con --name "$APP_NAME" (primera vez:
#     pm2 start src/server.js --name "$APP_NAME" --cwd "$APP_DIR/backend").

set -e

# ════════════════════════════════════════════════════════════════
APP_DIR="/var/www/geovisores/san-andres"
APP_NAME="gv-san-andres"
# Carpeta que genera `npm run build` (= VITE_BASE sin las barras)
BUILD_DIR="SAN_ANDRES"
# ════════════════════════════════════════════════════════════════

SKIP_FRONTEND=false
SKIP_DEPS=false
FRONTEND_ONLY=false
RELOAD_NGINX=false
for arg in "$@"; do
  case $arg in
    --skip-frontend) SKIP_FRONTEND=true ;;
    --skip-deps)     SKIP_DEPS=true ;;
    --frontend-only) FRONTEND_ONLY=true ;;
    --reload-nginx)  RELOAD_NGINX=true ;;
    -h|--help)
      grep -E '^#( |!|$)' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "❌ Flag desconocida: $arg"
      exit 1
      ;;
  esac
done

cd "$APP_DIR"

BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo ""
echo "╔════════════════════════════════════════════╗"
echo "║   Deploy — $APP_NAME"
echo "║   rama: $BRANCH"
echo "╚════════════════════════════════════════════╝"
echo ""

echo "📥 [1/4] git pull origin $BRANCH …"
git pull origin "$BRANCH"

CHANGED=$(git diff --name-only HEAD@{1} HEAD 2>/dev/null || echo "")
CHANGED_BACKEND_DEPS=$(echo "$CHANGED" | grep -E '^backend/package(-lock)?\.json$' || true)
CHANGED_FRONTEND_DEPS=$(echo "$CHANGED" | grep -E '^frontend/package(-lock)?\.json$' || true)
CHANGED_FRONTEND_SRC=$(echo "$CHANGED" | grep -E '^frontend/(src|public|index\.html|login\.html|admin-users\.html|vite\.config)' || true)
CHANGED_NGINX=$(echo "$CHANGED" | grep -E '^nginx\.conf$' || true)

if $FRONTEND_ONLY; then
  echo "🎨 Modo --frontend-only"
  cd "$APP_DIR/frontend"
  if ! $SKIP_DEPS && [ -n "$CHANGED_FRONTEND_DEPS" ]; then npm install --silent; fi
  npm run build
  echo "✅ Frontend recompilado en frontend/$BUILD_DIR/ — nginx ya lo sirve, no requiere reload."
  exit 0
fi

echo ""
cd "$APP_DIR/backend"
if ! $SKIP_DEPS && [ -n "$CHANGED_BACKEND_DEPS" ]; then
  echo "🔧 [2/4] Backend deps cambiaron — npm install…"
  npm install --production --silent
else
  echo "⏭️  [2/4] Sin cambios en deps de backend"
fi

echo ""
if $SKIP_FRONTEND; then
  echo "⏭️  [3/4] Frontend saltado (--skip-frontend)"
elif [ -z "$CHANGED_FRONTEND_DEPS" ] && [ -z "$CHANGED_FRONTEND_SRC" ]; then
  echo "⏭️  [3/4] Sin cambios en frontend"
else
  echo "🎨 [3/4] Frontend — build…"
  cd "$APP_DIR/frontend"
  if ! $SKIP_DEPS && [ -n "$CHANGED_FRONTEND_DEPS" ]; then npm install --silent; fi
  npm run build
fi

echo ""
echo "🔄 [4/4] pm2 restart $APP_NAME --update-env…"
pm2 restart "$APP_NAME" --update-env
pm2 save --silent

if $RELOAD_NGINX || [ -n "$CHANGED_NGINX" ]; then
  echo ""
  echo "🌐 Validando nginx…"
  sudo nginx -t
  echo "🌐 Recargando nginx…"
  sudo systemctl reload nginx
fi

echo ""
echo "✅ Deploy completo — $(date '+%Y-%m-%d %H:%M:%S')"
pm2 status "$APP_NAME"
echo ""
echo "  Logs en vivo: pm2 logs $APP_NAME"
