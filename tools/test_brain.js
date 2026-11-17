// Self-check for Brain.js: node tools/test_brain.js
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert")

const src = fs.readFileSync(path.join(__dirname, "..", "Brain.js"), "utf8").replace(".pragma library", "")
const B = {}
vm.runInNewContext(src, B)

let seed = 42
const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
const bounds = { w: 1824, floor: 984, size: 96, ballSize: 36 }
const s = B.create(100, bounds.floor)
const seen = new Set()

for (let i = 0; i < 30 * 60 * 90; i++) { // 90 simulated minutes
  B.tick(s, 1 / 30, bounds, rand)
  seen.add(s.mode)
  assert(B.OFFSCREEN[s.mode] || (s.x >= 0 && s.x <= bounds.w), "x out of bounds: " + s.x)
  assert.strictEqual(s.y, bounds.floor)
  assert(B.ANIMS[s.mode], "no animation for mode " + s.mode)
}
for (const m of ["idle", "walk", "sit", "sleep", "groom", "yawn", "stretch"]) assert(seen.has(m), "never entered " + m)

// Wherever the simulation left her (maybe off screen), carry on from the floor, and keep her here.
s.mode = "idle"; s.x = 100; s.y = bounds.floor; s.goal = null; s.stay = 1e9
B.pet(s)
assert.strictEqual(s.mode, "petted")
B.grab(s); s.x = -500; s.y = 100
B.tick(s, 1 / 30, bounds, rand)
assert.strictEqual(s.y, 100, "held pet must not move on its own")
B.pet(s)
assert.strictEqual(s.mode, "held", "cannot pet while held")
B.drop(s)
for (let i = 0; i < 90 && s.mode === "fall"; i++) B.tick(s, 1 / 30, bounds, rand)
assert.strictEqual(s.mode, "idle")
assert.strictEqual(s.y, bounds.floor)
assert.strictEqual(s.x, 0, "dropped off-screen pet is clamped back")

// Climbing up behind a window and peeking over its top edge
const win = { id: "0xabc", x: 200, y: 38, w: 900 }
const wb = { w: 1824, floor: 984, size: 96, peek: 30, ledges: [win] }
const until = (mode, max = 30 * 60 * 30) => {
  for (let i = 0; i < max && s.mode !== mode; i++) {
    const was = s.mode
    B.tick(s, 1 / 30, wb, rand)
    assert(B.ANIMS[s.mode], "no animation for mode " + s.mode)
    assert(!(B.ON_LEDGE[was] && s.mode === "fall" && wb.ledges.length), "fell off a window that is still there")
    if (s.mode === "climb" || s.mode === "descend") assert(s.y <= wb.floor && s.y >= win.y - wb.size - 1, "stays between the floor and just over the edge")
    if (B.PEEKING[s.mode]) assert(s.clipBottom === win.y && s.clipTop === -Infinity, "only the part above the edge shows")
    else if (B.ON_LEDGE[s.mode]) assert(s.clipTop === win.y && s.clipBottom === Infinity, "only the part below the edge shows")
    else assert(s.clipTop === -Infinity && s.clipBottom === Infinity, "fully visible off the window")
  }
  assert.strictEqual(s.mode, mode, "never reached " + mode)
}
until("climb")
assert(s.x >= win.x && s.x + wb.size <= win.x + win.w, "climbs within the window")
let climbTicks = 0
while (s.mode === "climb") { B.tick(s, 1 / 30, wb, rand); climbTicks++ }
assert(climbTicks / 30 > 8, "the climb should take a while, took " + (climbTicks / 30).toFixed(1) + "s")
until("peek")
assert.strictEqual(s.y, win.y - wb.peek, "peeks with her ears and eyes above the edge")
until("descend")
assert(s.y + wb.size <= win.y + 5, "comes back over the edge from behind it")
until("idle", 30 * 20)
assert.strictEqual(s.y, wb.floor, "back on the floor")

until("peek")
B.pet(s)
assert.strictEqual(s.mode, "peekdown", "petting her while she peeks makes her duck")

until("peek")
wb.ledges = [] // window closes
for (let i = 0; i < 90 && s.mode !== "idle"; i++) B.tick(s, 1 / 30, wb, rand)
assert.strictEqual(s.mode, "idle", "falls when the window goes away")
assert.strictEqual(s.y, wb.floor)
assert(s.clipTop === -Infinity && s.clipBottom === Infinity)

// Chasing the mouse
const cb = { w: 1824, floor: 984, size: 96, peek: 30, ledges: [], ballSize: 36, cursor: null }
const c = B.create(500, cb.floor)
let crouched = false, pounced = false, bored = false
for (let i = 0; i < 30 * 60; i++) {
  cb.cursor = { x: 800 + 30 * Math.sin(i / 3), y: cb.floor + 60 }   // wiggling near the floor
  B.tick(c, 1 / 30, cb, rand)
  crouched = crouched || c.mode === "crouch"
  if (c.mode === "pounce") {
    pounced = true
    assert(c.y <= cb.floor && c.y >= cb.floor - 60, "pounce arc out of range: " + c.y)
  }
  bored = bored || c.bored > 0
  assert(c.x >= 0 && c.x <= cb.w)
}
assert(crouched && pounced, "never stalked and pounced the mouse")
assert(bored, "never got bored of the mouse")

const far = B.create(500, cb.floor)
for (let i = 0; i < 30 * 60 * 5; i++) {
  cb.cursor = { x: 800 + 30 * Math.sin(i / 3), y: 100 }   // moving, but high up the screen
  B.tick(far, 1 / 30, cb, rand)
  assert(far.mode !== "crouch" && far.mode !== "pounce", "chased a mouse that was nowhere near the floor")
}

// Yarn ball
cb.cursor = null
const k = B.create(300, cb.floor)
B.spawnBall(k, cb)
let bats = 0
for (let i = 0; i < 30 * 45; i++) {
  const was = k.mode
  B.tick(k, 1 / 30, cb, rand)
  if (k.mode === "bat" && was !== "bat") bats++
  if (k.ball) {
    assert(k.ball.x >= 0 && k.ball.x <= cb.w + cb.size - cb.ballSize, "ball left the screen")
    assert(k.ball.y >= 0 && k.ball.y <= cb.floor + cb.size - cb.ballSize, "ball fell through the floor")
    assert(B.yarnFrame(k.ball, cb.ballSize) >= 0 && B.yarnFrame(k.ball, cb.ballSize) < B.YARN_FRAMES)
  }
}
assert(bats >= 3, "batted the ball only " + bats + " times")
assert.strictEqual(k.ball, null, "ball should go away after a while")
assert.notStrictEqual(k.mode, "run", "stops chasing once the ball is gone")

// Adaptive tick rate: slow while still, full rate while moving, and the pet still lives a normal life
assert.strictEqual(B.tickInterval("run", false), 33)
assert.strictEqual(B.tickInterval("climb", false), 33)
assert.strictEqual(B.tickInterval("sleep", true), 33, "a ball in play always gets the full rate")
assert(B.tickInterval("sleep", false) > B.tickInterval("sit", false) && B.tickInterval("sit", false) > 33)
const ab = { ...cb, ledges: [win], ballSize: 36 }
const a = B.create(500, ab.floor)
const seenA = new Set()
let simulated = 0, ticks = 0
while (simulated < 30 * 60) {
  const dt = B.tickInterval(a.mode, !!a.ball) / 1000
  B.tick(a, dt, ab, rand)
  simulated += dt; ticks++
  seenA.add(a.mode)
  assert(B.OFFSCREEN[a.mode] || (a.x >= 0 && a.x <= ab.w))
  if (!B.ON_LEDGE[a.mode] && a.mode !== "fall") assert.strictEqual(a.y, ab.floor)
}
for (const m of ["idle", "walk", "sit", "sleep", "climb", "peek", "descend"]) assert(seenA.has(m), "adaptive: never entered " + m)
assert(ticks / simulated < 18, "should tick well under 30/s on average, did " + (ticks / simulated).toFixed(1) + "/s")

// Care reminders: she sits and asks, ignores the mouse meanwhile, and a click serves it
const tick30 = (c, bb, n) => { for (let i = 0; i < n; i++) { B.tick(c, 1 / 30, bb, rand); assert(B.ANIMS[c.mode], "no animation for " + c.mode) } }
const rb = { ...cb, ledges: [], ballSize: 36, cursor: { x: 1500, y: cb.floor + 40 } }
const r = B.create(300, rb.floor)
B.want(r, "water")
assert.strictEqual(r.mode, "ask")
for (let i = 0; i < 30 * 200; i++) {   // a wiggling mouse right next to her doesn't distract her
  rb.cursor = { x: r.x + 60 + (i % 2) * 20, y: rb.floor + 40 }
  B.tick(r, 1 / 30, rb, rand)
  assert.strictEqual(r.mode, "ask", "keeps asking, was " + r.mode)
}
B.pet(r, rb)
assert.strictEqual(r.mode, "drink")
assert.strictEqual(r.want, null)
tick30(r, rb, 30 * 4.1)
assert.strictEqual(r.mode, "petted", "happy after a drink")
B.want(r, "food"); B.pet(r, rb)
assert.strictEqual(r.mode, "eat")
B.want(r, "break"); B.pet(r, rb)
assert(r.ball && r.want === null, "a break brings out the ball")
tick30(r, rb, 30 * 3)
assert(r.mode === "run" || r.mode === "bat", "and she plays with it, was " + r.mode)   // chasing it, or just batting it
B.want(r, null)

// Ignored for NAG_AFTER: she walks over to the mouse, bubble bouncing, and asks there
const n = B.create(100, rb.floor)
rb.cursor = { x: 1200, y: rb.floor + 40 }
B.want(n, "food")
tick30(n, rb, 30 * (B.NAG_AFTER + 1))
assert(n.nag && n.mode === "walk", "goes to nag, was " + n.mode)
for (let i = 0; i < 30 * 30; i++) {   // the mouse wiggles; she's on a mission, not hunting
  rb.cursor = { x: 1200 + (i % 2) * 10, y: rb.floor + 40 }
  B.tick(n, 1 / 30, rb, rand)
  assert(n.mode === "walk" || n.mode === "ask", "got distracted into " + n.mode)
}
assert.strictEqual(n.mode, "ask")
assert(Math.abs(n.x + rb.size / 2 - 1200) < 5, "asks right by the mouse")
B.want(n, null)
assert(n.mode !== "ask" && !n.nag, "cancelled reminder stops the asking")

// Asked while up on a window: finishes the trip, then asks on the floor
const w2 = B.create(500, ab.floor)
for (let i = 0; i < 30 * 60 * 30 && w2.mode !== "climb"; i++) B.tick(w2, 1 / 30, ab, rand)
assert.strictEqual(w2.mode, "climb")
B.want(w2, "water")
assert.strictEqual(w2.mode, "climb", "doesn't let go of the window")
for (let i = 0; i < 30 * 120 && w2.mode !== "ask"; i++) B.tick(w2, 1 / 30, ab, rand)
assert.strictEqual(w2.mode, "ask")
assert.strictEqual(w2.y, ab.floor)

// Energy: a lazy cat sleeps more than a playful one
// Share of the time on screen spent asleep.
function sleepShare(energy, species = "cat") {
  const eb = { w: 1824, floor: 984, size: 96, peek: 30, ledges: [], ballSize: 36, cursor: null, energy, species }
  const e = B.create(500, eb.floor)
  let asleep = 0, here = 0
  for (let i = 0; i < 30 * 60 * 60 * 4; i++) {
    B.tick(e, 1 / 30, eb, rand)
    if (B.OFFSCREEN[e.mode]) continue
    here++
    if (e.mode === "sleep") asleep++
  }
  return asleep / here
}
const lazy = sleepShare(0), playful = sleepShare(1)
assert(lazy > playful * 2, `lazy cat should sleep much more: lazy ${lazy.toFixed(2)} playful ${playful.toFixed(2)}`)

// Time of day
assert(B.timeEnergy(3) < 0.1 && B.timeEnergy(10) > 0.8 && B.timeEnergy(20) < 0.35, "day curve shape")
assert(B.timeEnergy(6) < B.timeEnergy(9), "sleeps in, then wakes up")
assert(Math.abs(B.timeEnergy(24) - B.timeEnergy(0)) < 1e-9 && Math.abs(B.timeEnergy(-1) - B.timeEnergy(23)) < 1e-9)
for (let h = 0; h < 24; h += 0.25) {
  for (const base of [0, 0.5, 1]) {
    const e = B.effectiveEnergy(base, h)
    assert(e >= 0 && e <= 1, "energy out of range at " + h)
  }
  assert(B.dayPhase(h).length > 0)
}
assert(B.effectiveEnergy(1, 2) > B.effectiveEnergy(0, 2), "a playful cat is livelier at night than a lazy one")
const night = sleepShare(B.effectiveEnergy(0.5, 2)), morning = sleepShare(B.effectiveEnergy(0.5, 10))
assert(night > 0.5, "should sleep most of the night, slept " + night.toFixed(2))
assert(night > morning * 3, `sleeps far more at night: night ${night.toFixed(2)} morning ${morning.toFixed(2)}`)


// ---------- Dog: stays on the ground, fetches, has his own idle habits ----------
{
  const d = B.create(400, bounds.floor)
  const db = { w: 1824, floor: 984, size: 96, peek: 30, ballSize: 36, ledges: [win], species: "dog", energy: 0.8 }
  const modes = new Set()
  for (let i = 0; i < 30 * 60 * 60; i++) {
    B.tick(d, 1 / 30, db, rand)
    modes.add(d.mode)
    assert(B.ANIMS[d.mode], "no animation for mode " + d.mode)
    assert(!B.ON_LEDGE[d.mode], "a dog never climbs")
    assert.strictEqual(d.y, db.floor)
  }
  for (const m of ["sniff", "bark", "spin", "walk", "sleep"]) assert(modes.has(m), "dog never entered " + m)
  assert(!modes.has("bat"), "a dog fetches instead of batting")

  // Fetch: thrown from where he stands, carried back there, dropped, then left alone.
  d.x = 300; B.grab(d); B.drop(d)
  for (let i = 0; i < 90 && d.mode === "fall"; i++) B.tick(d, 1 / 30, db, rand)
  B.spawnBall(d, db)
  const home = d.ball.home
  assert.strictEqual(home, 300 + db.size / 2)
  let far = 0, carried = false
  for (let i = 0; i < 30 * 30 && !(d.ball && d.ball.fetched); i++) {
    B.tick(d, 1 / 30, db, rand)
    assert(d.ball, "the ball must outlive the fetch")
    far = Math.max(far, Math.abs(d.ball.x - home))
    if (d.mode === "carry") {
      carried = true
      assert(d.ball.carried && Math.abs(d.ball.x - d.x) < db.size, "the ball rides in his mouth")
    }
  }
  assert(far > 300, "the ball should fly well away, got " + far)
  assert(carried && d.ball.fetched, "he brings it back")
  assert(d.mode === "invite" || d.mode === "bark", "and bows or barks for another throw, not " + d.mode)
  assert(Math.abs(d.x + db.size / 2 - home) < 2, "back where it was thrown from")
  for (let i = 0; i < 30 * 10; i++) {
    B.tick(d, 1 / 30, db, rand)
    assert(d.mode !== "run" && d.mode !== "carry", "a fetched ball is left alone")
  }
  // Picking the ball up makes it fair game again, and taking it from his mouth stops the carry.
  d.ball.held = true; d.ball.x = 1200; d.ball.y = db.floor
  B.tick(d, 1 / 30, db, rand)
  d.ball.held = false
  for (let i = 0; i < 30 * 30 && d.mode !== "carry"; i++) B.tick(d, 1 / 30, db, rand)
  assert.strictEqual(d.mode, "carry", "fetches a ball that was thrown by hand")
  d.ball.held = true
  B.tick(d, 1 / 30, db, rand)
  assert(d.mode !== "carry" && !d.ball.carried, "lets go when the ball is taken")
}
// ---------- Dog follows the energy setting like the cat does ----------
{
  const share = (species, energy) => {
    const p = B.create(400, bounds.floor), t = {}
    const pb = { w: 1824, floor: 984, size: 96, ballSize: 36, ledges: [], species, energy }
    const n = 30 * 60 * 120
    let here = 0
    for (let i = 0; i < n; i++) {
      B.tick(p, 1 / 30, pb, rand)
      if (B.OFFSCREEN[p.mode]) continue
      here++
      t[p.mode] = (t[p.mode] || 0) + 1
    }
    for (const m in t) t[m] /= here   // shares of the time on screen
    return t
  }
  const lazy = share("dog", 0.1), lively = share("dog", 0.9)
  assert(lazy.sleep > 0.6 && lazy.sleep > 3 * lively.sleep, "a lazy dog mostly sleeps: " + lazy.sleep + " vs " + lively.sleep)
  const cat = share("cat", 0.1)
  assert(Math.abs(lazy.sleep - cat.sleep) < 0.15, "as much as a lazy cat: " + lazy.sleep + " vs " + cat.sleep)
  const antics = t => (t.bark || 0) + (t.spin || 0)
  assert(antics(lively) > 3 * antics(lazy), "barking and tail-chasing follow the slider")
}

// ---------- Cat and dog out together ----------
{
  // The dog is a size up, so the two rest at different heights.
  const ground = 1079, floors = { cat: 989, dog: 959 }, sizes = { cat: 96, dog: 128 }
  const cat = B.create(600, floors.cat), dog = B.create(1200, floors.dog)
  const pb = (species, friend, energy) => ({
    w: 1920 - sizes[species], floor: floors[species], ground, size: sizes[species], ballSize: sizes[species] * 0.375,
    ledges: [], species, friend, friendSize: sizes[species === "cat" ? "dog" : "cat"], energy
  })
  const run = (energy, minutes) => {
    const seen = { cat: new Set(), dog: new Set() }
    let together = 0, naps = 0
    for (let i = 0; i < 30 * 60 * minutes; i++) {
      B.tick(cat, 1 / 30, pb("cat", dog, energy), rand)
      B.tick(dog, 1 / 30, pb("dog", cat, energy), rand)
      for (const [k, p] of [["cat", cat], ["dog", dog]]) {
        seen[k].add(p.mode)
        assert(B.ANIMS[p.mode], "no animation for mode " + p.mode)
        assert.strictEqual(p.y, floors[k], k + " left the floor")
      }
      if (dog.mode === "invite" || (cat.mode === "bat" && !cat.ball)) together++
      if (cat.mode === "sleep" && dog.mode === "sleep" && Math.abs(cat.x - dog.x) < 128) naps++
    }
    return { seen, together: together / 30, naps }
  }
  const lively = run(0.9, 120)
  assert(lively.seen.dog.has("invite"), "the dog asks the cat to play")
  assert(lively.seen.cat.has("bat"), "the cat taps the dog")
  assert(!lively.seen.cat.has("invite") && !lively.seen.dog.has("bat"), "each keeps to its own moves")
  assert(lively.together < 120 * 60 * 0.05, "playing stays occasional: " + lively.together + "s in two hours")
  const lazy = run(0.1, 120)
  assert(lazy.together < lively.together, "a lazy pair plays less")
  assert(lazy.naps > 0, "a lazy pair naps side by side now and then")

  // The yarn rests on the ground line, not on the pet's floor.
  B.spawnBall(cat, pb("cat", null, 0.5))
  for (let i = 0; i < 30 * 5; i++) B.tick(cat, 1 / 30, pb("cat", null, 0.5), rand)
  assert(cat.ball.y <= ground - 36 && cat.ball.y > ground - 36 - 96, "ball near the ground line: " + cat.ball.y)
}
// ---------- Wandering off: the cat for about half the time, the dog for 20% ----------
for (const species of ["cat", "dog"]) {
  const p = B.create(400, bounds.floor)
  const pb = { w: 1824, floor: 984, size: 96, ballSize: 36, ledges: [], species, energy: 0.5 }
  const n = 30 * 60 * 60 * 12
  let away = 0, trips = 0, was = "idle"
  for (let i = 0; i < n; i++) {
    B.tick(p, 1 / 30, pb, rand)
    if (p.mode === "away") {
      away++
      assert(p.x <= -pb.size || p.x >= pb.w + pb.size, "away means fully past the edge: " + p.x)
      if (was !== "away") trips++
    } else if (!B.OFFSCREEN[p.mode]) assert(p.x >= 0 && p.x <= pb.w, p.mode + " off screen at " + p.x)
    was = p.mode
  }
  const want = species === "cat" ? 0.5 : 0.2   // the cat roams far more
  assert(Math.abs(away / n - want) < 0.07, species + " away share " + (away / n).toFixed(2))
  assert(trips > 20, "in many short trips, not a few long ones: " + trips)
}
{
  // A toy calls her back.
  const p = B.create(400, bounds.floor)
  const pb = { w: 1824, floor: 984, size: 96, ballSize: 36, ledges: [], species: "dog", energy: 0.5 }
  for (let i = 0; i < 30 * 60 * 60 && p.mode !== "away"; i++) B.tick(p, 1 / 30, pb, rand)
  assert.strictEqual(p.mode, "away")
  B.spawnBall(p, pb)
  assert.strictEqual(p.mode, "enter")
  for (let i = 0; i < 30 * 60 && !(p.ball && p.ball.fetched); i++) B.tick(p, 1 / 30, pb, rand)
  assert(p.ball && p.ball.fetched && p.x >= 0 && p.x <= pb.w, "comes back in and fetches it")
}
// ---------- Gimmicks ----------
{
  const ground = 1079, floors = { cat: 989, dog: 959 }, sizes = { cat: 96, dog: 128 }
  const mk = (extra = {}) => {
    const cat = B.create(600, floors.cat), dog = B.create(1200, floors.dog)
    const pb = (species, energy = 0.9) => Object.assign({
      w: 1920 - sizes[species], floor: floors[species], ground, size: sizes[species], ballSize: sizes[species] * 0.375,
      ledges: [], species, friend: species === "cat" ? dog : cat, friendSize: sizes[species === "cat" ? "dog" : "cat"], energy
    }, extra)
    const step = (n, energy) => { for (let i = 0; i < n; i++) { B.tick(cat, 1 / 30, pb("cat", energy), rand); B.tick(dog, 1 / 30, pb("dog", energy), rand) } }
    return { cat, dog, pb, step }
  }
  const settleDown = w => { for (const p of [w.cat, w.dog]) p.stay = 1e9 }

  // Cuddle: the visitor lies down face to face with the sleeper, heads just overlapping.
  for (const [sleeper, visitor, dir] of [["cat", "dog", 1], ["cat", "dog", -1], ["dog", "cat", 1], ["dog", "cat", -1]]) {
    const w = mk(); w.step(1); settleDown(w)
    const zs = w[sleeper], v = w[visitor]
    zs.x = 900; zs.dir = dir; zs.mode = "sleep"; zs.t = 0; zs.until = 200
    v.x = dir > 0 ? 300 : 1500; v.mode = "idle"
    B.visit(v, zs, w.pb(visitor))
    for (let i = 0; i < 30 * 40 && v.mode !== "sleep"; i++) w.step(1)
    assert.strictEqual(v.mode, "sleep", visitor + " lies down next to the sleeping " + sleeper)
    assert.strictEqual(v.dir, -zs.dir, "face to face")
    const head = (p, k) => p.dir > 0 ? [p.x + 15 * k, p.x + 29 * k] : [p.x + 3 * k, p.x + 17 * k]
    const a = head(zs, sizes[sleeper] / 32), c = head(v, sizes[visitor] / 32)
    const overlap = Math.min(a[1], c[1]) - Math.max(a[0], c[0])
    assert(overlap > 0 && overlap <= 16, "heads overlap a little: " + overlap)
  }

  // The chase: she bolts off screen (no windows to climb), he barks after her and sniffs off.
  {
    const w = mk(); w.step(1); settleDown(w)
    w.cat.mode = w.dog.mode = "idle"
    B.chase(w.dog, w.cat)
    const seen = new Set()
    for (let i = 0; i < 30 * 40; i++) { w.step(1); seen.add(w.cat.mode); seen.add("dog:" + w.dog.mode) }
    for (const m of ["flee", "away", "enter", "dog:chase", "dog:bark", "dog:sniff"]) assert(seen.has(m), "chase never showed " + m)
  }
  // With a window to climb she goes up it and peeks.
  {
    const w = mk({ ledges: [{ id: "0x1", x: 200, y: 40, w: 700 }], peek: 30 }); w.step(1); settleDown(w)
    w.cat.mode = w.dog.mode = "idle"
    B.chase(w.dog, w.cat)
    const seen = new Set()
    for (let i = 0; i < 30 * 30; i++) { w.step(1); seen.add(w.cat.mode); assert(!B.ON_LEDGE[w.dog.mode], "the dog stays down") }
    assert(seen.has("climb") && seen.has("peek"), "the cat escapes up the window")
  }

  // Petting has a limit, drawn anew for every streak.
  {
    const w = mk(); w.step(1); settleDown(w)
    const lo = () => 0
    w.cat.mode = "sit"
    for (let i = 0; i < 3; i++) { B.pet(w.cat, null, lo); assert.strictEqual(w.cat.mode, "petted"); w.step(15) }
    B.pet(w.cat, null, lo)
    assert.strictEqual(w.cat.mode, "bat", "one pet too many gets a swat")
    w.step(30 * 2); assert.strictEqual(w.cat.mode, "walk", "and she walks off")
    B.pet(w.cat, null, lo); assert.strictEqual(w.cat.mode, "sit", "sulking: only a tail flick")
    w.dog.mode = "sit"
    for (let i = 0; i < 3; i++) { B.pet(w.dog, null, lo); assert.strictEqual(w.dog.mode, "petted"); w.step(15) }
    B.pet(w.dog, null, lo); assert.strictEqual(w.dog.mode, "belly", "enough quick pets and he rolls over")
    // Faster than stroking pace doesn't count: a double-click is the toy, not two pets.
    const fast = B.create(600, floors.cat); fast.w = 1824
    for (let i = 0; i < 40; i++) { B.pet(fast, null, lo); fast.petT = 0.2 }
    assert(fast.mode === "petted" && fast.pets === 1, "hammering never reaches the limit: " + fast.mode + " " + fast.pets)
    const limits = new Set()
    for (let i = 0; i < 40; i++) {
      const c = B.create(600, floors.cat); c.w = 1824; let n = 0
      while (c.mode !== "bat") { c.petT = 0.5; B.pet(c, null, rand); n++ }
      limits.add(n)
    }
    assert(limits.size >= 3, "her patience differs from streak to streak: " + [...limits])
  }

  // Welcome back.
  {
    const w = mk(); w.step(1); settleDown(w)
    B.settle(w.cat); B.settle(w.dog); w.step(30 * 60)
    assert(w.cat.mode === "sleep" && w.dog.mode === "sleep", "both nap while nobody is there")
    const usual = () => 0.5
    B.welcome(w.cat, w.pb("cat"), usual, 400); B.welcome(w.dog, w.pb("dog"), usual, 400)
    assert.strictEqual(w.cat.mode, "stretch"); assert.strictEqual(w.dog.mode, "greet")
    for (let i = 0; i < 30 * 20 && w.dog.mode === "greet"; i++) w.step(1)
    assert.strictEqual(w.dog.mode, "petted", "hearts at the pointer")
    assert(Math.abs(w.dog.x + 64 - 400) < 3, "he ran to the pointer")
    const lazy = mk(); lazy.step(1, 0.1); settleDown(lazy)
    B.settle(lazy.dog); B.welcome(lazy.dog, lazy.pb("dog", 0.1), rand, 400)
    lazy.step(30 * 3, 0.1); assert.strictEqual(lazy.dog.mode, "sleep", "a sleepy dog stretches and sleeps on")
  }

  // Camera shy: out of sight while the screen is shared, back afterwards.
  {
    const w = mk({ hide: true }); settleDown(w)
    w.step(30 * 20)
    assert(w.cat.mode === "away" && w.dog.mode === "away", "both gone within seconds: " + w.cat.mode + " " + w.dog.mode)
    w.step(30 * 60); assert(w.cat.mode === "away" && w.dog.mode === "away", "and they stay gone")
    const back = mk(); back.cat.mode = back.dog.mode = "away"; back.cat.x = -96; back.dog.x = 1920
    back.cat.until = back.dog.until = 3; back.step(30 * 150)   // one after the other, not as a pair
    assert(!B.OFFSCREEN[back.cat.mode] && !B.OFFSCREEN[back.dog.mode], "back once it stops")
  }

  // Low battery: everyone sleeps; the charger wakes them.
  {
    const w = mk({ exhausted: true }); w.step(1); settleDown(w)
    w.step(30 * 30)
    let asleep = 0
    for (let i = 0; i < 30 * 60 * 10; i++) { w.step(1); if (w.cat.mode === "sleep") asleep++; if (w.dog.mode === "sleep") asleep++ }
    assert(asleep / (2 * 30 * 60 * 10) > 0.85, "asleep on an empty battery, bar the odd stretch: " + asleep)
    w.cat.mode = w.dog.mode = "sleep"
    B.wake(w.cat, w.pb("cat")); B.wake(w.dog, w.pb("dog"))
    assert.strictEqual(w.cat.mode, "stretch"); assert.strictEqual(w.dog.mode, "hop")
    w.step(30); assert.strictEqual(w.dog.y, floors.dog, "the hop lands")
  }

  // Startled, dreams, zoomies, asking to play, yawning together: all show up over a lively day,
  // and none of the self-started ones at the lazy end.
  const day = (energy, hours) => {
    const w = mk(); const seen = new Set(); let dreams = 0
    for (let i = 0; i < 30 * 3600 * hours; i++) {
      w.step(1, energy)
      seen.add(w.cat.mode); seen.add("dog:" + w.dog.mode)
      if (w.cat.dream || w.dog.dream) dreams++
      for (const p of [w.cat, w.dog]) assert(B.ANIMS[p.mode], "no animation for mode " + p.mode)
    }
    return { seen, dreams }
  }
  const lively = day(0.9, 8), lazy = day(0.05, 8)
  for (const m of ["zoom", "dog:zoom", "dog:chase", "flee"]) assert(lively.seen.has(m), "a lively day never showed " + m)
  for (const m of ["zoom", "dog:zoom", "dog:chase", "flee"]) assert(!lazy.seen.has(m), "a lazy day showed " + m)
  assert(lazy.dreams > 0, "long naps bring dreams")
  {
    const w = mk(); w.step(1); settleDown(w)
    w.cat.mode = w.dog.mode = "idle"; w.cat.calm = w.dog.calm = 0
    const always = () => 0.5
    B.startle(w.cat, w.pb("cat"), always); B.startle(w.dog, w.pb("dog"), always)
    assert.strictEqual(w.cat.mode, "hop"); assert.strictEqual(w.dog.mode, "bark")
    w.step(20); assert.strictEqual(w.cat.mode, "scurry", "hop, then scurry off")
    w.cat.mode = "idle"; B.startle(w.cat, w.pb("cat"), always)
    assert.strictEqual(w.cat.mode, "idle", "not twice within minutes")
  }
}
// ---------- Each keeps its own hours: no walking off or back in as a pair ----------
{
  const floors = { cat: 989, dog: 959 }, sizes = { cat: 96, dog: 128 }
  const cat = B.create(600, floors.cat), dog = B.create(1200, floors.dog)
  const pb = species => ({
    w: 1920 - sizes[species], floor: floors[species], ground: 1079, size: sizes[species], ballSize: 36, ledges: [],
    species, friend: species === "cat" ? dog : cat, friendSize: sizes[species === "cat" ? "dog" : "cat"], energy: 0.3
  })
  const out = { cat: [], dog: [] }, back = { cat: [], dog: [] }, was = { cat: "", dog: "" }
  for (let i = 1; i < 30 * 3600 * 24; i++) {
    // Away from the desk for four minutes, every quarter of an hour.
    if (i % (30 * 900) === 0) { B.settle(cat); B.settle(dog) }
    if (i % (30 * 900) === 30 * 240) { B.welcome(cat, pb("cat"), rand, 500); B.welcome(dog, pb("dog"), rand, 500) }
    B.tick(cat, 1 / 30, pb("cat"), rand); B.tick(dog, 1 / 30, pb("dog"), rand)
    for (const [k, p] of [["cat", cat], ["dog", dog]]) {
      if (p.mode === "leave" && was[k] !== "leave") out[k].push(i / 30)
      if (p.mode === "enter" && was[k] !== "enter") back[k].push(i / 30)
      was[k] = p.mode
    }
  }
  const paired = t => t.cat.filter(a => t.dog.some(b => Math.abs(a - b) < 30)).length
  assert(out.cat.length > 40 && out.dog.length > 40, "both still go out regularly")
  assert(paired(out) <= 2, "left together " + paired(out) + " times of " + out.cat.length)
  assert(paired(back) <= out.cat.length * 0.15, "came back together " + paired(back) + " times of " + back.cat.length)
}
// ---------- Bringing the toy unasked: the dog four times a day, the cat once, at random moments ----------
{
  const times = (day, species) => B.offerTimes(day, species)
  for (let day = 739000; day < 739030; day++) {
    const d = times(day, "dog"), c = times(day, "cat")
    assert(d.length === 4 && c.length === 1)
    for (const t of d.concat(c)) assert(t >= 9 && t <= 21, "outside the day: " + t)
    for (let i = 1; i < 4; i++) assert(d[i] > d[i - 1], "spread over the day")
    assert.strictEqual(String(times(day, "dog")), String(d), "the same all day")
  }
  assert.notStrictEqual(String(times(739000, "dog")), String(times(739001, "dog")), "different every day")
  const firsts = new Set(Array.from({ length: 30 }, (_, i) => Math.floor(times(739000 + i, "cat")[0])))
  assert(firsts.size >= 6, "the cat's moment moves around the day: " + [...firsts])

  // A whole day, both very lazy: he still comes four times and she once.
  const floors = { cat: 989, dog: 959 }, sizes = { cat: 96, dog: 128 }
  const cat = B.create(600, floors.cat), dog = B.create(1200, floors.dog)
  const count = { cat: 0, dog: 0 }, had = { cat: false, dog: false }
  for (let i = 0; i < 30 * 3600 * 24; i++) {
    const hour = i / 30 / 3600
    for (const [k, p, o] of [["cat", cat, dog], ["dog", dog, cat]]) {
      B.tick(p, 1 / 30, {
        w: 1920 - sizes[k], floor: floors[k], ground: 1079, size: sizes[k], ballSize: 36, ledges: [], species: k,
        friend: o, friendSize: sizes[k === "cat" ? "dog" : "cat"], energy: 0.04, day: 739000, hour
      }, rand)
      if (p.ball && !had[k]) {
        count[k]++
        assert(hour >= 9 && hour <= 21.8, k + " brought it at " + hour.toFixed(1))
      }
      had[k] = !!p.ball
    }
  }
  assert.strictEqual(count.dog, 4, "the dog brings his ball four times")
  assert.strictEqual(count.cat, 1, "the cat her yarn once")
}
// ---------- On top of a window: her floor for a while ----------
{
  const size = 96, floor = 989, ground = 1079
  const shelf = { id: "0xshelf", x: 300, y: 500, w: 800 }
  const world = { ledges: [shelf] }
  const pb = () => ({ w: 1920 - size, floor, ground, size, ballSize: 36, peek: 30, ledges: world.ledges, species: "cat", energy: 0.5 })
  const up = () => {
    const c = B.create(600, floor); c.stay = 1e9
    for (let i = 0; i < 30 * 3600 * 3 && c.perch === null; i++) { B.tick(c, 1 / 30, pb(), rand); c.stay = 1e9 }
    assert(c.perch === shelf.id, "she gets onto a window that has room above it")
    return c
  }
  const feet = shelf.y - (ground - floor)   // her frame's top when her feet are on the edge
  const c = up()
  assert.strictEqual(c.y, feet, "feet on the top edge")
  const seen = new Set()
  let ticks = 0
  while (c.perch !== null && ticks < 30 * 600) {
    B.tick(c, 1 / 30, pb(), rand); ticks++
    if (c.perch === null) break
    seen.add(c.mode)
    assert.strictEqual(c.y, feet, c.mode + " left the edge")
    assert(c.x >= shelf.x && c.x + size <= shelf.x + shelf.w, "walked off the end at " + c.x)
    assert(c.clipTop === -Infinity && c.clipBottom === Infinity, "in full view up there")
  }
  assert(ticks / 30 >= 35 && ticks / 30 < 400, "stays a while, then has had enough: " + (ticks / 30).toFixed(0) + "s")
  assert(seen.has("walk") && seen.size >= 3, "walks and rests up there: " + [...seen])
  assert.strictEqual(c.mode, "descend", "and climbs back down")
  for (let i = 0; i < 30 * 30 && c.mode === "descend"; i++) {
    B.tick(c, 1 / 30, pb(), rand)
    assert(c.clipTop === -Infinity, "in full view on the way down")
  }
  assert(c.y === floor && c.mode === "idle", "back on the floor")

  // The window goes, moves, or the workspace changes: she drops to the floor.
  for (const change of [() => { world.ledges = [] }, () => { world.ledges = [Object.assign({}, shelf, { y: 300 })] },
                        () => { world.ledges = [Object.assign({}, shelf, { x: 1200 })] }]) {
    world.ledges = [shelf]
    const d = up()
    change()
    B.tick(d, 1 / 30, pb(), rand)
    assert.strictEqual(d.mode, "fall", "drops when the window is no longer under her")
    for (let i = 0; i < 90 && d.mode === "fall"; i++) B.tick(d, 1 / 30, pb(), rand)
    assert(d.y === floor && d.perch === null, "and lands on the floor")
  }
  world.ledges = [shelf]

  // A toy, being picked up, or a shared screen bring her down too.
  const t = up(); B.spawnBall(t, pb()); B.tick(t, 1 / 30, pb(), rand)
  assert.strictEqual(t.mode, "fall", "jumps down for her yarn")
  const g = up(); B.grab(g); B.drop(g)
  for (let i = 0; i < 90 && g.mode === "fall"; i++) B.tick(g, 1 / 30, pb(), rand)
  assert(g.y === floor && g.perch === null, "dropped from the hand she lands on the floor, not back on the window")
  const h = up(); B.tick(h, 1 / 30, Object.assign(pb(), { hide: true }), rand)
  assert.strictEqual(h.mode, "fall", "comes down to hide")

  // A window right under the top of the screen has no room on it: she only ever peeks over that one.
  world.ledges = [{ id: "0xtop", x: 300, y: 38, w: 800 }]
  const p = B.create(600, floor)
  const modes = new Set()
  for (let i = 0; i < 30 * 3600 * 2; i++) { B.tick(p, 1 / 30, pb(), rand); p.stay = 1e9; modes.add(p.mode); assert(p.perch === null, "no room up there") }
  assert(modes.has("peek"), "still peeks over it")

  // The dog leaves a cat on a window alone.
  world.ledges = [shelf]
  const cat = up(), dog = B.create(700, 959)
  const db = { w: 1920 - 128, floor: 959, ground, size: 128, ballSize: 48, ledges: [shelf], species: "dog", friend: cat, friendSize: size, energy: 0.9 }
  for (let i = 0; i < 30 * 30; i++) {
    cat.perchFor = 1e9
    B.tick(cat, 1 / 30, Object.assign(pb(), { friend: dog, friendSize: 128 }), rand); B.tick(dog, 1 / 30, db, rand); dog.stay = 1e9
    assert(!dog.visiting && dog.mode !== "chase", "no visits or chases while she is up")
    assert(cat.perch !== null && cat.mode !== "flee", "she stays put")
  }
}
// ---------- Holding the toy up high for five seconds sets off the zoomies ----------
for (const species of ["cat", "dog"]) {
  const pb = { w: 1824, floor: 989, ground: 1079, size: 96, ballSize: 36, ledges: [], species, energy: 0.04 }
  const p = B.create(600, pb.floor); p.stay = 1e9
  B.tick(p, 1 / 30, pb, rand)
  B.spawnBall(p, pb, rand)
  const hold = (y, seconds) => { for (let i = 0; i < 30 * seconds; i++) { p.ball.held = true; p.ball.x = 900; p.ball.y = y; B.tick(p, 1 / 30, pb, rand) } }
  hold(700, 8)
  assert.notStrictEqual(p.mode, "zoom", species + ": held low, nothing happens")
  hold(100, 4.5)
  assert.notStrictEqual(p.mode, "zoom", species + ": not before five seconds")
  hold(100, 1)
  assert.strictEqual(p.mode, "zoom", species + ": five seconds up high and off it goes, lazy or not")
  for (let i = 0; i < 30 * 60; i++) {
    p.ball.held = true; p.ball.x = 900; p.ball.y = 100
    B.tick(p, 1 / 30, pb, rand)
  }
  assert(p.ball, "a toy in the hand doesn't run out, however long it is held")
  assert(p.mode !== "zoom", "it ends")
  assert.strictEqual(p.ball.teased, true, "once per hold")
  p.ball.held = false; B.tick(p, 1 / 30, pb, rand)
  hold(100, 5.2)
  assert.strictEqual(p.mode, "zoom", species + ": letting go and holding it up again works again")
}
// ---------- Where features meet ----------
{
  const floors = { cat: 989, dog: 959 }, sizes = { cat: 96, dog: 128 }
  const pair = () => {
    const cat = B.create(600, floors.cat), dog = B.create(1200, floors.dog)
    const pb = (k, extra) => Object.assign({
      w: 1920 - sizes[k], floor: floors[k], ground: 1079, size: sizes[k], ballSize: 36, peek: 30, ledges: [], species: k,
      friend: k === "cat" ? dog : cat, friendSize: sizes[k === "cat" ? "dog" : "cat"], energy: 0.5
    }, extra)
    return { cat, dog, pb }
  }

  // Joining a pet that naps because nobody is at the desk: both wake when someone is back.
  {
    const { cat, dog, pb } = pair()
    B.tick(cat, 1 / 30, pb("cat"), rand); B.tick(dog, 1 / 30, pb("dog"), rand)
    cat.stay = dog.stay = 1e9
    B.settle(dog)
    cat.mode = "idle"; B.visit(cat, dog, pb("cat"))
    for (let i = 0; i < 30 * 60 && cat.mode !== "sleep"; i++) { B.tick(cat, 1 / 30, pb("cat"), rand); B.tick(dog, 1 / 30, pb("dog"), rand) }
    assert(cat.mode === "sleep" && cat.settled, "the visitor naps on the sleeper's terms")
    const usual = () => 0.5
    B.welcome(cat, pb("cat"), usual, 500); B.welcome(dog, pb("dog"), usual, 500)
    assert(cat.mode !== "sleep" && dog.mode !== "sleep", "and both wake: " + cat.mode + " " + dog.mode)
    assert(!cat.settled && !dog.settled)
  }

  // A window hanging off the screen edge: no walking on the spot for a place she can't reach.
  {
    const { cat, pb } = pair()
    const off = { ledges: [{ id: "0xoff", x: -700, y: 500, w: 760 }], friend: null }
    let walking = 0, longest = 0
    for (let i = 0; i < 30 * 3600 * 3; i++) {
      B.tick(cat, 1 / 30, pb("cat", off), rand); cat.stay = 1e9
      walking = cat.mode === "walk" ? walking + 1 : 0
      longest = Math.max(longest, walking)
    }
    assert(longest / 30 < 60, "longest walk " + (longest / 30).toFixed(0) + "s")
  }

  // A screen share brings her down mid-climb.
  {
    const { cat, pb } = pair()
    const win = { ledges: [{ id: "0xw", x: 300, y: 38, w: 800 }], friend: null }
    for (let i = 0; i < 30 * 3600 * 3 && cat.mode !== "climb"; i++) { B.tick(cat, 1 / 30, pb("cat", win), rand); cat.stay = 1e9 }
    assert.strictEqual(cat.mode, "climb")
    B.tick(cat, 1 / 30, pb("cat", Object.assign({ hide: true }, win)), rand)
    assert.strictEqual(cat.mode, "fall", "drops off the window to get out of sight")
  }

  // A ball brought unasked and then taken from his mouth doesn't make the next plain fetch end in a nap.
  {
    const { dog, pb } = pair()
    const alone = { friend: null }
    B.tick(dog, 1 / 30, pb("dog", alone), rand); dog.stay = 1e9
    dog.mode = "idle"; B.offer(dog, pb("dog", alone), rand)
    assert(dog.ball.offered && dog.mode === "carry")
    dog.ball.held = true; B.tick(dog, 1 / 30, pb("dog", alone), rand); dog.ball = null
    B.spawnBall(dog, pb("dog", alone), rand)
    assert(!dog.ball.offered, "a fresh ball is a plain one")
  }
}
// ---------- Ticked only as fast as needed: the same life at every rate ----------
{
  const pb = { w: 1824, floor: 989, ground: 1079, size: 96, ballSize: 36, ledges: [], species: "cat", energy: 0.5 }
  const p = B.create(600, pb.floor)
  B.tick(p, 1 / 30, pb, rand)
  p.mode = "sleep"; assert.strictEqual(B.tickInterval(p.mode, B.toyInPlay(p)), 1000, "asleep: once a second")
  p.mode = "sit"; assert.strictEqual(B.tickInterval(p.mode, B.toyInPlay(p)), 250, "holding still")
  p.mode = "walk"; assert.strictEqual(B.tickInterval(p.mode, B.toyInPlay(p)), 50, "strolling")
  p.mode = "run"; assert.strictEqual(B.tickInterval(p.mode, B.toyInPlay(p)), 33, "at full rate while running")
  p.mode = "away"; assert(B.tickInterval(p.mode, B.toyInPlay(p)) === 1000 && B.gone(p), "off screen with nothing left behind: gone")
  p.ball = { held: false, carried: false, vx: 0, vy: 0 }; assert(!B.gone(p), "her yarn still lies there")
  p.ball.vx = 200; assert.strictEqual(B.tickInterval(p.mode, B.toyInPlay(p)), 33, "a rolling toy needs watching")
  p.mode = "sit"; p.ball = { held: true, carried: false, vx: 0, vy: 0 }; assert.strictEqual(B.tickInterval(p.mode, B.toyInPlay(p)), 33, "so does one in the hand")

  // A day ticked the way the window does it (from 30 times a second down to once) comes out like one ticked evenly.
  for (const species of ["cat", "dog"]) {
    const b = Object.assign({}, pb, { species, floor: 989 }), q = B.create(600, b.floor)
    let t = 0, away = 0, asleep = 0, here = 0, ticks = 0
    while (t < 3600 * 24) {
      const dt = B.tickInterval(q.mode, B.toyInPlay(q)) / 1000
      B.tick(q, dt, b, rand)
      t += dt; ticks++
      assert(Number.isFinite(q.x) && Number.isFinite(q.y), "lost her place")
      assert(B.OFFSCREEN[q.mode] || (q.x >= 0 && q.x <= b.w), q.mode + " off screen at " + q.x)
      if (q.mode === "away") away += dt
      else if (!B.OFFSCREEN[q.mode]) { here += dt; if (q.mode === "sleep") asleep += dt }
    }
    const want = species === "cat" ? 0.5 : 0.2
    assert(Math.abs(away / t - want) < 0.07, species + " away share at mixed rates: " + (away / t).toFixed(2))
    assert(asleep / here > 0.3 && asleep / here < 0.5, species + " asleep at mixed rates: " + (asleep / here).toFixed(2))
    assert(ticks < 3600 * 24 * 30 * 0.4, "far fewer ticks than 30 a second all day: " + ticks)
  }
}
// ---------- Care reminders with a dog, and while a pet is elsewhere ----------
{
  const pb = (species, extra) => Object.assign({ w: 1824, floor: 989, ground: 1079, size: 96, ballSize: 36, peek: 30, ledges: [], species, energy: 0.5 }, extra)
  // The dog asks, is served, and eats or drinks like the cat; a break throws his ball.
  for (const [kind, served] of [["water", "drink"], ["food", "eat"]]) {
    const d = B.create(600, 989); B.tick(d, 1 / 30, pb("dog"), rand); d.stay = 1e9; d.mode = "idle"
    B.want(d, kind); assert.strictEqual(d.mode, "ask")
    B.pet(d, pb("dog"), rand); assert.strictEqual(d.mode, served)
    assert(B.ANIMS[served].row < 20, "the care poses are on rows both species have")
  }
  const br = B.create(600, 989); B.tick(br, 1 / 30, pb("dog"), rand); br.mode = "idle"
  B.want(br, "break"); B.pet(br, pb("dog"), rand)
  assert(br.ball && !br.want, "a break is his ball")

  // Off screen when the reminder comes: she comes straight back to ask.
  const c = B.create(600, 989); B.tick(c, 1 / 30, pb("cat"), rand)
  c.mode = "away"; c.x = -96; c.t = 0; c.until = 600; c.stay = 1e9
  B.want(c, "water")
  let asked = false
  for (let i = 0; i < 30 * 60 && !asked; i++) { B.tick(c, 1 / 30, pb("cat"), rand); asked = c.mode === "ask" }
  assert(asked && c.x >= 0 && c.x <= 1824, "back on screen and asking: " + c.mode + " at " + c.x)
  B.pet(c, pb("cat"), rand); assert.strictEqual(c.mode, "drink")

  // While asking she doesn't wander off, however long it takes.
  const w = B.create(600, 989); B.tick(w, 1 / 30, pb("cat"), rand); w.mode = "idle"; w.stay = 0
  B.want(w, "food")
  for (let i = 0; i < 30 * 900; i++) { B.tick(w, 1 / 30, pb("cat"), rand); assert(!B.OFFSCREEN[w.mode], "left while asking") }
  assert(w.want === "food")

  // A shared screen still sends an asking pet off, and she can't be served out there.
  const h = B.create(600, 989); B.tick(h, 1 / 30, pb("cat"), rand); h.mode = "idle"
  B.want(h, "water")
  for (let i = 0; i < 30 * 30; i++) B.tick(h, 1 / 30, pb("cat", { hide: true }), rand)
  assert.strictEqual(h.mode, "away")
  B.pet(h, pb("cat"), rand); assert(h.want === "water" && h.mode === "away", "no serving off screen")
}
// ---------- A window right under the bar: the small cat keeps low on it ----------
{
  const ground = 1079, roof = { id: "0xroof", x: 10, y: 36, w: 1900 }
  const pb = size => ({ w: 1920 - size, floor: ground - size + size / 16, ground, size, ballSize: size * 0.375, peek: size * 10 / 32,
                        ledges: [roof], species: "cat", energy: 0.5 })
  const small = B.create(600, pb(64).floor); small.stay = 1e9
  for (let i = 0; i < 30 * 3600 * 3 && small.perch === null; i++) { B.tick(small, 1 / 30, pb(64), rand); small.stay = 1e9 }
  assert(small.perch === roof.id && small.low, "the small cat gets onto a window under the bar")
  assert.strictEqual(small.y, roof.y - 60, "feet on its top edge, her frame reaching past the top of the screen")
  const seen = new Set()
  let ticks = 0
  while (small.perch !== null && ticks < 30 * 600) {
    B.tick(small, 1 / 30, pb(64), rand); ticks++
    if (small.perch === null) break
    seen.add(small.mode)
    assert(B.LOW[small.mode], "upright under the bar: " + small.mode)
    assert(small.x >= roof.x && small.x + 64 <= roof.x + roof.w)
  }
  assert(seen.has("prowl") && seen.has("lurk"), "prowls and lurks up there: " + [...seen])
  assert.strictEqual(small.mode, "descend", "and climbs back down")

  // A click up there shoos her off: always down the front of the window with her claws out.
  const again = () => { const c = B.create(600, pb(64).floor); for (let i = 0; i < 30 * 3600 * 3 && c.perch === null; i++) { B.tick(c, 1 / 30, pb(64), rand); c.stay = 1e9 } return c }
  for (let n = 0; n < 5; n++) {
    const p = again(); p.petT = 9; B.pet(p, pb(64), rand)
    assert(p.mode === "claw" && p.perch === null && p.mark, "a click up there sends her sliding down, every time")
    for (let i = 0; i < 30 * 10 && p.mode === "claw"; i++) B.tick(p, 1 / 30, pb(64), rand)
    assert(p.y === pb(64).floor && p.mode === "idle", "down to the floor, not dropped: " + p.mode)
    assert(p.mark && p.mark.pts.length > 10, "leaving her scratches")
  }
  const w = again(); B.want(w, "water")
  let asked = false
  for (let i = 0; i < 30 * 60 && !asked; i++) { B.tick(w, 1 / 30, pb(64), rand); asked = w.mode === "ask" }
  assert(asked && w.y === pb(64).floor, "comes down to ask")

  // A medium cat doesn't fit under the bar: she only peeks over that window.
  const medium = B.create(600, pb(96).floor)
  for (let i = 0; i < 30 * 3600 * 2; i++) { B.tick(medium, 1 / 30, pb(96), rand); medium.stay = 1e9; assert(medium.perch === null, "no room for a medium cat") }
}
// ---------- Sliding down a window with her claws out, leaving scratches ----------
{
  const size = 96, floor = 989, ground = 1079
  const shelf = { id: "0xshelf", x: 300, y: 500, w: 800 }
  const pb = () => ({ w: 1920 - size, floor, ground, size, ballSize: 36, peek: 30, ledges: [shelf], species: "cat", energy: 0.5 })
  const c = B.create(600, floor)
  let downs = 0, slides = 0, was = "", marksSeen = 0, longest = 0, since = 0, drifted = 0
  for (let i = 0; i < 30 * 3600 * 40; i++) {
    B.tick(c, 1 / 30, pb(), rand); c.stay = 1e9
    if ((c.mode === "descend" || c.mode === "claw") && was !== c.mode) { downs++; if (c.mode === "claw") slides++ }
    if (c.mode === "claw") {
      assert(c.mark && c.mark.id === shelf.id && c.mark.top === shelf.y, "scratches start at the window's top edge")
      assert(c.mark.bottom >= c.mark.top && c.mark.bottom <= ground, "and run down to her paws")
      assert(c.clipBottom === Infinity)
      assert(c.x >= shelf.x && c.x + size <= shelf.x + shelf.w, "slid off the side of the window")
      drifted = Math.max(drifted, Math.abs(c.x - c.mark.x))
      const pts = c.mark.pts
      if (pts.length > 1) assert(pts[pts.length - 1][1] > pts[pts.length - 2][1], "the scratches only ever run down")
    }
    if (c.mark) marksSeen++
    since = c.mark && c.mode !== "claw" ? since + 1 : 0
    longest = Math.max(longest, since)
    was = c.mode
  }
  assert(downs > 40, "came down often enough to judge: " + downs)
  assert(slides / downs > 0.04 && slides / downs < 0.18, "about one way down in ten is a slide: " + slides + " of " + downs)
  assert(drifted > size * 0.15 && drifted < size * 0.3, "she drifts sideways on the way: " + drifted.toFixed(0) + "px")
  assert(longest / 30 > 4 && longest / 30 < 6, "the scratches fade a few seconds after she lands: " + (longest / 30).toFixed(1))
}
// ---------- The tour: every step can be started and runs through, for each pet and the pair ----------
{
  const floors = { cat: 989, dog: 959 }, sizes = { cat: 96, dog: 128 }
  const shelf = { id: "0xshelf", x: 300, y: 500, w: 800 }
  const cat = B.create(600, floors.cat), dog = B.create(1200, floors.dog)
  const pb = k => ({ w: 1920 - sizes[k], floor: floors[k], ground: 1079, size: sizes[k], ballSize: 36, peek: 30, ledges: [shelf], species: k,
                     friend: k === "cat" ? dog : cat, friendSize: sizes[k === "cat" ? "dog" : "cat"], energy: 0.5 })
  const both = () => { B.tick(cat, 1 / 30, pb("cat"), rand); B.tick(dog, 1 / 30, pb("dog"), rand)
    for (const p of [cat, dog]) assert(B.ANIMS[p.mode], "no animation for mode " + p.mode) }
  const play = (step, s, k, f) => {
    // The way Service.qml runs it.
    for (let i = 0; i < 30 * 120; i++) {
      B.freeUp(s, pb(k), rand); if (f) B.freeUp(f, pb("cat"), rand)
      if (B.free(s) && (!f || B.free(f))) break
      both()
    }
    assert(B.free(s), step.name + ": never got free, stuck in " + s.mode)
    s.ball = null; s.staged = null; s.want = null
    if (step.start(s, pb(k), rand, f) === false) return "skipped"
    const seen = new Set()
    let t = 0
    for (; t < step.seconds; t += 1 / 30) {
      both(); s.stay = 1e9; if (f) f.stay = 1e9
      seen.add(s.mode)
      if (t > 1 && step.done && step.done(s)) break
    }
    return { seen, t }
  }
  const expect = { "Zoomies": "zoom", "Fetch": "carry", "Sniffing": "sniff", "Belly rub": "belly", "Drinking": "drink", "Eating": "eat",
                   "Asking for water": "ask", "Up a window to peek over it": "peek", "Wandering off and back": "away",
                   "Sleep, with a dream": "sleep", "One pet too many: a swat": "bat", "Chasing his tail": "spin" }
  for (const [k, s] of [["cat", cat], ["dog", dog]]) {
    for (const step of B.tour(k)) {
      const r = play(step, s, k, null)
      assert(r !== "skipped", step.name + " was skipped though there is a window")
      if (expect[step.name]) assert(r.seen.has(expect[step.name]), k + " " + step.name + " never showed " + expect[step.name] + ": " + [...r.seen])
      if (step.done) assert(r.t < step.seconds - 0.5, k + " " + step.name + " ran into its time limit")
    }
  }
  const claws = B.tour("cat").find(x => x.name.indexOf("claws") > 0)
  assert(play(claws, cat, "cat", null).seen.has("claw"), "the claw slide is shown")
  for (const step of B.tourTogether()) {
    const r = play(step, dog, "dog", cat)
    if (step.done) assert(r.t < step.seconds - 0.5, step.name + " ran into its time limit, dog in " + dog.mode + ", cat in " + cat.mode)
  }
  B.tourEnd(cat, rand); B.tourEnd(dog, rand)
  assert(cat.staged === null && cat.stay < 1e6, "back to their own lives afterwards")
}
// ---------- Wandering can be switched off ----------
for (const species of ["cat", "dog"]) {
  const pb = extra => Object.assign({ w: 1824, floor: 989, ground: 1079, size: 96, ballSize: 36, ledges: [], species, energy: 0.5 }, extra)
  const home = B.create(600, 989)
  for (let i = 0; i < 30 * 3600 * 6; i++) {
    B.tick(home, 1 / 30, pb({ wander: false }), rand)
    assert(!B.OFFSCREEN[home.mode], species + " left though wandering is off")
  }
  // Switched off while she is out, or on her way: she comes back, or turns round.
  const out = B.create(600, 989)
  for (let i = 0; i < 30 * 3600 * 2 && out.mode !== "away"; i++) B.tick(out, 1 / 30, pb(), rand)
  assert.strictEqual(out.mode, "away")
  for (let i = 0; i < 30 * 90 && B.OFFSCREEN[out.mode]; i++) B.tick(out, 1 / 30, pb({ wander: false }), rand)
  assert(!B.OFFSCREEN[out.mode] && out.x >= 0 && out.x <= 1824, species + " came back when wandering was switched off")
  const going = B.create(600, 989)
  for (let i = 0; i < 30 * 3600 * 2 && going.mode !== "leave"; i++) B.tick(going, 1 / 30, pb(), rand)
  B.tick(going, 1 / 30, pb({ wander: false }), rand)
  assert.strictEqual(going.mode, "idle", "turns round on the way out")
  // A shared screen still sends her off.
  for (let i = 0; i < 30 * 30; i++) B.tick(going, 1 / 30, pb({ wander: false, hide: true }), rand)
  assert.strictEqual(going.mode, "away", "camera shy is not wandering")
}
// ---------- Whoever came last stands in front ----------
{
  const floors = { cat: 989, dog: 959 }, sizes = { cat: 96, dog: 128 }
  const cat = B.create(600, floors.cat), dog = B.create(1200, floors.dog)
  const pb = k => ({ w: 1920 - sizes[k], floor: floors[k], ground: 1079, size: sizes[k], ballSize: 36, ledges: [], species: k,
                     friend: k === "cat" ? dog : cat, friendSize: sizes[k === "cat" ? "dog" : "cat"], energy: 0.5 })
  assert.strictEqual(cat.arrived, dog.arrived, "nobody has come anywhere yet")
  B.visit(cat, dog, pb("cat"))
  assert(cat.arrived > dog.arrived, "the cat walks over: she is in front")
  B.visit(dog, cat, pb("dog"))
  assert(dog.arrived > cat.arrived, "the dog walks over: now he is")
  cat.mode = "away"; cat.x = -96; B.comeBack(cat, pb("cat"), 0, 0.5)
  assert(cat.arrived > dog.arrived, "back on screen counts as arriving")
  // Over a day both get their turns in front.
  let catFront = 0, dogFront = 0
  for (let i = 0; i < 30 * 3600 * 12; i++) {
    B.tick(cat, 1 / 30, pb("cat"), rand); B.tick(dog, 1 / 30, pb("dog"), rand)
    if (cat.arrived > dog.arrived) catFront++; else dogFront++
  }
  assert(catFront > 0 && dogFront > 0 && Math.min(catFront, dogFront) / (catFront + dogFront) > 0.15,
         "both spend a fair share in front: cat " + catFront + ", dog " + dogFront)
}
console.log("brain ok")
