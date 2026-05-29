# UQM-MegaMod

The Ur-Quan Masters MegaMod — a C fork of The Ur-Quan Masters + HD-mod
adding HD-graphics remastering, QoL features, options, and content. This
file is the project memory for Claude Code sessions and subagents.

## TL;DR for any agent

- This is a **C** codebase (~860 .c/.h files) targeting Linux, macOS,
  Windows (MSYS2 / Visual Studio), with SDL2 / libpng / libogg / libvorbis /
  zlib as hard deps and Lua bundled in-tree.
- Build system is the legacy Serge-van-den-Boom **`./build.sh`** wrapper
  around `make`. It is **interactive on first run** — see
  ["Non-interactive build"](#non-interactive-build) below; this is the gate
  for any autonomous work.
- There is **no unit-test suite** and **no separate linter**. The build
  itself (with `-W -Wall`) is the only verification — getting a successful
  compile *is* the test. State this honestly in PRs rather than claiming
  tests run.
- A **SessionStart hook** at `.claude/hooks/session-start.sh` installs deps
  and pre-generates `build.vars` in fresh containers. If you land in a
  session where `build.sh` complains about missing libraries or pops a
  menu, that hook didn't run — investigate before working around it.

## Build

### Dependencies (Debian / Ubuntu)
```
build-essential libogg-dev libpng-dev libsdl2-dev libvorbis-dev libz-dev
```
On macOS use Homebrew (`brew install libogg libpng libvorbis sdl2`). On
Windows use MSYS2/MinGW packages or the Visual Studio solutions under
`build/msvs2019/` (or `build/msvs2008/`).

### Non-interactive build

The first invocation of `./build.sh uqm` drops into a text config menu.
The default selections are correct — pressing `<ENTER>` accepts them and
critically selects the **bundled (internal) Lua** (there is no system Lua
in this image). The validated non-interactive recipe is:

```sh
# One-time configuration (fast, no compile). Generates build.vars.
printf '\n\n\n\n\n\n\n\n\n\n' | ./build.sh uqm config

# Compile (debug build by default -> ./UrQuanMastersDebug).
./build.sh uqm -j$(nproc)
```

`yes ''` also works, but pipes SIGPIPE through `pipefail` — use finite
input in scripts. To reconfigure later: `./build.sh uqm reprocess_config`
(uses existing `config.state`; if there is none, it falls back to **system
Lua** and the build fails on `lua.h` — re-run the `config` step instead).

### Useful build commands

| Goal                              | Command                              |
|-----------------------------------|--------------------------------------|
| Configure (interactive)           | `./build.sh uqm config`              |
| Configure (non-interactive)       | `printf '\n\n\n' \| ./build.sh uqm config` |
| Compile, parallel                 | `./build.sh uqm -j$(nproc)`          |
| Reconfigure from saved state      | `./build.sh uqm reprocess_config`    |
| Clean object files                | `./build.sh uqm clean`               |
| Wipe everything (incl. config)    | `./build.sh distclean`               |
| Install (after config'd location) | `./build.sh uqm install`             |
| Quick single-file syntax check    | `gcc -c -Isrc -Isrc/regex -I. -DUSE_INTERNAL_LUA $(pkg-config --cflags sdl2 libpng) -W -Wall --std=gnu99 src/<file>.c -o /dev/null` |

The default build is **DEBUG** → `UrQuanMastersDebug`. A release build
needs reconfiguring via the menu (toggle the debug option) and produces
`UrQuanMasters`.

### Running the game

The compiled binary **cannot run without game content**, which lives in a
separate repository:
<https://github.com/JHGuitarFreak/UQM-MegaMod-Content>. Copy its contents
into `./content/`. CI / autonomous agents normally only need to compile,
not run — running needs an X server, audio, and the content.

## Directory map

```
src/                C sources for the game and engine
  uqm.c, port.c     Entry point and portability layer
  options.[ch]      Command-line and runtime options
  config_*.h        Per-platform config (generated on Unix)
  uqm/              Game logic
    comm/           Communication / dialog screens
    lua/            Lua scripting integration (luacomm, luafuncs/, …)
    planets/        Star system & planet code
    ships/          Per-ship combat AI and assets
    supermelee/     Super Melee mode + netplay
  libs/             Engine subsystems (each typically has its own dir)
    graphics/  input/  sound/  file/  math/  list/  callback/  log/
    lua/            Bundled Lua interpreter (used iff USE_INTERNAL_LUA)
    luauqm/         UQM <-> Lua bridge
    decomp/         Compression
    cdp/            CD-audio (legacy)
  regex/            Bundled POSIX regex (used iff system lacks it)
  res/              Resource files (icons, .desktop)
  abxadec/ darwin/ getopt/ symbian/   Platform-specific support

content/            Game assets — separate repo, NOT in this tree
build/              Build scripts and IDE projects
  unix/             The shell build system (build.config, menu_functions, …)
  msvs2008/ msvs2019/    Visual Studio solutions
  msys2-depend.sh   MSYS2 helper to copy DLLs next to the binary
  win32_install/ unix_installer/ macos_dmg/    Packaging
dev-lib/            Bundled Windows-side libs and DLLs
doc/                Author/release/user docs (handy for context)
tools/              Standalone helpers (font renderer, anim tool, etc.)
Makefile.build      Top-level make rules used by build.sh
Makeproject         Defines the `uqm` target and its install layout
```

## Coding conventions (from `Contributing`)

- **Indentation:** one TAB per level. Tabs only for indenting — use
  spaces for any in-line alignment.
- **Line length:** 76 chars max at a tab width of 4.
- **Continuation lines:** indent **two extra levels** past the opening
  line.
- **Braces:** `{` on its own line for both functions and inner blocks.
- **Spacing:** one space around binary operators, after commas, between
  function name and `(` in both decl and call (yes, even calls), and
  after `if` / `while` / `do` / `for` / `switch`.
- **No same-line guard bodies** — `if (a)` on one line, `a--;` on the
  next, even for one-liners.
- **Line endings:** LF only.
- **Portability:** must compile cleanly on Windows (MSVC 2022 / GCC 6),
  Linux / FreeBSD / macOS (GCC 4+). Wrap unavoidable platform code in
  `#ifdef`. Only use portable functions; check return values; never trust
  user-input length.
- **No "added by X" comments** — the changelog and git history are
  where attribution lives.
- **No warnings in new code** — `-W -Wall` is on; existing warnings are a
  known debt, do not add to them.

`./uqm-indent` wraps GNU `indent` with the project's style flags. **Do
NOT auto-format whole files** — it touches a lot of unrelated lines and
will get a PR rejected. Use it on a single new block only if you need a
sanity check; commit hand-formatted code.

## Constraints worth knowing

- **No tests:** there is no `make test` and no test framework. If a
  change is risky, the best you can do is compile-clean + describe a
  manual smoke test in the PR.
- **Multi-platform code:** changes that touch I/O, paths, threading,
  endianness, or signals must consider Windows + macOS, not just Linux.
- **`build.vars` and `config.state` are gitignored** — they're per-host
  build state, not source.
- **MegaMod is incompatible with stock UQM and other mods** by design.
  Do not adopt patches from upstream UQM, HD-mod, Balance Mod, etc. as
  if they were drop-in fixes; check the MegaMod changelog first.
- **External contact / community:** issues land at
  <https://github.com/JHGuitarFreak/UQM-MegaMod/issues>; design
  discussion happens on the New Alliance of Free Stars Discord. Do not
  open issues, PRs, or comments on behalf of the user without explicit
  approval.
- **Content repo is separate:** content/asset changes belong in
  <https://github.com/JHGuitarFreak/UQM-MegaMod-Content>, not here.

## License

GPL-2.0-or-later (see `LICENSE`). Any contribution must be GPL-compatible.
