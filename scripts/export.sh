#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/apps/web"
DIST="$ROOT/dist"
NAME="agent-up-web"

echo "==> Building..."
cd "$WEB"
pnpm build

echo "==> Packaging..."
rm -rf "$DIST/$NAME"
mkdir -p "$DIST/$NAME"

cp -r "$WEB/.next"    "$DIST/$NAME/.next"
cp -r "$WEB/public"   "$DIST/$NAME/public"
cp -r "$WEB/data"     "$DIST/$NAME/data"
cp    "$WEB/next.config.ts" "$DIST/$NAME/next.config.ts"

cat > "$DIST/$NAME/package.json" <<'PKG'
{
  "name": "agent-up-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "start": "next start -p 3000",
    "dev": "next dev -p 3000"
  },
  "dependencies": {
    "next": "16.2.10",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "zod": "^3.24.0"
  }
}
PKG

cat > "$DIST/$NAME/start.sh" <<'RUN'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install --omit=dev
fi
echo "Starting on http://localhost:3000"
npx next start -p 3000
RUN
chmod +x "$DIST/$NAME/start.sh"

echo "==> Creating tarball..."
cd "$DIST"
tar -czf "$NAME.tar.gz" "$NAME"

echo ""
echo "Done!"
echo "  Directory : $DIST/$NAME/"
echo "  Tarball   : $DIST/$NAME.tar.gz"
echo ""
echo "Usage:"
echo "  tar xzf $NAME.tar.gz"
echo "  cd $NAME"
echo "  ./start.sh"
