#!/usr/bin/env bash
# mac-customization setup script
#
# Sets up a Mac to match this repo: Hammerspoon config, Ctrl+1/2/3 desktop
# switching, and system-defaults tweaks. Idempotent — re-run any time;
# nothing here breaks if it's already been applied.
#
#   bash ~/erics-personal-tools/mac-customization/setup.sh

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ------------------------------------------------------------
# Hammerspoon
# ------------------------------------------------------------

if [ ! -d /Applications/Hammerspoon.app ]; then
  echo "→ Installing Hammerspoon"
  if command -v brew >/dev/null 2>&1; then
    brew install --cask hammerspoon
  else
    echo "  Homebrew not found. Install Hammerspoon from https://www.hammerspoon.org/ and re-run." >&2
    exit 1
  fi
fi

echo "→ Hammerspoon: link ~/.hammerspoon/init.lua to this repo"
mkdir -p ~/.hammerspoon
if [ -e ~/.hammerspoon/init.lua ] && [ ! -L ~/.hammerspoon/init.lua ]; then
  backup=~/.hammerspoon/init.lua.bak-$(date +%Y%m%d-%H%M%S)
  mv ~/.hammerspoon/init.lua "$backup"
  echo "  (kept your old config at $backup)"
fi
ln -sfn "$HERE/init.lua" ~/.hammerspoon/init.lua

echo "→ Hammerspoon: launch at login"
defaults write org.hammerspoon.Hammerspoon MJLaunchAtLoginKey -bool true
osascript -e 'tell application "System Events" to if not (exists login item "Hammerspoon") then make login item at end with properties {path:"/Applications/Hammerspoon.app", hidden:true}' >/dev/null

# ------------------------------------------------------------
# Spaces: Ctrl+1 / Ctrl+2 / Ctrl+3 switch to Desktop 1 / 2 / 3
# ------------------------------------------------------------

echo "→ Spaces: keep desktops in a fixed order"
defaults write com.apple.dock mru-spaces -bool false

echo "→ Spaces: Ctrl+1/2/3 switch to Desktop 1/2/3"
# Symbolic hotkey IDs 118–120 are "Switch to Desktop 1–3".
# Parameters: ASCII char, virtual key code, modifier mask (262144 = Control).
set_desktop_hotkey() {
  defaults write com.apple.symbolichotkeys AppleSymbolicHotKeys -dict-add "$1" \
    "<dict><key>enabled</key><true/><key>value</key><dict><key>parameters</key><array><integer>$2</integer><integer>$3</integer><integer>262144</integer></array><key>type</key><string>standard</string></dict></dict>"
}
set_desktop_hotkey 118 49 18
set_desktop_hotkey 119 50 19
set_desktop_hotkey 120 51 20
/System/Library/PrivateFrameworks/SystemAdministration.framework/Resources/activateSettings -u

# ------------------------------------------------------------
# Finder
# ------------------------------------------------------------

echo "→ Finder: default to list view (Nlsv)"
defaults write com.apple.finder FXPreferredViewStyle -string "Nlsv"

# ------------------------------------------------------------
# Apply
# ------------------------------------------------------------

# Restarting the Dock is what makes macOS actually register the
# Ctrl+2 / Ctrl+3 desktop shortcuts (only Ctrl+1 works until then).
echo "→ Restarting Finder and Dock so changes take effect"
killall Finder || true
killall Dock || true

echo "→ (Re)starting Hammerspoon"
killall Hammerspoon 2>/dev/null || true
sleep 1
open -a Hammerspoon

echo
echo "Done. A few things macOS won't let a script do:"
echo "  1. Give Hammerspoon Accessibility access if it asks"
echo "     (System Settings → Privacy & Security → Accessibility)."
echo "  2. If you don't have 3 desktops yet: open Mission Control (F3), click +"
echo "     until there are 3, then re-run this script so Ctrl+2/3 register."
echo "  Press Ctrl+/ to see every shortcut."
