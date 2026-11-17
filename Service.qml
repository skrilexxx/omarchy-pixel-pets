import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Hyprland
import Quickshell.Io
import Quickshell.Services.Mpris
import Quickshell.Services.UPower
import "Brain.js" as Brain

Item {
  id: root

  // Settings, edited from the bar panel (Panel.qml) and saved to disk.
  readonly property alias settings: store
  // Screen pixels per sprite pixel. The dog is drawn one step up, so the cat is the smaller of the two
  // and both keep whole, crisp pixels.
  function scaleOf(species) {
    return (({ small: 2, medium: 3, large: 4 })[store.size] || 3) + (species === "dog" ? 1 : 0)
  }

  // store.species is "cat", "dog" or "both". Each species keeps its own coat and name.
  function active(species) { return store.species === species || store.species === "both" }
  function coatOf(species) { return species === "dog" ? store.dogCoat : store.coat }
  function nameOf(species) { return species === "dog" ? store.dogName : store.name }
  function spriteUrlOf(species) { return Qt.resolvedUrl("sprites/" + species + "-" + coatOf(species) + ".png") }

  // Local time as a fractional hour, refreshed every minute, for the day cycle.
  property real hour: 0
  // Changes at midnight; the pets plan their day by it.
  property int day: 0
  function updateHour() {
    var d = new Date()
    hour = d.getHours() + d.getMinutes() / 60
    day = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()
  }
  Timer {
    interval: 60000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: { root.updateHour(); root.remind() }
  }

  // Care reminders: when a need is overdue a pet sits and asks for it until you click it.
  // With both out they take turns.
  property var lastServed: ({ water: Date.now(), food: Date.now(), break: Date.now() })
  property int asker: 0
  function remind() {
    if (!store.reminders || !store.shown || idle.isIdle) return
    var out = win.views.filter(v => v.active && v.brain)
    if (!out.length || out.some(v => v.brain.want)) return
    var mins = { water: store.waterMinutes, food: store.foodMinutes, break: store.breakMinutes }
    var now = Date.now(), due = null, most = 0
    for (var k in mins) {
      var over = now - lastServed[k] - mins[k] * 60000
      if (over >= 0 && over >= most) { due = k; most = over }
    }
    if (!due) return
    asker = (asker + 1) % out.length
    win.hurry()
    Brain.want(out[asker].brain, due)
  }
  function forget() {
    var now = Date.now()
    lastServed = { water: now, food: now, break: now }
    win.each(brain => Brain.want(brain, null))
  }
  // Away for 5+ minutes (idle, locked, asleep): start counting again from when you're back.
  IdleMonitor {
    id: idle
    timeout: 300
    onIsIdleChanged: if (!isIdle) root.forget()
  }

  // ---------- What the pets notice about the desktop ----------

  // Something is playing: tails flick faster, the dog spins more.
  readonly property bool music: Mpris.players.values.some(p => p.isPlaying)

  // Running on a low battery makes them sleepy; nearly empty, they sleep. The charger wakes them.
  readonly property real charge: {
    var d = UPower.displayDevice
    return d && d.isPresent && UPower.onBattery ? d.percentage : 1
  }
  readonly property bool lowBattery: charge < 0.2
  onLowBatteryChanged: if (!lowBattery) win.each((brain, b) => Brain.wake(brain, b))
  readonly property real energy: (store.dayCycle ? Brain.effectiveEnergy(store.energy, hour) : store.energy) * (lowBattery ? 0.4 : 1)

  // The screen is being shared or recorded. Hyprland reports a stop as soon as frames pause,
  // so only believe it after a quiet while.
  property bool casting: false
  // Hyprland reports every capture the same way: a screenshot, a workspace switcher's thumbnail,
  // a call sharing a window. What tells a share apart is that it goes on: captures have to keep
  // coming for a few seconds before the pets believe it, and one that falls silent is forgotten.
  Timer {
    id: castSure
    interval: 4000
    onTriggered: root.casting = true
  }
  Timer {
    id: castGap
    interval: 1500
    onTriggered: castSure.stop()
  }
  Timer {
    id: castOver
    interval: 15000
    onTriggered: root.casting = false
  }
  function captureSeen(on) {
    if (on) {
      castGap.stop()
      castOver.stop()
      if (!casting && !castSure.running) castSure.start()
    } else if (casting) castOver.restart()
    else castGap.restart()
  }

  // Nobody at the desk for a few minutes: they nap until the mouse moves again.
  // How long that takes is drawn anew every time, between two and a half and five minutes.
  property int napAfter: 150 + Math.floor(Math.random() * 150)
  IdleMonitor {
    timeout: root.napAfter
    onIsIdleChanged: {
      if (isIdle) win.each(brain => Brain.settle(brain))
      else {
        root.napAfter = 150 + Math.floor(Math.random() * 150)
        // The pointer is where the dog runs to; ask for it once, then greet.
        cursorSocket.connected = true
        greeting.restart()
      }
    }
  }
  Timer {
    id: greeting
    interval: 200
    onTriggered: win.each((brain, b) => Brain.welcome(brain, b, Math.random, win.cursor ? win.cursor.x : null))
  }

  function hurry() { win.hurry() }

  // ---------- Tour: everything the pets do, one thing at a time, each with its name ----------
  // Driven from outside by tools/tour.sh (omarchy-shell pixel-pets tour | status | stop).
  IpcHandler {
    target: "pixel-pets"
    function tour(): void { if (!root.touring) root.startTour() }
    function stop(): void { root.endTour() }
    // What is on right now: "3/45 Sit (cat)", "waiting" between steps, or "" when no tour runs.
    function status(): string {
      if (!root.touring || root.tourAt >= root.tourSteps.length) return ""
      var entry = root.tourSteps[root.tourAt]
      if (root.tourSince === 0) return "waiting"
      return (root.tourAt + 1) + "/" + root.tourSteps.length + " " + entry.step.name + " (" + (entry.partner ? "both" : entry.view.species) + ")"
    }
  }
  property var tourSteps: []      // { view, partner, step }, in order
  property int tourAt: -1
  property real tourSince: 0      // when the current step started; 0 while waiting for the pet to be free
  readonly property bool touring: tourAt >= 0
  function startTour() {
    var steps = [], views = win.views.filter(v => v.active)
    for (var i = 0; i < views.length; i++)
      Brain.tour(views[i].species).forEach(step => steps.push({ view: views[i], partner: null, step: step }))
    if (views.length > 1)
      Brain.tourTogether().forEach(step => steps.push({ view: dogView, partner: catView, step: step }))
    tourSteps = steps
    tourSince = 0
    tourAt = steps.length ? 0 : -1
  }
  function endTour() {
    win.each(brain => Brain.tourEnd(brain, Math.random))
    catView.caption = dogView.caption = ""
    tourAt = -1
  }
  Timer {
    interval: 200
    running: root.touring && store.shown
    repeat: true
    onTriggered: {
      if (root.tourAt >= root.tourSteps.length) return root.endTour()
      var entry = root.tourSteps[root.tourAt], view = entry.view, other = entry.partner
      var s = view.brain, f = other ? other.brain : null
      if (!view.active || !s || (other && (!other.active || !f))) { root.tourAt++; return }
      win.hurry()
      if (root.tourSince === 0) {
        // Wait until she is on the floor and free; fetch her back if she is off somewhere.
        var ready = true
        var pair = other ? [view, other] : [view]
        for (var i = 0; i < pair.length; i++) {
          Brain.freeUp(pair[i].brain, win.boundsFor(pair[i]), Math.random)
          if (!Brain.free(pair[i].brain)) ready = false
        }
        if (!ready) return
        s.ball = null
        s.staged = null
        s.want = null
        if (entry.step.start(s, win.boundsFor(view), Math.random, f) === false) { root.tourAt++; return }
        root.tourSince = Date.now()
        view.caption = entry.step.name
        if (other) other.caption = entry.step.name
        return
      }
      s.stay = 1e9
      if (f) f.stay = 1e9
      var age = (Date.now() - root.tourSince) / 1000
      if (age < entry.step.seconds && !(age > 1 && entry.step.done && entry.step.done(s))) return
      view.caption = ""
      if (other) other.caption = ""
      root.tourSince = 0
      root.tourAt++
    }
  }

  function giveBall(species) {
    var view = species === "dog" ? dogView : catView
    if (!view.brain || !store.shown) return
    hurry()
    Brain.spawnBall(view.brain, win.boundsFor(view))
    view.sync()
  }

  FileView {
    path: Quickshell.env("HOME") + "/.config/omarchy/pixel-pets.json"
    watchChanges: true
    onFileChanged: reload()
    onAdapterUpdated: writeAdapter()
    onLoadFailed: error => { if (error === FileViewError.FileNotFound) writeAdapter() }

    JsonAdapter {
      id: store
      property string name: "Mochi"
      property string species: "cat"
      property string coat: "orange"
      property string dogName: "Taro"
      property string dogCoat: "golden"
      property string size: "medium"
      property real energy: 0.5
      property bool shown: true
      property bool chaseMouse: true
      property bool hangOnWindows: true
      property bool dayCycle: true
      property bool cameraShy: true
      property bool wander: true
      property bool reminders: true
      property int waterMinutes: 45
      property int foodMinutes: 240
      property int breakMinutes: 60
      onRemindersChanged: if (!reminders) root.forget()
    }
  }

  PanelWindow {
    id: win

    readonly property var views: [catView, dogView]

    // The screen's size, kept from when the window was last up: while every pet is off screen the
    // window is taken down, and their lives go on by these numbers.
    property real fullWidth: 0
    property real fullHeight: 0
    onWidthChanged: if (width > 0) fullWidth = width
    onHeightChanged: if (height > 0) fullHeight = height

    // How often the pets are ticked, in ms: as often as the one who needs it most (Brain.tickInterval),
    // and whether any of them is on screen at all; with nobody there the window is taken down.
    // Anything done to a pet from outside the tick calls hurry(), so the answer shows at once.
    property int pace: 33
    property bool present: true
    function hurry() {
      pace = 33
      present = true
    }

    // What a pet's brain gets to know about the world, built fresh for each tick.
    function boundsFor(view) {
      var other = view === catView ? dogView : catView
      return {
        w: fullWidth - view.size,
        // The sheets leave two empty rows under the feet; stand 1px above the screen edge.
        floor: fullHeight - 1 - view.size + 2 * view.px,
        ground: fullHeight - 1,
        size: view.size,
        species: view.species,
        friend: other.brain,
        friendSize: other.size,
        peek: 10 * view.px,   // rows of the peek frame above the edge (PEEK_EDGE in make_sprites.py)
        ledges: store.hangOnWindows ? ledges : [],
        ballSize: view.ballSize,
        cursor: store.chaseMouse ? cursor : null,
        energy: root.energy,
        wander: store.wander,
        hour: root.hour,
        day: root.day,
        music: root.music,
        hide: store.cameraShy && root.casting,
        exhausted: root.charge < 0.1
      }
    }

    // Calls fn(brain, bounds) for every pet that is out.
    function each(fn) {
      hurry()
      for (var i = 0; i < views.length; i++)
        if (views[i].active && views[i].brain) fn(views[i].brain, boundsFor(views[i]))
    }

    // A window opened or closed right over a pet: startle the one whose middle is inside it.
    // A window somewhere else on the screen, or only above or beside them, is none of their business.
    function startleIn(r) {
      for (var i = 0; i < views.length; i++) {
        var v = views[i]
        if (!v.active || !v.brain) continue
        var cx = v.brain.x + v.size / 2, cy = v.brain.y + v.size * 0.6
        if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) {
          hurry()
          Brain.startle(v.brain, boundsFor(v), Math.random)
        }
      }
    }
    property string opened: ""
    property real switchedAt: 0
    function justSwitched() { return Date.now() - switchedAt < 2000 }
    Timer {
      id: openedCheck
      interval: 400   // long enough for Hyprland to report where the new window landed
      onTriggered: {
        if (win.justSwitched()) return
        win.refreshLedges()
        var r = win.rects["0x" + win.opened]
        if (r) win.startleIn(r)
      }
    }

    // Mouse position in this window's coordinates, or null when it is on another screen.
    // Read straight from Hyprland's request socket: no process per poll.
    property var cursor: null
    Socket {
      id: cursorSocket
      path: Hyprland.requestSocketPath
      parser: SplitParser {
        splitMarker: ""
        onRead: data => {
          // Hang up ourselves: if Hyprland closes first, Quickshell logs a warning per poll.
          cursorSocket.connected = false
          var m = /(-?\d+),\s*(-?\d+)/.exec(data)
          var mon = Hyprland.monitorFor(win.screen)
          if (!m || !mon) return
          var x = Number(m[1]) - mon.x, y = Number(m[2]) - mon.y
          win.cursor = x >= 0 && y >= 0 && x < win.fullWidth && y < win.fullHeight ? { x: x, y: y } : null
        }
      }
      onConnectedChanged: if (connected) { write("cursorpos"); flush() }
    }
    Timer {
      interval: 100
      repeat: true
      // Only while one of them could react to it.
      running: store.shown && store.chaseMouse && (catView.watching || dogView.watching)
      onRunningChanged: if (!running) win.cursor = null
      onTriggered: if (!cursorSocket.connected) cursorSocket.connected = true
    }

    // Top edges of the windows visible on this monitor, in this window's coordinates.
    property var ledges: []
    // Every window on this workspace, whole, by address: where one opens or closes.
    property var rects: ({})
    function refreshLedges() {
      var out = [], all = {}
      var mon = Hyprland.monitorFor(win.screen)
      var ws = mon ? mon.activeWorkspace : null
      if (ws && !ws.hasFullscreen) {
        var tops = Hyprland.toplevels.values
        for (var i = 0; i < tops.length; i++) {
          var o = tops[i].lastIpcObject
          if (!o || !o.at || !o.size || o.hidden || !o.workspace || o.workspace.id !== ws.id) continue
          all[o.address] = { x: o.at[0] - mon.x, y: o.at[1] - mon.y, w: o.size[0], h: o.size[1] }
          if (o.size[1] < catView.size * 1.5) continue
          // Only the part of the top edge that is on this screen counts: she can't walk past the
          // screen edge to reach the rest. Only the cat climbs, so it has to be wide enough for her.
          var left = Math.max(0, o.at[0] - mon.x), right = Math.min(win.fullWidth, o.at[0] - mon.x + o.size[0])
          if (right - left < catView.size) continue
          out.push({ id: o.address, x: left, y: o.at[1] - mon.y, w: right - left })
        }
      }
      ledges = out
      rects = all
    }

    // Hyprland sends no event when a tile is resized, so poll as well as listen.
    Connections {
      target: Hyprland
      function onRawEvent(event) {
        // Events come in bursts (a title changes on every keystroke in some apps); one fresh
        // window list after the burst is enough, and none is needed while nobody is on screen.
        if (store.shown && win.present) toplevelsSoon.restart()
        var data = String(event.data || "")
        var name = String(event.name)
        if (name === "workspace" || name === "workspacev2" || name === "focusedmon" || name === "focusedmonv2"
            || name === "activespecial" || name === "activespecialv2" || name === "moveworkspace" || name === "moveworkspacev2") {
          // Switching workspaces swaps every window under them at once, and a workspace switcher
          // may grab thumbnails while it does. Neither is a window popping up or a screen being
          // shared: whatever is reported in the two seconds after a switch is ignored.
          win.switchedAt = Date.now()
          openedCheck.stop()
          // The window she scratched is not on this workspace: the marks go with it, at once.
          for (var v = 0; v < win.views.length; v++) {
            win.views[v].markGone = true
            if (win.views[v].brain) win.views[v].brain.mark = null
          }
        } else if (name === "screencast") {
          // "state,owner": a monitor or a single window is being captured (1) or no longer is (0).
          var on = data.split(",")[0] === "1"
          if (!on || !win.justSwitched()) root.captureSeen(on)
        } else if (win.justSwitched()) {
          return
        } else if (name === "openwindow") {
          win.opened = data.split(",")[0]
          openedCheck.restart()
        } else if (name === "closewindow") {
          var gone = win.rects["0x" + data]
          if (gone) win.startleIn(gone)
        }
      }
    }
    Timer {
      id: toplevelsSoon
      interval: 150
      onTriggered: Hyprland.refreshToplevels()
    }
    Timer {
      interval: 1000
      running: store.shown && win.present
      repeat: true
      triggeredOnStart: true
      onTriggered: { Hyprland.refreshToplevels(); win.refreshLedges() }
    }

    // Down while every pet is off screen: an empty full-screen layer is still a surface to keep.
    visible: store.shown && present
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    exclusionMode: ExclusionMode.Ignore
    WlrLayershell.namespace: "pixel-pets"
    WlrLayershell.layer: WlrLayer.Top
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
    // Only the pets and their toys take input; everything else clicks through to the apps below.
    // Only a pet's visible part takes clicks. Explicit geometry rather than `item:` a child of the pet:
    // a Region only follows its own item's x/y, so a nested item leaves the region behind when she walks.
    mask: Region {
      x: catView.body.x
      y: catView.body.y + catView.body.shownTop
      width: catView.active && catView.body.shownHeight > 0 ? catView.body.width : 0
      height: catView.body.shownHeight
      Region { item: catView.toy }
      Region {
        x: dogView.body.x
        y: dogView.body.y + dogView.body.shownTop
        width: dogView.active && dogView.body.shownHeight > 0 ? dogView.body.width : 0
        height: dogView.body.shownHeight
      }
      Region { item: dogView.toy }
    }

    // Ticked as fast as the pet that needs it most; sprites animate on their own clock.
    property real tickedAt: 0
    property real ledgesAt: 0
    Timer {
      interval: win.pace
      running: store.shown && win.fullWidth > 0 && win.fullHeight > 0
      repeat: true
      onTriggered: {
        var now = Date.now()
        // The real time since the last tick, so the pace is the same at every rate; capped so a
        // stalled shell doesn't make them jump.
        var dt = win.tickedAt > 0 ? Math.min(1.5, (now - win.tickedAt) / 1000) : interval / 1000
        win.tickedAt = now
        var views = win.views, out = 0, onWindow = false
        for (var i = 0; i < views.length; i++) {
          if (!views[i].active) continue
          out++
          var brain = views[i].brain
          if (brain && (brain.goal !== null || brain.perch !== null)) onWindow = true
        }
        // A window can vanish under a climber at any moment, so look again several times a second
        // while one is on its way up or sitting on top.
        if (onWindow && now - win.ledgesAt >= 250) {
          win.ledgesAt = now
          win.refreshLedges()
        }
        var pace = 1000, present = false, nth = 0
        for (var j = 0; j < views.length; j++) {
          var view = views[j]
          if (!view.active) continue
          var b = win.boundsFor(view)
          // Two pets start apart, either side of the middle.
          if (!view.brain) view.brain = Brain.create(b.w * (out > 1 ? 0.35 + 0.3 * nth : 0.5), b.floor)
          nth++
          Brain.tick(view.brain, dt, b, Math.random)
          view.sync()
          pace = Math.min(pace, Brain.tickInterval(view.brain.mode, Brain.toyInPlay(view.brain)))
          if (!Brain.gone(view.brain)) present = true
        }
        win.pace = pace
        win.present = present
      }
    }

    PetView { id: catView; species: "cat" }
    PetView { id: dogView; species: "dog" }
  }

  // One pet with its name tag and toy, in the window's coordinates.
  component PetView: Item {
    id: view

    required property string species
    readonly property int px: root.scaleOf(species)
    readonly property int size: 32 * px
    readonly property int ballSize: 12 * px
    readonly property bool active: root.active(species)
    // Brain state; created by the tick once the window has a size, dropped when the pet is switched off.
    property var brain: null
    readonly property bool watching: brain !== null && Brain.watchesCursor(pet.mode)
    readonly property string spriteUrl: root.spriteUrlOf(species)
    readonly property string name: root.nameOf(species)
    // What she is dreaming of right now: "toy", "friend" or nothing.
    property string dream: ""
    // The last dream, kept so the bubble still shows it while it fades out.
    property string dreamShown: ""
    onDreamChanged: if (dream !== "") dreamShown = dream
    // What the tour is showing on her right now.
    property string caption: ""
    // Scratch marks she left sliding down a window.
    property bool marked: false
    property bool markGone: false   // wiped without the fade (a workspace switch)
    property int markX: 0
    property int markTop: 0
    property int markBottom: 0
    property var markPts: []   // the line her paws took: [sideways from markX, y]
    readonly property alias body: pet
    readonly property alias toy: ball

    anchors.fill: parent
    visible: active
    onActiveChanged: if (!active) { brain = null; ball.shown = false }

    function sync() {
      pet.x = Math.round(brain.x)
      pet.y = Math.round(brain.y)
      pet.dir = brain.dir
      pet.mode = brain.mode
      z = brain.arrived   // the one who came last is in front
      pet.want = brain.want || ""
      pet.nag = brain.nag
      // On a window, the top edge hides whatever part of her is on the far side of it.
      var top = Math.max(0, Math.min(view.size, Math.round(brain.clipTop - brain.y)))
      var bottom = Math.max(top, Math.min(view.size, Math.round(brain.clipBottom - brain.y)))
      pet.shownTop = top
      pet.shownHeight = bottom - top
      if (brain.ball) {
        ball.x = Math.round(brain.ball.x)
        ball.y = Math.round(brain.ball.y)
        ball.frame = Brain.yarnFrame(brain.ball, view.ballSize)
      }
      ball.shown = brain.ball !== null
      dream = brain.dream ? brain.dream.what : ""
      // Scratches only show while their window is still there; the place is kept so they can fade.
      var mark = brain.mark
      if (mark && !marked) markGone = false   // fresh scratches
      marked = !!mark && win.rects[mark.id] !== undefined
      if (mark) {
        markX = Math.round(mark.x)
        markTop = Math.round(mark.top)
        markBottom = Math.round(mark.bottom)
        if (mark.pts.length !== markPts.length) markPts = mark.pts.slice()   // a copy: the change has to be noticed
      }
    }

    // Claw marks down the front of a window: three lines under each paw following the way she
    // slid, a light scratch with a dark edge so they show on any window. Drawn under her; not in
    // the input mask.
    Canvas {
      id: scratches
      readonly property int margin: Math.round(view.size * 0.3)   // room for her drift either way
      x: view.markX - margin
      y: view.markTop
      width: view.size + 2 * margin
      height: Math.max(1, view.markBottom - view.markTop)
      opacity: view.marked ? 0.45 : 0
      visible: opacity > 0 && !view.markGone

      Behavior on opacity {
        NumberAnimation { duration: 900 }
      }

      Connections {
        target: view
        function onMarkPtsChanged() { scratches.requestPaint() }
      }
      onHeightChanged: requestPaint()

      onPaint: {
        var g = getContext("2d"), pts = view.markPts
        g.clearRect(0, 0, width, height)
        if (pts.length < 2) return
        var claws = [6, 8, 10, 21, 23, 25]   // sprite columns of her claws in the climb frame
        g.lineWidth = Math.max(1, view.px / 2)
        for (var pass = 0; pass < 2; pass++) {
          g.strokeStyle = pass ? "#f5efe2" : "#90000000"
          for (var c = 0; c < claws.length; c++) {
            g.beginPath()
            for (var i = 0; i < pts.length; i++) {
              var x = margin + pts[i][0] + claws[c] * view.px + (pass ? 0 : 1) + 0.5, y = pts[i][1] - view.markTop
              if (i) g.lineTo(x, y)
              else g.moveTo(x, y)
            }
            g.stroke()
          }
        }
      }
    }

    Item {
      id: pet

      property string mode: "idle"
      property string want: ""
      property bool nag: false
      property int dir: 1
      property int shownTop: 0
      property int shownHeight: view.size
      readonly property var anim: Brain.ANIMS[mode]

      width: view.size
      height: view.size

      // The visible part of her, which is also all that takes clicks.
      Item {
        y: pet.shownTop
        width: view.size
        height: pet.shownHeight
        clip: true
        // See-through while climbing over a window, so she doesn't distract from what's on it.
        opacity: pet.mode === "climb" || pet.mode === "descend" ? 0.4 : 1

        Behavior on opacity {
          NumberAnimation { duration: 600; easing.type: Easing.InOutQuad }
        }

        // The whole sheet, slid behind a one-frame window. Not AnimatedSprite: that one makes
        // Qt redraw this full-screen layer every vsync; this only repaints when the frame changes.
        Item {
          y: -pet.shownTop
          width: view.size
          height: view.size
          clip: true
          transform: Scale { origin.x: view.size / 2; xScale: pet.dir }

          // Drawn in two bands so the upper one can fade on its own: asleep it holds only the
          // Zs, which make way for the dream bubble and come back after it.
          Item {
            width: view.size
            height: Brain.Z_ROWS * view.px
            clip: true
            opacity: pet.mode === "sleep" && view.dream !== "" ? 0 : 1

            Behavior on opacity {
              enabled: pet.mode === "sleep"   // any other pose has part of her up there: no fading her in
              NumberAnimation { duration: 500 }
            }

            Image {
              x: -pet.frame * view.size
              y: -pet.anim.row * view.size
              width: implicitWidth * view.px
              height: implicitHeight * view.px
              source: view.spriteUrl
              smooth: false
            }
          }
          Item {
            y: Brain.Z_ROWS * view.px
            width: view.size
            height: view.size - y
            clip: true

            Image {
              x: -pet.frame * view.size
              y: -pet.anim.row * view.size - parent.y
              width: implicitWidth * view.px
              height: implicitHeight * view.px
              source: view.spriteUrl
              smooth: false
            }
          }
        }
      }

      property int frame: 0
      onModeChanged: frame = 0
      Timer {
        // With music on, a sitting pet's tail keeps a quicker beat.
        interval: 1000 / (pet.anim.fps * (pet.mode === "sit" && root.music ? 2.5 : 1))
        running: store.shown && view.active && pet.mode !== "away"   // nobody sees her off screen
        repeat: true
        onTriggered: pet.frame = (pet.frame + 1) % pet.anim.frames
      }

      MouseArea {
        property real grabX: 0
        property real grabY: 0

        anchors.fill: parent
        cursorShape: Qt.PointingHandCursor
        onPressed: mouse => { grabX = mouse.x; grabY = mouse.y }
        onPositionChanged: mouse => {
          if (!view.brain) return
          root.hurry()
          if (view.brain.mode !== "held") {
            if (Math.abs(mouse.x - grabX) + Math.abs(mouse.y - grabY) < 6) return
            Brain.grab(view.brain)
          }
          view.brain.x = pet.x + mouse.x - grabX
          view.brain.y = pet.y + mouse.y - grabY
          view.sync()
        }
        onReleased: {
          if (!view.brain) return
          root.hurry()
          var w = view.brain.want
          if (view.brain.mode === "held") Brain.drop(view.brain)
          else Brain.pet(view.brain, win.boundsFor(view))
          if (w && !view.brain.want) root.lastServed[w] = Date.now()
          view.sync()
        }
        onDoubleClicked: root.giveBall(view.species)
      }
    }

    // Name tag, shown while she is being petted; during a tour it names what she is doing.
    // Not in the input mask, so it never blocks clicks. Kept on screen when she is up near its top.
    Rectangle {
      visible: view.caption !== "" || (pet.mode === "petted" && view.name !== "")
      x: Math.round(Math.max(4, Math.min(win.fullWidth - width - 4, pet.x + (view.size - width) / 2)))
      y: Math.max(4, pet.y - height - 4)
      width: nameText.implicitWidth + 14
      height: nameText.implicitHeight + 6
      radius: 4
      color: "#e61e1e2e"
      border.color: "#966a3a"
      border.width: 1

      Text {
        id: nameText
        anchors.centerIn: parent
        text: view.caption !== "" ? view.caption : view.name
        color: "#fff6e8"
        font.pixelSize: 13
        font.bold: true
      }
    }

    // Thought bubble over a dreaming pet's head. Not in the input mask either.
    Rectangle {
      id: dreamBubble
      readonly property bool ofFriend: view.dreamShown === "friend"
      opacity: view.dream !== "" ? 1 : 0
      visible: opacity > 0

      Behavior on opacity {
        NumberAnimation { duration: 500 }
      }
      // Rising from her head: asleep it rests at the front of the frame (column 22 of 32, its top
      // around row 13), so the bubble sits up and a little forward of it, two small puffs between.
      readonly property real headX: pet.x + (pet.dir > 0 ? 22 : 10) / 32 * view.size
      readonly property real headTop: pet.y + 13 / 32 * view.size
      x: Math.round(Math.max(2, Math.min(win.fullWidth - width - 2, headX + pet.dir * view.size * 0.16 - width / 2)))
      y: Math.round(headTop - 16 - height)
      width: 12 * view.px + 10
      height: width
      radius: width / 2
      color: "#f2fff6e8"
      border.color: "#966a3a"
      border.width: 1

      Image {
        anchors.centerIn: parent
        width: 12 * view.px
        height: width
        // The other pet, sitting, or her own toy.
        source: dreamBubble.ofFriend ? root.spriteUrlOf(view.species === "dog" ? "cat" : "dog") : view.spriteUrl
        sourceClipRect: dreamBubble.ofFriend ? Qt.rect(0, Brain.ANIMS.sit.row * 32, 32, 32) : Qt.rect(0, Brain.YARN_ROW * 32, 12, 12)
        smooth: false
      }
      // The puffs: a small one just over her head, a bigger one halfway up to the bubble.
      Repeater {
        model: [{ d: 4, up: 4, along: 0.08 }, { d: 7, up: 11, along: 0.5 }]

        Rectangle {
          required property var modelData
          x: Math.round(dreamBubble.headX - dreamBubble.x + pet.dir * view.size * 0.16 * modelData.along - width / 2)
          y: Math.round(dreamBubble.headTop - dreamBubble.y - modelData.up - height / 2)
          width: modelData.d
          height: width
          radius: width / 2
          color: dreamBubble.color
          border.color: dreamBubble.border.color
          border.width: 1
        }
      }
    }

    // Speech bubble by her head while she asks for something; bounces once she has been ignored.
    // Not in the input mask: clicking her is how you serve it.
    Item {
      id: bubble
      property int bob: 0
      visible: pet.want !== "" && (pet.mode === "ask" || pet.mode === "walk")
      width: 16 * view.px
      height: 14 * view.px
      x: pet.dir > 0 ? pet.x + 21 * view.px : pet.x + view.size - 37 * view.px
      y: pet.y - (9 + bob) * view.px
      transform: Scale { origin.x: bubble.width / 2; xScale: pet.dir }

      Image {
        anchors.fill: parent
        source: view.spriteUrl
        sourceClipRect: Qt.rect((Brain.BUBBLES[pet.want] || 0) * 32, Brain.BUBBLE_ROW * 32, 16, 14)
        smooth: false
      }

      Timer {
        interval: 333
        running: bubble.visible && pet.nag
        repeat: true
        onTriggered: bubble.bob = 1 - bubble.bob
        onRunningChanged: if (!running) bubble.bob = 0
      }
    }

    Item {
      id: ball

      property bool shown: false
      property int frame: 0

      visible: shown
      // Zero size when hidden so it drops out of the input mask.
      width: shown ? view.ballSize : 0
      height: width

      Image {
        anchors.fill: parent
        source: view.spriteUrl
        sourceClipRect: Qt.rect(ball.frame * 32, Brain.YARN_ROW * 32, 12, 12)
        smooth: false
      }

      // Pick the ball up and throw it.
      MouseArea {
        property real grabX: 0
        property real grabY: 0
        property real vx: 0
        property real vy: 0
        property real lastT: 0

        anchors.fill: parent
        cursorShape: Qt.OpenHandCursor
        onPressed: mouse => {
          if (!view.brain || !view.brain.ball) return
          grabX = mouse.x; grabY = mouse.y
          vx = vy = 0
          lastT = Date.now()
          root.hurry()
          view.brain.ball.held = true
        }
        onPositionChanged: mouse => {
          var o = view.brain ? view.brain.ball : null
          if (!o || !o.held) return
          var now = Date.now(), dt = Math.max(1, now - lastT) / 1000
          var nx = ball.x + mouse.x - grabX, ny = ball.y + mouse.y - grabY
          vx = (nx - o.x) / dt; vy = (ny - o.y) / dt
          lastT = now
          o.x = nx; o.y = ny
          view.sync()
        }
        onReleased: {
          var o = view.brain ? view.brain.ball : null
          if (!o) return
          var fresh = Date.now() - lastT < 100   // a throw, not a let-go after holding still
          o.vx = fresh ? Math.max(-1500, Math.min(1500, vx)) : 0
          o.vy = fresh ? Math.max(-1500, Math.min(1500, vy)) : 0
          o.life = Brain.BALL_LIFE
          o.held = false
        }
      }
    }
  }
}
