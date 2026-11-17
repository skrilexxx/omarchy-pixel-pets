.pragma library

// Pet behaviour. Pure logic, no QML: Service.qml calls tick() ~30x a second.
// Positions are the sprite's top-left in logical px.
// bounds = { w: max x, floor: resting y, size: sprite size,
//            ground: y the ball rests on (its bottom edge); floor + size when not given,
//            friend: the other pet's state when two are out, else null; friendSize: its sprite size,
//            peek: how far above a window edge the sprite top sits when peeking over it,
//            ledges: [{ id, x, y, w }] window top edges she may peek over or sit on,
//            ballSize: yarn ball size,
//            cursor: { x, y } mouse position, or null when it is not on this screen,
//            species: "cat" | "dog",
//            wander: false keeps them from leaving the screen on their own (default: they do);
//            music: something is playing; hide: the screen is being shared, stay out of sight;
//            exhausted: the battery is nearly empty, sleep;
//            day: a number that changes at midnight, hour: local time 0..24 (both optional:
//            without them no toy is ever brought unasked) }

// What a species does differently; everything else is shared.
// A cat climbs windows and bats her yarn about. A dog stays on the ground, fetches his ball back
// to where it was thrown from, sniffs along the floor, barks and chases his tail.
var TRAITS = {
  // away: the share of the time spent off screen. The cat roams far more than the dog.
  // offers: times a day it brings its toy unasked.
  cat: { climbs: true, fetches: false, away: 0.5, offers: 1 },
  dog: { climbs: false, fetches: true, away: 0.2, offers: 4 }
}
function traits(b) {
  return TRAITS[b.species] || TRAITS.cat
}

// Must match the row order / frame counts in tools/make_sprites.py
var ANIMS = {
  idle:    { row: 0, frames: 4, fps: 3 },
  walk:    { row: 1, frames: 6, fps: 10 },
  run:     { row: 1, frames: 6, fps: 16 },
  sit:     { row: 2, frames: 2, fps: 2 },
  sleep:   { row: 3, frames: 4, fps: 2 },
  petted:  { row: 4, frames: 4, fps: 6 },
  held:    { row: 5, frames: 2, fps: 6 },
  fall:    { row: 6, frames: 2, fps: 8 },
  climb:   { row: 7, frames: 4, fps: 4 },
  descend: { row: 7, frames: 4, fps: 4 },
  claw:    { row: 7, frames: 1, fps: 1 },    // sliding down a window, claws in: she holds still
  peekup:  { row: 8, frames: 5, fps: 1.5 },
  peek:    { row: 8, frames: 5, fps: 1.5 },
  peekdown: { row: 8, frames: 5, fps: 1.5 },
  crouch:  { row: 9, frames: 2, fps: 6 },
  pounce:  { row: 10, frames: 2, fps: 8 },
  bat:     { row: 11, frames: 2, fps: 6 },
  groom:   { row: 12, frames: 4, fps: 4 },
  stretch: { row: 13, frames: 3, fps: 2 },
  yawn:    { row: 14, frames: 3, fps: 2 },
  // Care reminders: asking for something, and having it.
  ask:     { row: 16, frames: 2, fps: 2 },
  drink:   { row: 17, frames: 4, fps: 4 },
  eat:     { row: 18, frames: 4, fps: 4 },
  // On a window with little room above it: moving and waiting in a crouch.
  prowl:   { row: 9, frames: 2, fps: 5 },
  lurk:    { row: 9, frames: 2, fps: 1.5 },
  // Wandering off the edge of the screen and coming back.
  leave:   { row: 1, frames: 6, fps: 10 },
  away:    { row: 0, frames: 4, fps: 3 },
  enter:   { row: 1, frames: 6, fps: 10 },
  // Short bursts: a startled hop, running off, racing about, running to greet.
  hop:     { row: 6, frames: 2, fps: 8 },
  scurry:  { row: 1, frames: 6, fps: 16 },
  flee:    { row: 1, frames: 6, fps: 18 },
  zoom:    { row: 1, frames: 6, fps: 20 },
  greet:   { row: 1, frames: 6, fps: 16 },
  chase:   { row: 1, frames: 6, fps: 16 },
  // Dog only from here. Rows 20 and up exist only on the dog sheets.
  invite:  { row: 9, frames: 2, fps: 6 },   // play bow: at the cat, or after bringing the ball
  belly:   { row: 22, frames: 2, fps: 6 },  // on his back for a belly rub
  carry:   { row: 1, frames: 6, fps: 14 },
  spin:    { row: 1, frames: 6, fps: 16 },
  sniff:   { row: 20, frames: 4, fps: 6 },
  bark:    { row: 21, frames: 2, fps: 5 }
}
// Rows at the top of a sleep frame that hold nothing but the floating Zs: the body starts below
// them on every sheet. Service.qml fades just those rows out while a dream bubble is up.
var Z_ROWS = 11
var YARN_ROW = 15
var YARN_FRAMES = 4
var BUBBLE_ROW = 19   // speech bubble frames: water, food, break
var BUBBLES = { water: 0, food: 1, break: 2 }

var SPEED = 60          // px/s walking
var RUN_SPEED = 150     // px/s chasing the ball
// Modes that move along the floor towards targetX, and how fast.
var PACE = {
  walk: SPEED, sniff: 35, prowl: 30, run: RUN_SPEED, carry: 120, leave: SPEED, enter: SPEED,
  chase: RUN_SPEED, flee: 190, scurry: RUN_SPEED, greet: RUN_SPEED, zoom: 320
}
// Of those, the ones that end on arrival and then decide what comes next.
var ARRIVES = { walk: true, sniff: true, prowl: true, leave: true, enter: true, flee: true, scurry: true, greet: true, zoom: true }
var HOP_HEIGHT = 30     // px
var SPIN_FLIP = 0.16    // s between turns while chasing his tail
// Where the ball cell sits in the 32px frame while carried in the mouth, facing right.
var MOUTH = { x: 17, y: 11 }
var GRAVITY = 1800      // px/s^2
var HANG_CHANCE = 0.15  // share of idle decisions that go for a window
// A window with room above its top edge is somewhere to be: she climbs onto it and walks, sits
// and naps up there as she does on the floor, until she has had enough or the window goes.
var PERCH_SHARE = 0.7   // of the trips up such a window end on top of it; the rest peek over it
var PERCH_MIN = 40      // s up there, at least
var PERCH_SPAN = 140    // s more, at random
// A window right under the bar leaves no room to stand on it, but a small cat fits lying down or
// crouched, her back in front of the bar. Up there she keeps low: prowls, lurks, naps.
var LOW_ROWS = 17       // sprite rows of room above the edge that a crouching cat needs, bar her ear tips
var LOW = { prowl: true, lurk: true, sleep: true, stretch: true }   // what she does under a low ceiling
var CLIMB_SPEED = 90    // px/s climbing up / down the front of a window
// Now and then she doesn't climb down but lets herself slide, claws in the window, and leaves
// scratch marks down its front that fade after a few seconds.
var CLAW_SHARE = 0.1    // of the ways down
// She starts slowly, claws holding, then loses grip: faster and faster, drifting to one side
// with a small wobble, so the marks lean and waver instead of running ruler-straight.
var CLAW_START = 50     // px/s at the top
var CLAW_PULL = 95      // px/s more per second, twice over (distance = START*t + PULL*t^2)
var CLAW_DRIFT = 0.23   // of her size, sideways by the time she lands
var CLAW_WOBBLE = 0.026 // of her size, to and fro on the way
var MARK_TIME = 5       // s the scratches stay after she has landed
var PEEK_SPEED = 25     // px/s rising over / sinking below the window edge

// Each pet wanders off the screen now and then; for what share of the time is in TRAITS.
var STAY_MIN = 240      // s on screen before wandering off again, at least
var STAY_SPAN = 480     // s more, at random
// Modes in which she is, or may be, past the screen edge.
var OFFSCREEN = { leave: true, away: true, enter: true, flee: true }

var CHASE_SHARE = 0.3   // of the dog's visits, when he is lively enough, turn into a chase
var CHASE_ENERGY = 0.35 // below this he can't be bothered
var OFFER_HOURS = [9, 21] // the toy is brought unasked between these hours
var OFFER_OPEN = 0.75     // hours such a moment stays open if she can't right then
var ZOOM_ENERGY = 0.7   // zoomies only above this
// Holding a pet's toy up high winds it up: after a few seconds it can't hold still any longer.
var TEASE_ABOVE = 1 / 3 // of the screen height, from the top
var TEASE_TIME = 5      // s the toy has to stay up there
var PET_WINDOW = 4      // s within which pets count as "again"
var PET_GAP = 0.35      // s: a click sooner than this after the last one is not another pet
var CAT_PATIENCE = 3    // pets in a row a cat enjoys, at least (up to two more, and two more when sleepy)
var DOG_BELLY = 5       // pets in a row, give or take one, and he rolls over
var STARTLE_REST = 240  // s at least between two startles

// Two pets out together: share of idle decisions, at full energy, that go and see the other one.
var MEET_CHANCE = 0.1
// What the other pet may be doing when it gets a visit.
var APPROACHABLE = { idle: true, sit: true, sleep: true, groom: true, yawn: true }

var CURSOR_RANGE = 500  // px: how far away she notices the mouse
var NOTICE_RATE = 0.8   // chance per second of noticing a moving mouse nearby
var POUNCE_TIME = 0.5   // s in the air
var POUNCE_HEIGHT = 50  // px
var POUNCE_REACH = 300  // px: longest single pounce
var MAX_POUNCES = 3     // in a row, then she gets bored for a while

var BALL_LIFE = 40      // s before the yarn ball goes away
var BALL_BOUNCE = 0.45
var BALL_FRICTION = 1.5 // rolling slowdown per second on the floor

var NAG_AFTER = 300     // s of asking before she comes over to the mouse

// Modes in which something interesting (ball, mouse) can catch her attention.
var REACTIVE = { idle: true, sit: true, walk: true, run: true, groom: true, yawn: true, sniff: true }
// The trip up a window and back: climb the front (back to the viewer), go over the top edge,
// peek over it from behind, come back over and climb down. Only the part of her between
// clipTop and clipBottom is drawn: the edge hides whatever is on the far side of it.
var ON_LEDGE = { climb: true, peekup: true, peek: true, peekdown: true, descend: true, claw: true }
var PEEKING = { peekup: true, peek: true, peekdown: true }

function create(x, y) {
  return {
    mode: "idle", x: x, y: y, dir: 1, t: 0, until: 2, vy: 0, targetX: x, goal: null,
    ball: null, lastCursor: null, cursorStill: Infinity, pounces: 0, bored: 0, from: x, to: x,
    visiting: false, then: null,
    stay: null, onFor: 0,   // s left before wandering off; s on screen since she came back
    perch: null, perchY: 0, perchFor: 0, onTop: false, low: false,
    mark: null,   // scratches she left on a window: { id, x, top, bottom, pts, left, ... }
    arrived: 0,   // when she last came over or came back, for who stands in front
    staged: null, // set by the tour: which way the choices that are usually left to chance go   // the window she is on, by id; onTop: this climb goes over the top, in full view
    pending: false, laps: 0, offerDay: null, offerAt: [], offerDone: [],
    pets: 0, petT: Infinity, patience: null, grumpy: 0, calm: 0,
    dream: null, dreamAt: null, settled: false,
    // What the last tick knew, for the calls that come without bounds (pet).
    species: "cat", energy: 0.5, w: 0,
    clipTop: -Infinity, clipBottom: Infinity,
    want: null, nag: false   // care reminder: "water" | "food" | "break"
  }
}

// How often Service.qml should tick her, in ms. Full rate only while something moves;
// the sprite animates on its own, so a still pet only needs to notice things.
var STILL = { idle: true, sit: true, groom: true, yawn: true, stretch: true, petted: true, peek: true, held: true,
              ask: true, drink: true, eat: true, bark: true, invite: true, belly: true, lurk: true }
// Walking paces: 3px a step is one sprite pixel at medium size.
var STROLL = { walk: true, sniff: true, prowl: true, leave: true, enter: true }
function tickInterval(mode, hasBall) {
  if (hasBall) return 33
  if (mode === "sleep" || mode === "away") return 1000
  if (STROLL[mode]) return 50
  return STILL[mode] ? 250 : 33
}

// A toy only counts as "in play" for the tick rate while it is in a hand, in a mouth or moving;
// one lying still needs no more attention than its pet does.
function toyInPlay(s) {
  var o = s.ball
  return !!o && (o.held || o.carried || o.vx * o.vx + o.vy * o.vy > 1)
}

// Off screen with nothing of hers left in sight: the window isn't needed on her account.
function gone(s) {
  return s.mode === "away" && !s.ball
}

// Whether Service.qml needs to keep the mouse position fresh.
function watchesCursor(mode) {
  return !!REACTIVE[mode] || mode === "crouch" || mode === "pounce" || mode === "ask"
}

// Roughly x: 70% to 130% of it, so nothing takes the same time twice.
function about(x, rand) {
  return x * (0.7 + 0.6 * rand())
}

function setMode(s, mode, duration) {
  // Whatever interrupts a visit or a queued reaction cancels it.
  s.visiting = false
  s.then = null
  s.dream = null
  s.dreamAt = null
  s.mode = mode
  s.t = 0
  s.until = duration
  if (!ON_LEDGE[mode]) s.goal = null
  if (!ON_LEDGE[mode]) {
    s.clipTop = -Infinity
    s.clipBottom = Infinity
  }
}

function walkTo(s, x, mode) {
  s.targetX = x
  s.dir = x < s.x ? -1 : 1
  setMode(s, mode || "walk", Infinity)
}

// The ledge she is heading for / hanging from, if it still exists and still spans her.
function ledge(s, b) {
  var ls = b.ledges || []
  for (var i = 0; i < ls.length; i++)
    if (ls[i].id === s.goal && ls[i].x <= s.x && s.x + b.size <= ls[i].x + ls[i].w) return ls[i]
  return null
}

// Where her frame's top sits when her feet are on a window's top edge: as far above the edge
// as her resting place is above the ground line.
function perchTop(l, b) {
  return l.y - (ground(b) - b.floor)
}

// The window she is on top of, if it is still there, still under her and has not moved.
function perched(s, b) {
  var ls = b.ledges || []
  for (var i = 0; i < ls.length; i++)
    if (ls[i].id === s.perch && ls[i].y === s.perchY && ls[i].x <= s.x && s.x + b.size <= ls[i].x + ls[i].w) return ls[i]
  return null
}

// Back down the front of the window, in full view.
// Sets off down the front of a window: mostly climbing, now and then sliding with her claws
// out, which scratches it from its top edge down.
function startDown(s, l, b, rand) {
  if (s.staged ? !s.staged.claw : rand() >= CLAW_SHARE) return setMode(s, "descend", Infinity)
  slideDown(s, l, b)
}

function slideDown(s, l, b) {
  setMode(s, "claw", Infinity)
  // Drifting towards the side of the window with more room. pts is the line her paws take:
  // [sideways from where she started, y], one point every couple of pixels.
  var room = l.x + l.w - b.size - s.x
  s.mark = { id: l.id, x: s.x, y0: s.y, t: 0, dir: s.x - l.x > room ? -1 : 1,
             top: l.y, bottom: l.y, pts: [], left: MARK_TIME }
}

function climbDown(s, l, b, rand) {
  startDown(s, l, b, rand)
  s.goal = l.id
  s.onTop = true
  s.perch = null
}

// What she does next up there: the quiet half of what she does on the floor, within the
// window's width. When her time is up, or she is due off screen, she climbs back down.
function perchNext(s, b, l, rand) {
  if (s.perchFor <= 0 || s.stay <= 0) return climbDown(s, l, b, rand)
  var e = b.energy === undefined ? 0.5 : b.energy
  var tired = (1 - e) * (1 - e)
  var r = rand()
  if (s.low) {
    if (r < 0.35) walkTo(s, l.x + rand() * (l.w - b.size), "prowl")
    else if ((r -= 0.35) < 0.1 + 0.35 * tired) setMode(s, "sleep", (25 + rand() * 50) * (0.5 + 2 * tired))
    else setMode(s, "lurk", 2 + rand() * 4)
    return
  }
  if (r < 0.3) walkTo(s, l.x + rand() * (l.w - b.size))
  else if ((r -= 0.3) < 0.25) setMode(s, "sit", 3 + rand() * 5)
  else if ((r -= 0.25) < 0.12) setMode(s, "groom", 3 + rand() * 3)
  else if ((r -= 0.12) < 0.05) setMode(s, "yawn", 1.5)
  else if ((r -= 0.05) < 0.03 + 0.35 * tired) setMode(s, "sleep", (25 + rand() * 50) * (0.5 + 2 * tired))
  else setMode(s, "idle", 1 + rand() * 3)
}

function ground(b) {
  return b.ground === undefined ? b.floor + b.size : b.ground
}

// The other pet, if it is somewhere a visit makes sense.
function friend(b) {
  var f = b.friend
  return f && APPROACHABLE[f.mode] && f.goal === null && f.perch === null ? f : null
}

// Whoever came last stands in front: Service.qml stacks the pets by this. Counted up on every
// arrival: setting off to the other one, or walking back onto the screen. Both happen while the
// two are apart, so the change of order is never seen as a jump.
var arrivals = 0
function arrive(s) {
  s.arrived = ++arrivals
}

function visit(s, f, b) {
  arrive(s)
  if (f.mode === "sleep") {
    // Cuddle up: come in on the side her head is on, so the two lie face to face with the heads
    // just overlapping. In the sleep frame the head spans columns 15..29 (3..17 when flipped).
    var k = b.size / 32, kf = (b.friendSize || b.size) / 32
    var cx = f.dir > 0 ? f.x + 26 * kf - 3 * k : f.x + 6 * kf - 29 * k
    if (cx >= 0 && cx <= b.w) {
      walkTo(s, cx)
      s.visiting = true
      return
    }
  }
  // Positions are top-left corners and the two differ in size: stand beside, not on top.
  var x = s.x < f.x ? f.x - b.size * 0.75 : f.x + (b.friendSize || b.size) * 0.75
  walkTo(s, Math.max(0, Math.min(b.w, x)))
  s.visiting = true
}

// Arrived next to the other pet. The pair is always one cat and one dog, so the visitor's
// species says what both do: nap side by side, sit together, or play
// (the dog bows and gets a paw on the nose; the cat taps first and gets a bow back).
function meet(s, f, b, rand) {
  s.dir = f.x < s.x ? -1 : 1
  if (f.mode === "sleep") {
    // Joining one who naps because nobody is at the desk means napping on the same terms,
    // or nothing would ever wake the visitor.
    setMode(s, "sleep", Math.max(10, f.until - f.t))
    s.settled = f.settled
    return
  }
  f.dir = -s.dir
  if (s.staged ? !s.staged.play : rand() < 0.4) {
    setMode(s, "sit", 3 + rand() * 3)
    setMode(f, "sit", 3 + rand() * 3)
  } else if (b.species === "dog") {
    setMode(s, "invite", about(1.6, rand))
    s.then = { mode: rand() < 0.7 ? "spin" : "bark", duration: about(1.2, rand) }
    setMode(f, "sit", about(1, rand))
    f.then = { mode: "bat", duration: 0.6 }
  } else {
    setMode(s, "bat", 0.6)
    s.then = { mode: rand() < 0.7 ? "sit" : "groom", duration: about(3, rand) }
    setMode(f, "sit", about(0.6, rand))
    f.then = { mode: "invite", duration: about(1.4, rand) }
  }
}

// The dog goes for the cat. Where she runs to is hers to decide, on her next tick.
function chase(s, f) {
  setMode(f, "flee", Infinity)
  f.pending = true
  s.dir = f.x < s.x ? -1 : 1
  s.targetX = f.x
  setMode(s, "chase", 20)
}

// Up the nearest window if she may climb, else out past the screen edge away from him.
function planFlee(s, b, rand) {
  s.pending = false
  var ls = traits(b).climbs ? (b.ledges || []) : []
  if (ls.length) {
    var l = ls[Math.floor(rand() * ls.length)]
    walkTo(s, Math.max(l.x, Math.min(l.x + l.w - b.size, s.x)), "flee")
    s.goal = l.id
    return
  }
  var from = b.friend ? b.friend.x : s.x
  walkTo(s, s.x < from ? -b.size : b.w + b.size, "flee")
}

// One yawns, and about half the time the other, if awake, yawns a moment later.
// Now and then both lie down for a nap after it.
function yawnTogether(s, f, rand) {
  setMode(s, "yawn", 1.5)
  if (!f || f.mode === "sleep" || rand() >= 0.5) return
  var nap = rand() < 0.25
  if (nap) s.then = { mode: "sleep", duration: 30 + rand() * 30 }
  setMode(f, "sit", 0.6 + rand() * 0.6)
  f.then = { mode: "yawn", duration: 1.5, then: nap ? { mode: "sleep", duration: 30 + rand() * 30 } : null }
}

// When today a species brings its toy unasked: the hours are split into as many equal parts as
// there are asks, with one moment at random in each. Random per day and species but the same
// all day, so a shell restart doesn't deal new ones.
function offerTimes(day, species) {
  var n = traits({ species: species }).offers, out = []
  var x = (Math.abs(day) * 131 + (species === "dog" ? 7 : 3)) % 2147483646 + 1
  var span = (OFFER_HOURS[1] - OFFER_HOURS[0]) / n
  for (var i = 0; i < n; i++) {
    for (var k = 0; k < 3; k++) x = (x * 48271) % 2147483647
    out.push(OFFER_HOURS[0] + span * (i + x / 2147483647))
  }
  return out
}

// Which of today's moments is open right now and not yet used, or -1.
function offerDue(s, b) {
  if (b.day === undefined || b.hour === undefined) return -1
  if (s.offerDay !== b.day) {
    s.offerDay = b.day
    s.offerAt = offerTimes(b.day, b.species)
    s.offerDone = []
  }
  for (var i = 0; i < s.offerAt.length; i++)
    if (!s.offerDone[i] && b.hour >= s.offerAt[i] && b.hour < s.offerAt[i] + OFFER_OPEN) return i
  return -1
}

// Brings a toy unasked. The dog carries his ball to below the pointer (delivering it does the
// rest); the cat nudges her yarn that way with a paw.
function offer(s, b, rand) {
  var cx = b.cursor ? b.cursor.x : (b.w + b.size) * (0.3 + 0.4 * rand())
  if (traits(b).fetches) {
    s.ball = { x: s.x, y: s.y, vx: 0, vy: 0, roll: 0, life: BALL_LIFE, held: false,
               carried: true, fetched: false, home: cx, offered: true }
    walkTo(s, Math.max(0, Math.min(b.w, cx - b.size / 2)), "carry")
    return
  }
  s.dir = cx < s.x + b.size / 2 ? -1 : 1
  s.ball = {
    x: Math.max(0, Math.min(b.w + b.size - b.ballSize, s.x + b.size / 2 + s.dir * b.size * 0.5 - b.ballSize / 2)),
    y: ground(b) - b.ballSize, vx: s.dir * (200 + rand() * 200), vy: -(150 + rand() * 150),
    roll: 0, life: BALL_LIFE, held: false, carried: false, fetched: false, home: cx
  }
  setMode(s, "bat", 0.5)
}

// Two or three races from one end of the screen to the other.
function zoomies(s, b, rand) {
  s.laps = rand() < 0.5 ? 2 : 3
  walkTo(s, s.x < b.w / 2 ? b.w * 0.95 : b.w * 0.05, "zoom")
}

// The toy held up out of reach: once it has been up there long enough, and as soon as she is on
// the floor and free to, she tears off. Once per hold; letting go resets it.
function tease(s, b, dt, rand) {
  var o = s.ball
  if (!o) return
  if (!o.held) {
    o.high = 0
    o.teased = false
    return
  }
  o.high = o.y < ground(b) * TEASE_ABOVE ? (o.high || 0) + dt : 0
  if (o.teased || o.high < TEASE_TIME) return
  if (OFFSCREEN[s.mode] || ON_LEDGE[s.mode] || s.perch !== null || s.mode === "held" || s.mode === "fall"
      || s.mode === "hop" || s.mode === "pounce") return
  o.teased = true
  s.y = b.floor
  zoomies(s, b, rand)
}

// Runs a queued step: a mode for a while, or a walk to x.
function run(s, q) {
  if (q.x !== undefined) walkTo(s, q.x, q.mode)
  else setMode(s, q.mode, q.duration)
  s.then = q.then || null
}

// Walks out past the nearer screen edge. How long she stays away follows from how long she was
// here, so the share of time away holds whatever she got up to in between.
function leave(s, b, rand) {
  walkTo(s, s.x < b.w / 2 ? -b.size : b.w + b.size, "leave")
  var share = traits(b).away
  s.awayFor = s.onFor * share / (1 - share) * (0.7 + 0.6 * rand())
}

// Walks back in, usually on the side she left by, to somewhere in the nearer third of the screen.
function comeBack(s, b, r1, r2) {
  arrive(s)
  var left = (s.x < b.w / 2) === (r1 < 0.7)
  s.x = left ? -b.size : b.w + b.size
  walkTo(s, left ? b.w * (0.05 + 0.3 * r2) : b.w * (0.95 - 0.3 * r2), "enter")
  s.onFor = 0
}

// A toy given or picked up calls her back: she turns round, or comes in again on the side she left by.
function callBack(s, b, rand) {
  if (s.mode !== "leave" && s.mode !== "away") return
  if (s.mode === "leave") setMode(s, "idle", 0.5)
  else comeBack(s, b, 0, rand())
  s.stay = about(STAY_MIN, rand)   // and she stays to play
}

// A mouse that moved recently, near the floor, within range.
function cursorNear(s, b) {
  var c = b.cursor
  return !!c && s.cursorStill < 1.5 && c.y >= b.floor - b.size
    && Math.abs(c.x - (s.x + b.size / 2)) < CURSOR_RANGE
}

function pounceAt(s, b) {
  var to = Math.max(0, Math.min(b.w, b.cursor.x - b.size / 2))
  s.from = s.x
  s.to = s.x + Math.max(-POUNCE_REACH, Math.min(POUNCE_REACH, to - s.x))
  if (s.to !== s.x) s.dir = s.to < s.x ? -1 : 1
  setMode(s, "pounce", Infinity)
}

function next(s, b, rand) {
  var m = s.mode
  var queued = s.then
  if (queued) return run(s, queued)
  if (m === "walk" && s.visiting) {
    var near = friend(b)
    return near && Math.abs(near.x - s.x) < Math.max(b.size, b.friendSize || 0) * 1.5 ? meet(s, near, b, rand) : setMode(s, "idle", 1)
  }
  if (m === "drink" || m === "eat") return setMode(s, "petted", 1.5)
  if (m === "leave") return setMode(s, "away", b.hide ? 3 : s.want ? 0 : s.awayFor)
  if (m === "away") {
    if (b.hide) return setMode(s, "away", 3)   // still being shared: look again in a moment
    if (s.want) {   // something to ask for: straight back in
      s.stay = STAY_MIN + rand() * STAY_SPAN
      return comeBack(s, b, 0, rand())
    }
    // Each keeps its own hours: not back in on the other's heels.
    if (b.friend && b.friend.mode === "enter") return setMode(s, "away", 20 + rand() * 60)
    s.stay = STAY_MIN + rand() * STAY_SPAN
    return comeBack(s, b, rand(), rand())
  }
  if (s.perch !== null && s.low) {
    // Under a low ceiling there is no sitting up after a pet or standing about after a nap.
    if (m === "sleep") return setMode(s, "stretch", 1.5)
    var roof = perched(s, b)
    return roof ? perchNext(s, b, roof, rand) : drop(s)
  }
  if (m === "petted") return setMode(s, "sit", 3 + rand() * 5)
  if ((m === "walk" || m === "flee") && s.goal !== null) {
    var l = ledge(s, b)
    setMode(s, "climb", Infinity)
    // With room for her above the edge she mostly goes over the top, in full view, to stay a while;
    // otherwise up behind the window to peek over it.
    // Room to stand, or at least to crouch (the small cat under the bar).
    s.low = !!l && perchTop(l, b) < 0
    s.onTop = !!l && l.y >= (s.low ? LOW_ROWS * b.size / 32 : 0) && (s.staged ? s.staged.onTop : rand() < PERCH_SHARE)
    if (l && !s.onTop) s.clipTop = l.y
    return
  }
  if (m === "flee") return setMode(s, "away", 6 + rand() * 8)   // strolls back in as if nothing happened
  if (s.want && s.goal === null) {
    if (m !== "ask") return setMode(s, "ask", NAG_AFTER)
    s.nag = true   // ignored for a while: go over to the mouse and ask there
    return walkTo(s, b.cursor ? Math.max(0, Math.min(b.w, b.cursor.x - b.size / 2)) : rand() * b.w)
  }
  if (m === "greet") return setMode(s, "petted", about(2, rand))
  if (m === "zoom") {
    if (--s.laps > 0) return walkTo(s, s.x < b.w / 2 ? b.w * 0.95 : b.w * 0.05, "zoom")
    return setMode(s, rand() < 0.7 ? "groom" : "sit", about(3, rand))
  }
  if (m === "sleep") return setMode(s, "stretch", 1.5)
  if (m === "crouch") return cursorNear(s, b) ? pounceAt(s, b) : setMode(s, "idle", 1)
  if (m === "bat") return setMode(s, "idle", 0.3)
  if (m !== "idle" && m !== "sit") return setMode(s, "idle", 1 + rand() * 3)
  if (s.perch !== null) {
    var top = perched(s, b)
    return top ? perchNext(s, b, top, rand) : drop(s)
  }
  var due = s.ball ? -1 : offerDue(s, b)
  if (due >= 0) {
    s.offerDone[due] = true
    return offer(s, b, rand)
  }
  if (s.stay <= 0 && b.wander !== false) {
    // Nor out right behind the other: if it has just gone, hang about a little longer.
    var o = b.friend
    if (o && (o.mode === "leave" || (o.mode === "away" && o.t < 90))) s.stay = 30 + rand() * 120
    else return leave(s, b, rand)
  }
  if (b.exhausted) return setMode(s, "sleep", 60 + rand() * 60)
  var ls = b.ledges || []
  if (traits(b).climbs && ls.length && rand() < HANG_CHANCE) {
    var l = ls[Math.floor(rand() * ls.length)]
    walkTo(s, l.x + rand() * (l.w - b.size))
    s.goal = l.id
    return
  }
  // energy 0 = lazy (naps a lot), 1 = playful (walks a lot, short naps)
  var e = b.energy === undefined ? 0.5 : b.energy
  var walk = 0.25 + 0.3 * e
  var tired = (1 - e) * (1 - e)
  var sleep = 0.03 + 0.35 * tired
  var f = friend(b)
  var dog = b.species === "dog"
  if (f && rand() < MEET_CHANCE * e) {
    if (dog && e > CHASE_ENERGY && f.mode !== "sleep" && rand() < CHASE_SHARE) return chase(s, f)
    return visit(s, f, b)
  }
  if (e > ZOOM_ENERGY && rand() < 0.1 * (e - ZOOM_ENERGY) / (1 - ZOOM_ENERGY)) return zoomies(s, b, rand)
  var r = rand()
  // Sitting, grooming and yawning take 0.4 of the decisions for either species. A dog spends
  // part of that barking and chasing his tail instead, the more the livelier he is, so the
  // walk and sleep shares, and with them the energy slider and day cycle, work the same for both.
  // Music playing doubles the tail-chasing.
  var antics = dog ? 0.05 * e : 0
  var spin = antics * (b.music ? 2 : 1)
  var sit = dog ? 0.26 - antics - spin : 0.2
  var groom = dog ? 0.08 : 0.12
  var yawn = dog ? 0.06 : 0.08
  if (r < walk) walkTo(s, rand() * b.w, dog && rand() < 0.4 ? "sniff" : "walk")
  else if ((r -= walk) < sit) setMode(s, "sit", 3 + rand() * 5)
  else if ((r -= sit) < groom) setMode(s, "groom", 3 + rand() * 3)
  else if ((r -= groom) < yawn) yawnTogether(s, f, rand)
  else if ((r -= yawn) < antics) setMode(s, "bark", 0.8 + rand() * 0.8)
  else if ((r -= antics) < spin) setMode(s, "spin", 1.5 + rand() * 2)
  else if ((r -= spin) < sleep) {
    // Naps are nicer next to someone already asleep.
    if (f && f.mode === "sleep" && rand() < 0.7) visit(s, f, b)
    else setMode(s, "sleep", (25 + rand() * 50) * (0.5 + 2 * tired))
  } else setMode(s, "idle", 1 + rand() * 3)
}

// Ball first, then the mouse. May switch her into run / bat / crouch.
function distract(s, b, rand, dt) {
  if (!REACTIVE[s.mode] || s.goal !== null || s.perch !== null || s.want) return
  var o = s.ball
  // A ball he already brought back lies there until it is thrown again.
  if (o && !o.fetched) {
    var gap = o.x + b.ballSize / 2 - (s.x + b.size / 2)
    var low = o.y >= ground(b) - b.ballSize - b.size * 0.3
    if (Math.abs(gap) < b.size * 0.5 && low && !o.held && traits(b).fetches) {
      o.carried = true
      o.vx = o.vy = 0
      o.life = BALL_LIFE
      walkTo(s, Math.max(0, Math.min(b.w, o.home - b.size / 2)), "carry")
    } else if (Math.abs(gap) < b.size * 0.5 && low && !o.held) {
      s.dir = gap < 0 ? -1 : 1
      o.vx = s.dir * (250 + rand() * 300)
      o.vy = -(150 + rand() * 350)
      setMode(s, "bat", 0.4)
    } else {
      if (s.mode !== "run") setMode(s, "run", Infinity)
      s.dir = gap < 0 ? -1 : 1
      s.targetX = Math.max(0, Math.min(b.w, s.x + gap - s.dir * b.size * 0.3))
    }
    return
  }
  if (s.mode === "run") return setMode(s, "idle", 1)
  if (s.bored <= 0 && cursorNear(s, b) && rand() < NOTICE_RATE * dt) {
    s.dir = b.cursor.x < s.x + b.size / 2 ? -1 : 1
    s.pounces = 0
    setMode(s, "crouch", 0.8 + rand() * 0.8)
  }
}

function watchCursor(s, b, dt) {
  var c = b.cursor, l = s.lastCursor
  if (c && l && Math.abs(c.x - l.x) + Math.abs(c.y - l.y) > 3) s.cursorStill = 0
  else s.cursorStill += dt
  if (!c) s.lastCursor = null
  else if (l) {
    l.x = c.x
    l.y = c.y
  } else s.lastCursor = { x: c.x, y: c.y }
  if (s.bored > 0) s.bored -= dt
}

function moveBall(s, b, dt, rand) {
  var o = s.ball
  if (!o) return
  if (o.held) o.life = BALL_LIFE   // it doesn't run out in the hand
  o.life -= dt
  if (o.life <= 0) {
    s.ball = null
    return
  }
  if (o.carried && s.mode !== "carry") o.carried = false   // picked up, dropped, or no longer a dog
  if (o.held) {   // in the user's hand: wherever it is let go is where a dog brings it back to
    callBack(s, b, rand)
    o.carried = o.fetched = false
    o.home = o.x + b.ballSize / 2
    return
  }
  if (o.carried) {
    var k = b.size / 32
    o.x = s.x + (s.dir > 0 ? MOUTH.x : 32 - MOUTH.x - 12) * k
    o.y = s.y + MOUTH.y * k
    return
  }
  var floor = ground(b) - b.ballSize
  var maxX = b.w + b.size - b.ballSize
  o.vy += GRAVITY * dt
  o.x += o.vx * dt
  o.y += o.vy * dt
  o.roll += o.vx * dt
  if (o.y >= floor) {
    o.y = floor
    o.vy = Math.abs(o.vy) > 120 ? -o.vy * BALL_BOUNCE : 0
    o.vx *= Math.exp(-BALL_FRICTION * dt)
  } else if (o.y < 0) {
    o.y = 0
    o.vy = Math.abs(o.vy) * BALL_BOUNCE
  }
  if (o.x < 0) {
    o.x = 0
    o.vx = Math.abs(o.vx) * 0.7
  } else if (o.x > maxX) {
    o.x = maxX
    o.vx = -Math.abs(o.vx) * 0.7
  }
}

function tick(s, dt, b, rand) {
  s.species = b.species || "cat"
  s.energy = b.energy === undefined ? 0.5 : b.energy
  s.w = b.w
  if (s.stay === null) s.stay = STAY_MIN + rand() * STAY_SPAN
  s.petT += dt
  if (s.grumpy > 0) s.grumpy -= dt
  if (s.calm > 0) s.calm -= dt
  // The clocks stand still while nobody is at the desk, or both would wake with their time up
  // and walk off side by side.
  if (!OFFSCREEN[s.mode] && !s.settled) {
    s.stay -= dt
    s.onFor += dt
  }
  if (s.mark && s.mode !== "claw" && (s.mark.left -= dt) <= 0) s.mark = null
  // Wandering switched off: whoever is on the way out turns round, whoever is out comes back.
  // (Hiding from a shared screen and the tour's own trip are not wandering.)
  if (b.wander === false && !b.hide && !s.staged) {
    if (s.mode === "leave") setMode(s, "idle", 0.5)
    else if (s.mode === "away") s.until = Math.min(s.until, s.t)
  }
  watchCursor(s, b, dt)
  moveBall(s, b, dt, rand)
  tease(s, b, dt, rand)
  if (s.mode === "held") return s
  if (s.mode === "fall") {
    s.vy += GRAVITY * dt
    s.y += s.vy * dt
    if (s.y >= b.floor) {
      s.y = b.floor
      setMode(s, "idle", 1)
    }
  } else if (ON_LEDGE[s.mode]) {
    var l = ledge(s, b)
    // Window closed or moved: she is suddenly in plain sight, and falls. A shared screen brings her down too.
    if (!l || b.hide) drop(s)
    else climbStep(s, b, l, dt, rand)
  } else if (s.mode === "pounce") {
    s.t += dt
    var p = Math.min(1, s.t / POUNCE_TIME)
    s.x = s.from + (s.to - s.from) * p
    s.y = b.floor - 4 * POUNCE_HEIGHT * p * (1 - p)
    if (p >= 1) {
      s.y = b.floor
      s.pounces++
      if (s.pounces < MAX_POUNCES && cursorNear(s, b)) setMode(s, "crouch", 0.4 + rand() * 0.6)
      else {
        s.bored = 15 + rand() * 15
        setMode(s, "sit", 2 + rand() * 3)
      }
    }
  } else if (s.mode === "hop") {
    s.t += dt
    var h = Math.min(1, s.t / s.until)
    s.y = b.floor - 4 * HOP_HEIGHT * h * (1 - h)
    if (h >= 1) {
      s.y = b.floor
      next(s, b, rand)
    }
  } else {
    var top = null
    if (s.perch !== null) {
      top = perched(s, b)
      // The window closed, moved or is on another workspace now; a toy is out; or the screen is
      // being shared: down she comes, and the floor rules take over from there.
      if (!top || b.hide || (s.ball && !s.ball.fetched)) {
        drop(s)
        return s
      }
      s.perchFor -= dt
      s.targetX = Math.max(top.x, Math.min(top.x + top.w - b.size, s.targetX))
      if (s.low) {
        // Asking for something means sitting up, and there is no room: she comes down for it.
        if (s.want) {
          climbDown(s, top, b, rand)
          return s
        }
        // Whatever else would have her upright up here (a pet, a welcome) she takes lying low.
        if (!LOW[s.mode] && s.mode !== "petted") setMode(s, "lurk", 2)
      }
    }
    s.y = top ? perchTop(top, b) : b.floor
    s.t += dt
    if (b.hide && !OFFSCREEN[s.mode]) leave(s, b, rand)   // screen is being shared: out of sight
    // Time to bring the toy: that gets her up from a nap, or back from a wander.
    if (!b.hide && !b.exhausted && !s.settled && !s.ball && !top && !s.want && offerDue(s, b) >= 0) {
      if (s.mode === "away") callBack(s, b, rand)
      else if (s.mode === "sleep") setMode(s, "stretch", 1.5)
    }
    if (s.mode === "flee" && s.pending) planFlee(s, b, rand)
    if (s.mode === "chase") {
      var q = b.friend
      if (q && q.mode === "flee") {
        s.dir = q.x < s.x ? -1 : 1
        s.targetX = Math.max(0, Math.min(b.w, q.x))
      } else {   // she got away: bark after her, then sniff off
        setMode(s, "bark", about(2.5, rand))
        s.then = { mode: "sniff", x: Math.max(0, Math.min(b.w, s.x - s.dir * (150 + rand() * 300))) }
      }
    }
    if (s.mode === "sleep") {
      // One dream per long nap: a thought bubble with the toy, or the other pet, for a few seconds.
      if (s.dreamAt === null) s.dreamAt = s.until > 30 ? 8 + rand() * (Math.min(s.until, 150) - 14) : Infinity
      if (s.dream && (s.dream.left -= dt) <= 0) s.dream = null
      if (s.t >= s.dreamAt) {
        s.dream = { what: b.friend && rand() < 0.3 ? "friend" : "toy", left: about(5, rand) }
        s.dreamAt = Infinity
      }
    }
    distract(s, b, rand, dt)
    if (s.mode === "carry" && !(s.ball && s.ball.carried)) setMode(s, "idle", 0.5)   // lost the ball on the way
    // A spot past the screen edge can't be reached; without this she would walk on the spot for it.
    if (PACE[s.mode] && !OFFSCREEN[s.mode]) s.targetX = Math.max(0, Math.min(b.w, s.targetX))
    if (PACE[s.mode]) {
      // Getting out of a shared screen is done at a run.
      s.x += s.dir * (s.mode === "leave" && b.hide ? RUN_SPEED : PACE[s.mode]) * dt
      if ((s.targetX - s.x) * s.dir <= 0) {
        s.x = s.targetX   // no overshoot: a hang spot must stay inside its window
        if (ARRIVES[s.mode]) s.t = s.until = 0
        else if (s.mode === "carry") deliver(s, rand)
      }
    } else if (s.mode === "spin") {
      s.dir = Math.floor(s.t / SPIN_FLIP) % 2 ? -1 : 1
    } else if (s.mode === "crouch") {
      if (!cursorNear(s, b)) setMode(s, "idle", 1)   // the mouse got away
      else s.dir = b.cursor.x < s.x + b.size / 2 ? -1 : 1
    }
    if (s.t >= s.until) next(s, b, rand)
  }
  if (!OFFSCREEN[s.mode]) s.x = Math.max(0, Math.min(b.w, s.x))
  if (top) s.x = Math.max(top.x, Math.min(top.x + top.w - b.size, s.x))
  return s
}

function climbStep(s, b, l, dt, rand) {
  s.t += dt
  var top = l.y - b.peek
  if (s.mode === "climb" && s.onTop) {
    s.y -= CLIMB_SPEED * dt
    if (s.y <= perchTop(l, b)) {   // feet on the edge: she is up
      s.y = perchTop(l, b)
      setMode(s, s.low ? "lurk" : "idle", 1 + rand() * 2)
      s.perch = l.id
      s.perchY = l.y
      s.perchFor = s.staged ? 10 : PERCH_MIN + rand() * PERCH_SPAN
    }
  } else if (s.mode === "climb") {
    s.y -= CLIMB_SPEED * dt
    if (s.y + b.size <= l.y) {   // all the way over the edge
      s.y = l.y
      setMode(s, "peekup", Infinity)
    }
  } else if (s.mode === "peekup") {
    s.y -= PEEK_SPEED * dt
    if (s.y <= top) {
      s.y = top
      setMode(s, "peek", s.staged ? 4 : 6 + rand() * 9)
    }
  } else if (s.mode === "peek") {
    s.y = top
    if (s.t >= s.until) setMode(s, "peekdown", Infinity)
  } else if (s.mode === "peekdown") {
    s.y += PEEK_SPEED * dt
    if (s.y >= l.y) {   // back over the edge to the front
      s.y = l.y - b.size
      startDown(s, l, b, rand)
    }
  } else {
    var m = s.mode === "claw" ? s.mark : null
    if (m) {
      m.t += dt
      var slid = CLAW_START * m.t + CLAW_PULL * m.t * m.t
      var p = Math.min(1, slid / Math.max(1, b.floor - m.y0))
      s.y = m.y0 + slid
      // Never past the window's sides: she has to stay on it to stay up.
      var drift = m.dir * (CLAW_DRIFT * p * p + CLAW_WOBBLE * Math.sin(p * 21)) * b.size
      s.x = Math.max(l.x, Math.min(l.x + l.w - b.size, m.x + drift))
      // The scratches run down to where her paws are now.
      var paws = Math.min(ground(b), s.y + b.size * 0.2)
      if (paws >= m.top && paws >= m.bottom + 2) {
        m.pts.push([s.x - m.x, paws])
        m.bottom = paws
      }
    } else s.y += CLIMB_SPEED * dt
    if (s.y >= b.floor) {
      s.y = b.floor
      setMode(s, "idle", 1 + rand() * 2)
    }
  }
  if (PEEKING[s.mode]) {
    s.clipTop = -Infinity
    s.clipBottom = l.y
  } else if (ON_LEDGE[s.mode]) {
    s.clipTop = s.onTop ? -Infinity : l.y
    s.clipBottom = Infinity
  }
}

// Drops the ball at his feet, play-bows and barks for a throw. A ball he brought unasked and that
// nobody throws, he lies down next to.
function deliver(s, rand) {
  var o = s.ball
  o.carried = false
  o.fetched = true
  o.vx = s.dir * 60
  o.vy = -120
  var wait = o.offered ? { mode: "sit", duration: about(8, rand), then: { mode: "sleep", duration: about(25, rand) } } : null
  o.offered = false
  // Mostly a bow and a bark; sometimes just one of the two.
  var r = rand()
  var bark = { mode: "bark", duration: about(0.8, rand), then: wait }
  if (r < 0.2) return run(s, bark)
  setMode(s, "invite", about(1, rand))
  s.then = r < 0.8 ? bark : wait
}

// Floor modes she can drop to come and ask for something.
var CALM = { idle: true, sit: true, walk: true, run: true, groom: true, yawn: true, sleep: true, stretch: true, petted: true }

// A care reminder (or null to cancel). She asks as soon as she's free.
function want(s, kind) {
  s.want = kind
  s.nag = false
  if (kind && CALM[s.mode]) {
    s.goal = null
    setMode(s, "ask", NAG_AFTER)
  } else if (kind && s.mode === "away") s.until = 0   // off screen: cut the trip short and come ask
  else if (!kind && s.mode === "ask") setMode(s, "idle", 1)
}

// A click on her. If she is asking for something, that serves it. Otherwise it is a pet: a cat
// enjoys a few in a row, then swats the pointer, walks off and for a while only flicks her tail
// at a click; a dog never has enough and rolls over for a belly rub. How many pets that takes
// is drawn anew for every streak.
function pet(s, b, rand) {
  rand = rand || Math.random
  if (s.want && !ON_LEDGE[s.mode] && s.mode !== "held" && s.mode !== "fall" && s.mode !== "pounce"
      && !OFFSCREEN[s.mode]) {
    var w = s.want
    s.want = null
    s.nag = false
    if (w === "water") setMode(s, "drink", 4)
    else if (w === "food") setMode(s, "eat", 5)
    else {
      setMode(s, "idle", 0.5)
      if (b) spawnBall(s, b, rand)
    }
    return
  }
  if (s.mode === "peekup" || s.mode === "peek") return setMode(s, "peekdown", Infinity)   // ducks
  if (ON_LEDGE[s.mode] || s.mode === "held" || s.mode === "fall" || s.mode === "away") return
  // Hammering isn't petting, and a double-click (which gives the toy) is not two pets:
  // only a click at stroking pace counts.
  if (s.petT < PET_GAP) {
    s.petT = 0
    return
  }
  // Crouched on a window under the bar there is no room to enjoy it: a touch up there shoos
  // her off, and she goes down the front of the window with her claws out.
  if (s.perch !== null && s.low) {
    var l = b ? perched(s, b) : null
    if (!l) return drop(s)
    slideDown(s, l, b)
    s.goal = l.id
    s.onTop = true
    s.perch = null
    return
  }
  var dog = s.species === "dog"
  if (s.petT >= PET_WINDOW || s.patience === null) {
    s.pets = 0
    s.patience = dog ? DOG_BELLY + Math.floor(rand() * 3) - 1
      : CAT_PATIENCE + Math.floor(rand() * 3) + (s.energy < 0.3 ? 2 : 0)
  }
  s.pets++
  s.petT = 0
  if (dog) {
    if (s.pets >= s.patience) {
      s.patience = null
      return setMode(s, "belly", about(4, rand))
    }
  } else {
    if (s.grumpy > 0) return setMode(s, "sit", 1)
    if (s.pets > s.patience) {
      s.patience = null
      s.grumpy = about(20, rand)
      setMode(s, "bat", 0.6)
      s.then = { mode: "walk", x: Math.max(0, Math.min(s.w, s.x + (s.x > s.w / 2 ? -1 : 1) * about(250, rand))) }
      return
    }
  }
  setMode(s, "petted", about(1.5, rand))
}

// A window opened or closed right where she is. The cat hops and scurries a few steps off;
// the dog barks at it. More likely the livelier she is, and not again for a few minutes.
function startle(s, b, rand) {
  if (!REACTIVE[s.mode] || s.goal !== null || s.perch !== null || s.calm > 0 || rand() > 0.2 + 0.6 * s.energy) return
  s.calm = STARTLE_REST + rand() * STARTLE_REST
  // Mostly the dog barks and the cat hops and scurries off; now and then he jumps and she just hops.
  var hops = traits(b).fetches ? rand() < 0.3 : true
  if (!hops) return setMode(s, "bark", about(1.5, rand))
  var x = s.x + (rand() < 0.5 ? -1 : 1) * (150 + rand() * 150)
  setMode(s, "hop", 0.35)
  if (traits(b).fetches) s.then = { mode: "bark", duration: about(1, rand) }
  else if (rand() < 0.75) s.then = { mode: "scurry", x: Math.max(0, Math.min(b.w, x)) }
}

// Nobody at the desk: nap right here until someone is back.
function settle(s) {
  if (OFFSCREEN[s.mode] || ON_LEDGE[s.mode] || s.mode === "held" || s.mode === "fall") return
  s.settled = true
  if (s.mode === "sleep") s.until = Infinity
  else setMode(s, "sleep", Infinity)
}

// Someone is back. The dog runs to the pointer and gets his hearts; the cat stretches and yawns.
// A sleepy pet just stretches and sleeps on. One that was away comes back in.
function welcome(s, b, rand, cursorX) {
  var napped = s.settled
  s.settled = false
  if (s.mode === "away") {
    // Not in on the other's heels, here neither: the second one follows by the usual way.
    if (b.friend && b.friend.mode === "enter") return
    s.stay = STAY_MIN + rand() * STAY_SPAN
    return comeBack(s, b, 0, rand())
  }
  if (!napped || s.mode !== "sleep") return
  var x = cursorX === null || cursorX === undefined ? b.w / 2 : cursorX - b.size / 2
  x = Math.max(0, Math.min(b.w, x))
  // Usually the dog comes running and the cat takes her time; some days it is the other way round.
  var comes = rand() < (traits(b).fetches ? 0.8 : 0.2)
  if (s.energy < 0.25) {
    setMode(s, "stretch", 1.5)
    s.then = { mode: "sleep", duration: 60 + rand() * 120 }
  } else if (comes && traits(b).fetches) {
    walkTo(s, x, "greet")
  } else {
    setMode(s, "stretch", 1.5)
    s.then = comes ? { mode: "walk", x: x, then: { mode: "sit", duration: about(4, rand) } }
      : { mode: rand() < 0.6 ? "yawn" : "groom", duration: rand() < 0.6 ? 1.5 : about(3, rand) }
  }
}

// The charger is back in: wake up. The dog with a hop, the cat with a stretch.
function wake(s, b) {
  if (s.mode !== "sleep") return
  if (traits(b).fetches) setMode(s, "hop", 0.35)
  else setMode(s, "stretch", 1.5)
}

function grab(s) {
  s.perch = null
  setMode(s, "held", Infinity)
}

function drop(s) {
  s.perch = null
  s.vy = 0
  setMode(s, "fall", Infinity)
}

// Drops a yarn ball just in front of her (replacing any existing one).
// For a fetcher it is thrown from where he stands, towards the roomier side of the screen.
function spawnBall(s, b, rand) {
  rand = rand || Math.random
  callBack(s, b, rand)
  var far = traits(b).fetches
  if (far) s.dir = s.x < b.w / 2 ? 1 : -1
  var x = s.x + b.size / 2 + s.dir * b.size * 0.8 - b.ballSize / 2
  s.ball = {
    x: Math.max(0, Math.min(b.w + b.size - b.ballSize, x)),
    y: ground(b) - b.ballSize - 150,
    vx: s.dir * (far ? 520 : 80), vy: far ? -350 : 0, roll: 0, life: BALL_LIFE, held: false,
    carried: false, fetched: false, home: s.x + b.size / 2
  }
}

function yarnFrame(o, ballSize) {
  var f = Math.floor(o.roll / (ballSize / 2)) % YARN_FRAMES
  return f < 0 ? f + YARN_FRAMES : f
}

// ---------- Time of day ----------
// How lively a cat is at a given hour (0..24, fractional), 0 = asleep, 1 = bouncing off the walls.
var DAY_CURVE = [[0, 0.05], [5, 0.05], [7, 0.25], [9, 0.9], [12, 0.75], [14, 0.55], [17, 0.6],
                 [19, 0.4], [21, 0.2], [23, 0.07], [24, 0.05]]

// Reads a curve of [x, y] points at x, straight lines in between.
function along(curve, x) {
  for (var i = 1; i < curve.length; i++) {
    var a = curve[i - 1], z = curve[i]
    if (x <= z[0]) return a[1] + (z[1] - a[1]) * (x - a[0]) / (z[0] - a[0])
  }
  return curve[curve.length - 1][1]
}

function timeEnergy(hour) {
  return along(DAY_CURVE, ((hour % 24) + 24) % 24)
}

// The energy slider is her personality; the time of day moves her around it.
function effectiveEnergy(base, hour) {
  return Math.max(0, Math.min(1, timeEnergy(hour) + (base - 0.5) * 0.6))
}

function dayPhase(hour) {
  var h = ((hour % 24) + 24) % 24
  if (h >= 21 || h < 5) return "Night: mostly sleeping"
  if (h < 8) return "Early morning: sleeping in"
  if (h < 12) return "Morning: full of energy"
  if (h < 17) return "Afternoon: taking it steady"
  return "Evening: getting sleepy"
}

// ---------- Tour ----------
// Everything a pet does, one thing at a time, for looking at it. Service.qml runs it on request
// (omarchy-shell pixel-pets tour): it waits until the pet is free(), calls a step's start(), shows
// its name, and moves on after `seconds`, or sooner when done() says so. start() returning false
// skips the step (no window to climb, say).

// On the floor and not in the middle of something that has to finish first.
function free(s) {
  return !OFFSCREEN[s.mode] && !ON_LEDGE[s.mode] && s.perch === null && s.mode !== "held" && s.mode !== "fall"
    && s.mode !== "hop" && s.mode !== "pounce"
}

// Gets her free for the next step: back on screen, down from a window.
function freeUp(s, b, rand) {
  callBack(s, b, rand)
  if (ON_LEDGE[s.mode] || s.perch !== null) drop(s)
  s.stay = 1e9   // no wandering off in the middle of it
}

// Back to her own life.
function tourEnd(s, rand) {
  s.staged = null
  s.stay = STAY_MIN + rand() * STAY_SPAN
}

function tour(species) {
  var dog = species === "dog"
  var she = dog ? "his" : "her"
  var pose = function(name, mode, seconds, also) {
    return { name: name, seconds: seconds, start: function(s) { setMode(s, mode, seconds); if (also) also(s) } }
  }
  // The window she can get onto: one with room on top if there is one, else any.
  var windowFor = function(s, b) {
    var ls = b.ledges || [], pick = null
    for (var i = 0; i < ls.length; i++)
      if (!pick || (perchTop(ls[i], b) >= 0 && perchTop(pick, b) < 0)) pick = ls[i]
    return pick
  }
  var upAWindow = function(name, staged) {
    var climbed = false
    return { name: name, seconds: 120,
      start: function(s, b) {
        var l = traits(b).climbs ? windowFor(s, b) : null
        if (!l) return false
        climbed = false
        s.staged = staged
        walkTo(s, Math.max(l.x, Math.min(l.x + l.w - b.size, s.x)))
        s.goal = l.id
      },
      done: function(s) {
        if (ON_LEDGE[s.mode] || s.perch !== null) climbed = true
        return climbed && free(s)
      } }
  }
  var away = false
  var steps = [
    pose("Idle", "idle", 3),
    { name: "Walk", seconds: 4, start: function(s, b) { walkTo(s, s.x < b.w / 2 ? s.x + 220 : s.x - 220) } },
    pose("Sit", "sit", 3),
    pose(dog ? "Scratching" : "Grooming", "groom", 3.5),
    pose("Yawn", "yawn", 1.6),
    pose("Sleep, with a dream", "sleep", 7, function(s) { s.dreamAt = 1 }),
    pose("Stretch", "stretch", 1.6),
    pose("Petted", "petted", 2.5),
    { name: "Asking for water", seconds: 3.5, start: function(s) { setMode(s, "idle", 1); want(s, "water") } },
    { name: "Drinking", seconds: 4, start: function(s, b, rand) { want(s, "water"); pet(s, b, rand) } },
    { name: "Asking for food", seconds: 3.5, start: function(s) { setMode(s, "idle", 1); want(s, "food") } },
    { name: "Eating", seconds: 5, start: function(s, b, rand) { want(s, "food"); pet(s, b, rand) } },
    { name: "Startled by a window", seconds: 3.5, start: function(s, b) {
        setMode(s, "idle", 1); s.calm = 0
        startle(s, b, function() { return 0.5 }) } },
    { name: "Zoomies", seconds: 25, start: function(s, b, rand) { zoomies(s, b, rand) },
      done: function(s) { return s.mode !== "zoom" } },
    { name: "Wandering off and back", seconds: 90,
      start: function(s, b, rand) { away = false; setMode(s, "idle", 1); s.staged = {}; leave(s, b, rand); s.awayFor = 2 },
      done: function(s) { if (s.mode === "away") away = true; return away && !OFFSCREEN[s.mode] } }
  ]
  if (dog) steps.push(
    { name: "Sniffing", seconds: 4.5, start: function(s, b) { walkTo(s, s.x < b.w / 2 ? s.x + 150 : s.x - 150, "sniff") } },
    pose("Bark", "bark", 1.6),
    pose("Chasing his tail", "spin", 2.6),
    pose("Play bow", "invite", 1.8),
    pose("Belly rub", "belly", 4),
    { name: "Fetch", seconds: 30, start: function(s, b, rand) { setMode(s, "idle", 1); spawnBall(s, b, rand) },
      done: function(s) { return !s.ball || (s.ball.fetched && STILL[s.mode] && s.mode !== "invite" && s.mode !== "bark") } }
  )
  else steps.push(
    { name: "Yarn: chasing and batting it", seconds: 9, start: function(s, b, rand) { setMode(s, "idle", 1); spawnBall(s, b, rand) } },
    { name: "One pet too many: a swat", seconds: 4, start: function(s, b) {
        setMode(s, "bat", 0.6)
        s.then = { mode: "walk", x: Math.max(0, Math.min(b.w, s.x + (s.x > b.w / 2 ? -250 : 250))) } } },
    upAWindow("Up a window to peek over it", { onTop: false, claw: false, play: false }),
    upAWindow("Onto a window, and down with " + she + " claws out", { onTop: true, claw: true, play: false })
  )
  return steps
}

// What the two do together. s is the dog, f the cat.
function tourTogether() {
  var began = false
  var over = function(mode) {   // once the dog has been in `mode` and is out of it again
    return function(s) { if (s.mode === mode) began = true; return began && s.mode !== mode && free(s) }
  }
  var visiting = function(name, play) {
    return { name: name, seconds: 40,
      start: function(s, b, rand, f) {
        began = false
        setMode(f, "sit", 30); setMode(s, "idle", 1)
        s.staged = { onTop: false, claw: false, play: play }
        visit(s, f, b)
      },
      // Over once he has arrived and is through with whatever the visit turned into.
      done: function(s) {
        if (!s.visiting && s.mode !== "walk") began = true
        return began && !{ sit: true, invite: true, spin: true, bark: true }[s.mode]
      } }
  }
  return [
    visiting("A visit: sitting together", false),
    visiting("A visit: play", true),
    { name: "Napping side by side", seconds: 45,
      start: function(s, b, rand, f) { began = false; setMode(f, "sleep", 25); setMode(s, "idle", 1); visit(s, f, b) },
      done: function(s) { if (s.mode === "sleep" && s.t > 5) began = true; return began } },
    { name: "Yawning one after the other", seconds: 5,
      start: function(s, b, rand, f) { setMode(f, "idle", 2); yawnTogether(s, f, function() { return 0.3 }) } },
    { name: "The chase", seconds: 60,
      start: function(s, b, rand, f) { began = false; setMode(f, "idle", 1); chase(s, f) },
      done: over("bark") }
  ]
}
