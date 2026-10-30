# mac-customization

Mac-specific tooling and config. Currently this is a [Hammerspoon](https://www.hammerspoon.org/) config; more may land here later (Karabiner, defaults scripts, etc.).

## What `init.lua` does

- **Per-space label badge** — small dark pill in the upper-right of every desktop showing which space you're on (`Personal` / `Work` / `Focus`). Visible across all spaces; updates instantly when you switch.
- **Auto-launch + position managed apps** — on Hammerspoon launch, opens each app in the `managedApps` list, restores its saved size/position, and moves it to its assigned space.
- **Layout capture** — call `saveAppLayout("Messages")` (or the convenience wrappers) from the Hammerspoon Console to snapshot an app's current window frame **and current space** to `~/.hammerspoon/layouts/<app>.lua`. That file is read on every config load.

- **Cheat sheet** — `Ctrl+/` shows every shortcut in this setup on screen.

`Ctrl+1` / `Ctrl+2` / `Ctrl+3` are handled natively by macOS (Mission Control shortcuts). `setup.sh` turns them on.

## Install on a new Mac

```sh
git clone git@github.com:ericzberry/erics-personal-tools.git ~/erics-personal-tools
bash ~/erics-personal-tools/mac-customization/setup.sh
```

`setup.sh` is idempotent and does everything a script can:

- Installs Hammerspoon (via Homebrew) if it's missing
- Symlinks `~/.hammerspoon/init.lua` to this repo's `init.lua` (backs up any existing file), so a `git pull` updates every Mac
- Sets Hammerspoon to launch at login
- Turns off "Automatically rearrange Spaces" and binds `Ctrl+1/2/3` to Desktop 1/2/3
- Finder → default to **List view**
- Restarts Finder, Dock and Hammerspoon. Restarting the Dock is what makes macOS register `Ctrl+2`/`Ctrl+3`. Without it only `Ctrl+1` works.

Then do the parts macOS won't let a script do:

1. Grant Hammerspoon **Accessibility** in System Settings → Privacy & Security.
2. Make 3 desktops in Mission Control (Personal / Work / Focus). If you add them after running the script, run it again so `Ctrl+2/3` register.
3. Capture app layouts (per-machine). Position each managed app, then in the Hammerspoon Console run `saveMessagesLayout()`, `saveSpotifyLayout()`, `saveSlackLayout()`.

Press **`Ctrl+/`** any time for an on-screen cheat sheet of every shortcut (spaces, speech to text, focus, Gmail).

## Files

```
mac-customization/
├── README.md
├── init.lua          # Hammerspoon config
└── setup.sh          # one-command setup for a new Mac (Hammerspoon, Spaces, Finder)
```

`~/.hammerspoon/layouts/` is created at runtime and lives **outside the repo** — window coordinates and space assignments are per-machine.

## Adding a new managed app

In `init.lua`, append to `managedApps`. Each entry is `{ name = "<App Name>", space = <index|nil> }`. If `space` is `nil`, the app uses whatever space was current when you last called `saveAppLayout`.

```lua
local managedApps = {
  { name = "Messages", space = 1 },    -- pin to Personal
  { name = "Spotify",  space = 1 },    -- pin to Personal
  { name = "Slack",    space = nil },  -- whatever space it was saved on
}
```

Then reload Hammerspoon, position the app on the desktop you want, and call `saveAppLayout("Slack")`.
