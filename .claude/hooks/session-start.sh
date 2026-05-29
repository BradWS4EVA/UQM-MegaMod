#!/bin/bash
# SessionStart hook: prepare a fresh container so UQM-MegaMod can be built.
#
# Installs the C build dependencies and generates the non-interactive build
# configuration. Idempotent and safe to re-run. Synchronous on purpose so
# that any agent doing build/compile work has a ready toolchain before the
# session starts. The full compile itself is intentionally NOT run here
# (it takes several minutes) -- that is the job of the build-validator agent
# or an explicit `./build.sh uqm -j` invocation.
set -euo pipefail

# Only do heavyweight setup in the remote (Claude Code on the web) container.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# 1. Install build dependencies if any are missing (cheap pkg-config probe).
need_deps=0
for pc in sdl2 libpng ogg vorbis vorbisfile zlib; do
  pkg-config --exists "$pc" 2>/dev/null || need_deps=1
done

if [ "$need_deps" -eq 1 ]; then
  echo "[session-start] Installing UQM-MegaMod build dependencies..."
  # apt-get update can fail on unrelated third-party PPAs in this image;
  # the base Ubuntu archive is cached, so install directly without update.
  apt-get install -y -qq \
    build-essential libogg-dev libpng-dev libsdl2-dev libvorbis-dev libz-dev \
    >/dev/null 2>&1 || {
      echo "[session-start] Direct install failed; retrying after apt-get update..."
      apt-get update -qq -o Acquire::AllowInsecureRepositories=true 2>/dev/null || true
      apt-get install -y -qq \
        build-essential libogg-dev libpng-dev libsdl2-dev libvorbis-dev libz-dev
    }
else
  echo "[session-start] Build dependencies already present."
fi

# 2. Generate the non-interactive build configuration if absent.
#    Feeding blank lines accepts every default in the text config menu, which
#    selects the bundled (internal) Lua -- required, no system Lua here.
#    Finite input (not `yes`) avoids a SIGPIPE that pipefail would surface.
if [ ! -f build.vars ]; then
  echo "[session-start] Generating default build configuration..."
  printf '\n\n\n\n\n\n\n\n\n\n' | ./build.sh uqm config >/dev/null 2>&1
  if grep -q "uqm_USE_INTERNAL_LUA='1'" build.vars 2>/dev/null; then
    echo "[session-start] build.vars created (internal Lua enabled)."
  else
    echo "[session-start] WARNING: build.vars missing internal Lua flag." >&2
  fi
else
  echo "[session-start] build.vars already present."
fi

echo "[session-start] Ready. Build with: ./build.sh uqm -j\$(nproc)"
