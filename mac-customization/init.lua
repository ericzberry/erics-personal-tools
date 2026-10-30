-- Hammerspoon config  (Ctrl+/ shows a cheat sheet of all shortcuts)
--   - Per-space labels (Personal / Work / Focus) in upper-right
--   - Auto-launch managed apps on login, restore size/position, place on saved space
--   - Ctrl+/ cheat sheet listing every shortcut in this setup
--   - Gmail in Chrome: Shift+R opens the reply in a separate window
--
-- macOS handles Ctrl+1 / Ctrl+2 / Ctrl+3 (Switch to Desktop) natively
-- via System Settings → Keyboard → Keyboard Shortcuts → Mission Control.
--
-- Helpers exposed in the Hammerspoon console:
--   saveAppLayout("Messages")     -- capture current window frame + space to disk
--   saveMessagesLayout()           -- shorthand
--   saveSpotifyLayout()
--   saveSlackLayout()
--   applyAppLayout("Messages")    -- restore frame + move to saved (or pinned) space
--   setupManagedApps()             -- run launch/position pass for all apps

-- Lets the `hs` command-line tool talk to Hammerspoon (used for testing).
require("hs.ipc")

local labels = { "Personal", "Work", "Focus" }
local PERSONAL_SPACE = 1
local WORK_SPACE     = 2
local FOCUS_SPACE    = 3
-- Layouts live outside the repo because they're per-machine
-- (window coordinates depend on the screen this Mac is using).
local LAYOUT_DIR = os.getenv("HOME") .. "/.hammerspoon/layouts"

-- Apps to launch on login.
-- Each entry: { name = <app name>, space = <index|nil|"all"> }
--   space = number  → always pin to that desktop, regardless of saved layout
--   space = nil     → use the desktop captured when the layout was last saved
--   space = "all"   → sticky across every desktop (canJoinAllSpaces)
local managedApps = {
  { name = "Messages",  space = PERSONAL_SPACE },  -- pinned to Personal
  { name = "Spotify",   space = PERSONAL_SPACE },  -- pinned to Personal
  { name = "Slack",     space = nil },             -- whatever desktop it was saved on
  { name = "Reminders", space = "all" },           -- sticky across every desktop
}

-- ============================================================
-- Per-space label overlay
-- ============================================================

local LABEL_W, LABEL_H = 110, 36
local MARGIN = 18
local bgColor     = { red = 0.10, green = 0.10, blue = 0.12, alpha = 0.85 }
local borderColor = { red = 0.40, green = 0.60, blue = 1.00, alpha = 0.90 }
local textColor   = { white = 1, alpha = 1 }

local labelCanvas = nil

local function getCurrentSpaceIndex()
  local screen = hs.screen.mainScreen()
  if not screen then return 1 end
  local ok, screenSpaces = pcall(hs.spaces.spacesForScreen, screen)
  if not ok or not screenSpaces then return 1 end
  local ok2, active = pcall(hs.spaces.activeSpaceOnScreen, screen)
  if not ok2 or not active then return 1 end
  for i, sid in ipairs(screenSpaces) do
    if sid == active then return i end
  end
  return 1
end

local function createCanvas()
  local screen = hs.screen.mainScreen()
  if not screen then return end
  local frame = screen:fullFrame()
  local x = frame.x + frame.w - LABEL_W - MARGIN
  local y = frame.y + MARGIN

  if labelCanvas then labelCanvas:delete() end

  labelCanvas = hs.canvas.new({ x = x, y = y, w = LABEL_W, h = LABEL_H })
  labelCanvas:appendElements({
    id = "bg", type = "rectangle", action = "fill", fillColor = bgColor,
    roundedRectRadii = { xRadius = 10, yRadius = 10 },
  })
  labelCanvas:appendElements({
    id = "border", type = "rectangle", action = "stroke", strokeColor = borderColor,
    strokeWidth = 1.5, roundedRectRadii = { xRadius = 10, yRadius = 10 },
  })
  labelCanvas:appendElements({
    id = "label", type = "text", text = "",
    textColor = textColor, textSize = 15,
    textFont = "Helvetica Neue Medium", textAlignment = "center",
    frame = { x = 0, y = 8, w = LABEL_W, h = LABEL_H - 8 },
  })

  labelCanvas:level("overlay")
  labelCanvas:behavior({ "canJoinAllSpaces", "stationary" })
  labelCanvas:show()
end

local function updateLabel()
  if not labelCanvas then createCanvas() end
  if not labelCanvas then return end
  local idx = getCurrentSpaceIndex()
  labelCanvas["label"].text = labels[idx] or ("Space " .. idx)
end

pcall(function() createCanvas(); updateLabel() end)

local spaceWatcher = hs.spaces.watcher.new(updateLabel)
spaceWatcher:start()

local screenWatcher = hs.screen.watcher.new(function()
  hs.timer.doAfter(0.5, function()
    pcall(function() createCanvas(); updateLabel() end)
  end)
end)
screenWatcher:start()

-- ============================================================
-- Generic app launch + layout persistence
-- ============================================================

-- Make sure layout dir exists. mkdir -p will silently no-op if present.
hs.execute("mkdir -p " .. LAYOUT_DIR)

local function layoutFile(appName)
  local safe = appName:gsub("[^%w]", "_")
  return LAYOUT_DIR .. "/" .. safe .. ".lua"
end

local function loadLayout(appName)
  local path = layoutFile(appName)
  local file = io.open(path, "r")
  if not file then return nil end
  local content = file:read("*a")
  file:close()
  local fn = load(content)
  if not fn then return nil end
  local ok, layout = pcall(fn)
  if not ok or type(layout) ~= "table" then return nil end
  return layout
end

-- Returns the 1-based index of the space `spaceId` within the main screen, or nil.
local function spaceIdToIndex(spaceId)
  local screen = hs.screen.mainScreen()
  if not screen then return nil end
  local ok, screenSpaces = pcall(hs.spaces.spacesForScreen, screen)
  if not ok or not screenSpaces then return nil end
  for i, sid in ipairs(screenSpaces) do
    if sid == spaceId then return i end
  end
  return nil
end

-- Returns the 1-based index of whichever space `win` is currently assigned to, or nil.
local function windowCurrentSpaceIndex(win)
  local ok, winSpaces = pcall(hs.spaces.windowSpaces, win:id())
  if not ok or not winSpaces or not winSpaces[1] then return nil end
  return spaceIdToIndex(winSpaces[1])
end

local function saveAppLayout(appName)
  local app = hs.application.get(appName)
  if not app then
    hs.alert.show(appName .. " isn't running — open it first")
    return
  end
  local win = app:mainWindow()
  if not win then
    hs.alert.show("No " .. appName .. " main window found")
    return
  end
  local f = win:frame()
  local spaceIdx = windowCurrentSpaceIndex(win)
  local path = layoutFile(appName)
  local file = io.open(path, "w")
  if not file then
    hs.alert.show("Could not write " .. path)
    return
  end
  file:write(string.format(
    "return { x = %d, y = %d, w = %d, h = %d, space = %s }\n",
    f.x, f.y, f.w, f.h,
    spaceIdx and tostring(spaceIdx) or "nil"))
  file:close()
  hs.alert.show(string.format(
    "Saved %s: %dx%d @ (%d,%d)%s",
    appName, f.w, f.h, f.x, f.y,
    spaceIdx and (" on Desktop " .. spaceIdx) or ""))
end
_G.saveAppLayout = saveAppLayout

-- Convenience wrappers
_G.saveMessagesLayout = function() saveAppLayout("Messages") end
_G.saveSpotifyLayout  = function() saveAppLayout("Spotify")  end
_G.saveSlackLayout    = function() saveAppLayout("Slack")    end
_G.saveRemindersLayout = function() saveAppLayout("Reminders") end

local function whenAppWindowReady(appName, cb, timeoutSec)
  timeoutSec = timeoutSec or 12
  local start = hs.timer.secondsSinceEpoch()
  local function poll()
    local app = hs.application.get(appName)
    if app then
      local win = app:mainWindow()
      if win then cb(app, win); return end
    end
    if hs.timer.secondsSinceEpoch() - start > timeoutSec then return end
    hs.timer.doAfter(0.25, poll)
  end
  poll()
end

-- ============================================================
-- Sticky-window enforcement (space = "all")
-- ============================================================

-- OR canJoinAllSpaces (bit 0 = 1) into the window's existing collection
-- behavior, instead of replacing it. Preserves any other flags the app set.
local function makeWindowSticky(win)
  if not win then return false end
  return pcall(function()
    local b = win:behavior() or 0
    win:setBehavior(bit.bor(b, 1))
  end)
end

-- Apply sticky behavior to every window of a given app.
local function makeAllAppWindowsSticky(appName)
  local app = hs.application.get(appName)
  if not app then return end
  for _, win in ipairs(app:allWindows() or {}) do
    makeWindowSticky(win)
  end
end

-- Build the list of "always sticky" app names from managedApps.
local stickyAppNames = {}
for _, entry in ipairs(managedApps) do
  if entry.space == "all" then
    stickyAppNames[#stickyAppNames + 1] = entry.name
  end
end

-- For each sticky app, watch for windows being created OR focused (the latter
-- catches windows that existed before this filter was set up — windowCreated
-- doesn't backfire pre-existing windows). Filters must be kept alive in a
-- module-scope table or they'd get garbage-collected.
local stickyFilters = {}
for _, name in ipairs(stickyAppNames) do
  local f = hs.window.filter.new(name)
  f:subscribe({
    hs.window.filter.windowCreated,
    hs.window.filter.windowFocused,
    hs.window.filter.windowVisible,
  }, function(win) makeWindowSticky(win) end)
  stickyFilters[#stickyFilters + 1] = f
  -- Also re-apply to whatever windows the app currently has, right now.
  makeAllAppWindowsSticky(name)
end

-- Periodic safety net — every 5s, re-stick everything. Cheap, idempotent,
-- and guards against macOS resetting the flag (which it sometimes does
-- when an app reorders its windows).
hs.timer.new(5, function()
  for _, name in ipairs(stickyAppNames) do
    makeAllAppWindowsSticky(name)
  end
end):start()

-- ============================================================
-- Layout application
-- ============================================================

-- Apply a saved layout to an app's main window.
--   explicitSpace : if non-nil, force this desktop (overrides the saved one).
--   If explicitSpace is nil, use the space recorded in the saved layout (if any).
local function applyAppLayout(appName, explicitSpace)
  local layout = loadLayout(appName)
  whenAppWindowReady(appName, function(app, win)
    if layout then
      pcall(function()
        win:setFrame(hs.geometry.rect(layout.x, layout.y, layout.w, layout.h))
      end)
    end
    local targetSpace = explicitSpace
    if targetSpace == nil and layout then targetSpace = layout.space end
    if targetSpace == "all" then
      makeWindowSticky(win)
    elseif type(targetSpace) == "number" then
      local screen = hs.screen.mainScreen()
      if screen then
        local ok, screenSpaces = pcall(hs.spaces.spacesForScreen, screen)
        if ok and screenSpaces and screenSpaces[targetSpace] then
          pcall(hs.spaces.moveWindowToSpace, win:id(), screenSpaces[targetSpace])
        end
      end
    end
  end)
end
_G.applyAppLayout = applyAppLayout

local function setupApp(entry)
  if hs.application.get(entry.name) then
    -- Already running — just re-apply (no relaunch, no focus)
    applyAppLayout(entry.name, entry.space)
  else
    hs.application.launchOrFocus(entry.name)
    hs.timer.doAfter(0.5, function() applyAppLayout(entry.name, entry.space) end)
  end
end

local function setupManagedApps()
  for _, entry in ipairs(managedApps) do
    setupApp(entry)
  end
end
_G.setupManagedApps = setupManagedApps

-- (makeWindowSticky and the stickyApps watcher are defined further up; see
-- the "Sticky-window enforcement" section.)

-- ============================================================
-- Shortcut cheat sheet (Ctrl+/ to show, any key or Ctrl+/ again to hide)
-- ============================================================

local cheatText = table.concat({
  "SPACES",
  "  Ctrl+1   Personal",
  "  Ctrl+2   Work",
  "  Ctrl+3   Focus",
  "",
  "SPEECH TO TEXT",
  "  Left Ctrl+Opt+Cmd   Dictate",
  "",
  "FOCUS",
  "  Cmd+Opt+H   Hide all other apps",
  "",
  "GMAIL (with an email open)",
  "  Shift+R   Reply in a separate window",
  "  Shift+A   Reply all in its own window",
  "  Shift+F   Forward in its own window",
  "  Shift+C   New email in its own window",
  "",
  "Ctrl+/   Show / hide this list",
}, "\n")

local cheatAlert = nil
local cheatDismiss = nil

local function hideCheatSheet()
  if cheatAlert then hs.alert.closeSpecific(cheatAlert); cheatAlert = nil end
  if cheatDismiss then cheatDismiss:stop(); cheatDismiss = nil end
end

local function toggleCheatSheet()
  if cheatAlert then hideCheatSheet(); return end
  cheatAlert = hs.alert.show(cheatText, {
    textFont = "Menlo", textSize = 18, radius = 12,
    fillColor = { red = 0.10, green = 0.10, blue = 0.12, alpha = 0.95 },
    strokeColor = { red = 0.40, green = 0.60, blue = 1.00, alpha = 0.90 },
  }, "indefinite")
  -- Any keypress or click closes it
  cheatDismiss = hs.eventtap.new(
    { hs.eventtap.event.types.keyDown, hs.eventtap.event.types.leftMouseDown },
    function() hideCheatSheet(); return false end)
  hs.timer.doAfter(0.3, function() if cheatDismiss then cheatDismiss:start() end end)
end

hs.hotkey.bind({ "ctrl" }, "/", toggleCheatSheet)

-- ============================================================
-- Gmail: Shift+R replies in a separate browser window
-- ============================================================
-- Gmail's own Shift+R opens the reply in a box inside the Gmail tab.
-- Shift+clicking the Reply button opens it in its own window instead, so
-- when Chrome is showing Gmail (and you're not typing in a text box) this
-- finds the email's Reply button and Shift+clicks it. If it can't find one,
-- Shift+R falls through to Gmail as normal.

local ax = require("hs.axuielement")
local TEXT_ROLES = { AXTextArea = true, AXTextField = true, AXComboBox = true, AXSearchField = true }

local function chromeAX()
  local app = hs.application.frontmostApplication()
  if not app or app:name() ~= "Google Chrome" then return nil end
  local win = app:focusedWindow()
  if not win or not (win:title() or ""):match("Mail") then return nil end
  local axapp = ax.applicationElement(app)
  -- Chrome only exposes page content to accessibility clients that ask
  axapp:setAttributeValue("AXManualAccessibility", true)
  return axapp, win
end

local function isTyping(axapp)
  local f = axapp:attributeValue("AXFocusedUIElement")
  if not f then return false end
  return TEXT_ROLES[f:attributeValue("AXRole") or ""] or f:attributeValue("AXEditableAncestor") ~= nil
end

-- Last visible button labelled exactly "Reply" (the latest message in the thread)
local function findReplyButton(axwin, frame)
  local best = nil
  local function walk(e, depth)
    if depth > 80 then return end
    if e:attributeValue("AXRole") == "AXButton" then
      local label = e:attributeValue("AXDescription")
      if label == nil or label == "" then label = e:attributeValue("AXTitle") end
      if label == "Reply" then
        local pos, size = e:attributeValue("AXPosition"), e:attributeValue("AXSize")
        if pos and size and size.w > 0 and pos.y >= frame.y and pos.y + size.h <= frame.y + frame.h then
          best = { x = pos.x + size.w / 2, y = pos.y + size.h / 2 }
        end
      end
    end
    for _, k in ipairs(e:attributeValue("AXChildren") or {}) do walk(k, depth + 1) end
  end
  walk(axwin, 0)
  return best
end

local function shiftClick(pt)
  local ev = hs.eventtap.event
  local saved = hs.mouse.absolutePosition()
  ev.newMouseEvent(ev.types.leftMouseDown, pt, { "shift" }):post()
  hs.timer.usleep(30000)
  ev.newMouseEvent(ev.types.leftMouseUp, pt, { "shift" }):post()
  hs.mouse.absolutePosition(saved)
end

local R_KEY = hs.keycodes.map["r"]

gmailReplyTap = hs.eventtap.new({ hs.eventtap.event.types.keyDown }, function(e)
  if e:getKeyCode() ~= R_KEY then return false end
  local flags = e:getFlags()
  if not flags.shift or flags.cmd or flags.ctrl or flags.alt then return false end
  local ok, axapp, win = pcall(chromeAX)
  if not ok or not axapp or isTyping(axapp) then return false end
  local axwin = axapp:attributeValue("AXFocusedWindow")
  if not axwin then return false end
  local ok2, pt = pcall(findReplyButton, axwin, win:frame())
  if not ok2 or not pt then
    print("Gmail Shift+R: no visible Reply button found" .. (ok2 and "" or (": " .. tostring(pt))))
    return false
  end
  hs.timer.doAfter(0, function() shiftClick(pt) end)
  return true
end)
gmailReplyTap:start()

-- Run on Hammerspoon launch (i.e. on every login if Hammerspoon launches at login)
setupManagedApps()

hs.alert.show("Hammerspoon config loaded ✓")
