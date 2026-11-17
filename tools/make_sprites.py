#!/usr/bin/env python3
"""Draws the pet sprite sheets (sprites/<species>-<coat>.png). Stdlib only.

Sheet: 32x32 frames, one row per animation, in the order of rows() below.
Brain.js ANIMS must match the row order and frame counts.
The shared poses below draw the cat and the plain dog (the chocolate coat). The other dog coats
name a breed (BREEDS) and are drawn by the dog poses further down, in the same style, with their
own head, ears, tail, markings and build. SPECIES lists each species' coats; a coat overrides
PALETTE colours and, under "style", STYLE entries.
Add a coat here and to the species' coats in Panel.qml.
"""
import math, os, struct, zlib

S = 32
PALETTE = {
    "O": (150, 88, 42),    # outline (dark shade of the fur, not black)
    "F": (245, 170, 80),   # fur
    "S": (214, 128, 52),   # stripes / far legs
    "B": (255, 246, 232),  # belly / muzzle / paws
    "E": (62, 42, 42),     # eyes
    "N": (245, 150, 160),  # nose, blush, inner ear
    "H": (229, 72, 77),    # heart
    "Z": (120, 150, 220),  # zzz
    "Y": (125, 175, 235),  # yarn
    "y": (80, 120, 200),   # yarn strands
    "L": (255, 255, 255),  # speech bubble
    "D": (58, 58, 78),     # speech bubble and bowl outline
    "W": (110, 185, 240),  # water
    "w": (200, 235, 255),  # water shine
    "K": (214, 74, 74),    # bowl
    "k": (150, 46, 52),    # bowl shade
    "C": (160, 100, 50),   # kibble
    "n": (40, 32, 36),     # dog nose
    "c": (214, 60, 70),    # dog collar
    "t": (250, 210, 80),   # collar tag
    "M": (40, 38, 46),     # dog markings: spots, saddle, mask
    "b": (220, 214, 204),  # dog light fur on the far side
}

# How the species being drawn differs from the shared poses; main() sets it per sheet.
STYLE = {}
CAT_STYLE = {"stripes": True, "face": "cat", "toy": "yarn"}
DOG_STYLE = {"stripes": False, "face": "dog", "toy": "ball"}

CAT_COATS = {
    "orange": {},
    "grey":   {"O": (72, 74, 88), "F": (165, 170, 182), "S": (118, 122, 138), "B": (242, 242, 247)},
    "black":  {"O": (16, 14, 22), "F": (62, 60, 72), "S": (42, 40, 52), "B": (240, 240, 246),
               "E": (215, 225, 95)},
    "white":  {"O": (150, 150, 168), "F": (252, 252, 254), "S": (222, 224, 234), "B": (255, 255, 255)},
    "cream":  {"O": (172, 122, 80), "F": (250, 222, 172), "S": (236, 196, 140), "B": (255, 249, 238)},
}

# For a dog S is the shade of the fur (ears, far legs), b the shade of B, M its markings,
# Y/y the tennis ball.
DOG_BALL = {"Y": (200, 222, 70), "y": (250, 250, 240)}
DOG_COATS = {
    "golden":    {"O": (122, 72, 30), "F": (226, 168, 82), "S": (184, 118, 46), "B": (246, 214, 150),
                  "b": (214, 172, 104), "c": (70, 120, 210), "style": {"breed": "golden"}},
    "shiba":     {"O": (128, 62, 28), "F": (222, 126, 54), "S": (182, 92, 38), "B": (255, 240, 214),
                  "b": (226, 200, 166), "style": {"breed": "shiba"}},
    "husky":     {"O": (44, 46, 58), "F": (138, 144, 160), "S": (100, 106, 122), "B": (248, 248, 252),
                  "b": (200, 202, 212), "M": (70, 74, 90), "E": (90, 170, 235), "style": {"breed": "husky"}},
    "dalmatian": {"O": (110, 110, 126), "F": (250, 250, 252), "S": (206, 206, 216), "B": (255, 255, 255),
                  "b": (206, 206, 216), "M": (34, 32, 40), "style": {"breed": "dalmatian"}},
    "chocolate": {"O": (52, 30, 20), "F": (118, 72, 46), "S": (86, 48, 30), "B": (176, 128, 92),
                  "E": (24, 14, 12), "n": (24, 14, 12), "c": (60, 170, 170)},
}

SPECIES = {
    "cat": {"style": CAT_STYLE, "palette": {}, "coats": CAT_COATS},
    "dog": {"style": DOG_STYLE, "palette": DOG_BALL, "coats": DOG_COATS},
}


def grid():
    return [[None] * S for _ in range(S)]


def px(g, x, y, c):
    if 0 <= x < S and 0 <= y < S:
        g[y][x] = c


def rect(g, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px(g, x, y, c)


def ellipse(g, cx, cy, rx, ry, c):
    for y in range(S):
        for x in range(S):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                g[y][x] = c


def outline(g):
    edge = [(x, y) for y in range(S) for x in range(S) if g[y][x] is None and any(
        0 <= x + dx < S and 0 <= y + dy < S and g[y + dy][x + dx] is not None
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for x, y in edge:
        g[y][x] = "O"
    return g


def over(base, top):
    """Paint an (outlined) layer on top of another, so parts keep their own outline."""
    for y in range(S):
        for x in range(S):
            if top[y][x]:
                base[y][x] = top[y][x]
    return base


def stamp(g, x0, y0, rows, c):
    for dy, row in enumerate(rows):
        for dx, ch in enumerate(row):
            if ch == "x":
                px(g, x0 + dx, y0 + dy, c)


def tail(g, points, wag=0):
    """Tail through the given points, base first. A cat's is long, thin and striped; the plain
    dog's is a short whip, wagging by `wag`."""
    if STYLE["face"] == "cat":
        for i, (x, y) in enumerate(points):
            rect(g, x, y, x + 1, y, "S" if i % 3 == 2 else "F")
        return
    # Drawn as one tapering piece from the base, in the direction the cat's tail sets off in:
    # thick where it joins the body, thin at the tip, the wag growing towards the tip.
    (bx, by), (ex, ey) = points[0], points[min(4, len(points) - 1)]
    dx, dy = ex - bx, ey - by
    n = max(abs(dx), abs(dy)) or 1
    ux, uy = dx / n, dy / n
    upright = abs(uy) >= abs(ux)
    widths = (2, 2, 2, 1, 1, 1)
    for i, w in enumerate(widths):
        off = round(2 * wag * i / (len(widths) - 1))
        x, y = round(bx + i * ux), round(by + i * uy)
        if upright:
            x += off
            rect(g, x, y, x + w - 1, y, "F")
        else:
            y -= off
            rect(g, x, y, x, y + w - 1, "F")


def chin_collar(g, cx, chin, half=3):
    """A dog's collar: a strap along the jaw line with the tag hanging below, chin being the row
    of the jaw's outline. Seen from the front a collar sits high on the neck right under the jaw,
    no wider than the muzzle; drawn across the shoulders it reads as a scarf. Only the poses that
    face you sitting up or hanging show it; walking, the head hides the neck."""
    if STYLE["face"] != "dog":
        return g
    for x in range(cx - half, cx + half + 1):
        for y in range(chin - 3, chin + 1):              # the jaw's outline in this column
            if g[y][x] == "O":
                g[y][x] = "c"
                break
    if chin + 1 <= 29:
        px(g, cx, chin + 1, "t")
    return g


def ears(g, cx, cy, inner):
    """Ears on a head at (cx, cy): a cat's wide triangles, or the plain dog's flaps down the sides."""
    for s in (-1, 1):
        if STYLE["face"] == "dog":
            ox = cx + s * 7
            rect(g, min(ox - s, ox - 3 * s), cy - 5, max(ox - s, ox - 3 * s), cy - 5, "S")
            rect(g, min(ox, ox - s), cy - 4, max(ox, ox - s), cy - 4, "S")
            rect(g, min(ox, ox + s), cy - 3, max(ox, ox + s), cy + 3, "S")
        else:
            ox = cx + s * 6                 # sharp triangles, tip at the outer edge
            for i in range(4):
                rect(g, min(ox, ox - s * i), cy - 8 + i, max(ox, ox - s * i), cy - 8 + i, "F")
            px(g, ox - s, cy - 6, inner)
            if inner == "N":
                rect(g, min(ox - s, ox - 2 * s), cy - 5, max(ox - s, ox - 2 * s), cy - 5, "N")


def head(cx, cy, eye="open"):
    """Small front-facing head, as its own outlined layer."""
    g = grid()
    ellipse(g, cx, cy, 7, 5.5, "F")
    dog = STYLE["face"] == "dog"
    ears(g, cx, cy, "S" if dog else "N")
    if STYLE["stripes"]:
        for dx, n in ((-2, 2), (0, 3), (2, 2)):  # forehead stripes
            rect(g, cx + dx, cy - 5, cx + dx, cy - 6 + n, "S")
    if dog:
        ellipse(g, cx, cy + 3, 4, 2.5, "B")     # broad muzzle
        rect(g, cx - 1, cy + 1, cx + 1, cy + 1, "n")
        px(g, cx, cy + 2, "n")
        if eye in ("open", "happy", "wide", "left", "right"):
            rect(g, cx, cy + 3, cx, cy + 4, "N")   # tongue out
    else:
        ellipse(g, cx, cy + 3, 3, 2, "B")       # muzzle
        px(g, cx, cy + 1, "N")
        px(g, cx, cy + 2, "O")
    for s in (-1, 1):
        ex = cx + s * 4
        if not dog:
            rect(g, min(ex, ex + s), cy + 3, max(ex, ex + s), cy + 3, "N")   # blush
        if eye == "open":
            rect(g, ex, cy, ex, cy + 1, "E")
        elif eye == "closed":
            rect(g, ex - 1, cy + 1, ex + 1, cy + 1, "E")
        elif eye == "happy":
            px(g, ex - 1, cy + 1, "E"); px(g, ex, cy, "E"); px(g, ex + 1, cy + 1, "E")
        elif eye == "wide":
            rect(g, min(ex, ex - s), cy, max(ex, ex - s), cy + 1, "E")
        elif eye == "up":
            rect(g, ex, cy - 1, ex, cy, "E")
        elif eye in ("left", "right"):
            d = -1 if eye == "left" else 1
            rect(g, ex + d, cy, ex + d, cy + 1, "E")
    return outline(g)


def stand(lift=(0, 0, 0, 0), bob=0, sway=0, eye="open", head_at=None):
    """lift = (back near, back far, front near, front far) in px."""
    g = grid()
    bn, bf, fn, ff = lift
    rect(g, 11 + (bf > 0), 24, 12 + (bf > 0), 28 - bf, "S")
    rect(g, 20 + (ff > 0), 24, 21 + (ff > 0), 28 - ff, "S")
    ellipse(g, 13, 21 + bob, 8, 5, "F")
    for y in range(24 + bob, S):
        for x in range(S):
            if g[y][x] == "F":
                g[y][x] = "B"
    tail(g, [(4, 19 + bob), (3, 18 + bob), (2, 17 + bob), (2, 16 + bob), (2, 15 + bob),
             (2 + sway, 14 + bob), (3 + sway, 13 + bob)], sway)
    for x, l in ((6 + (bn > 0), bn), (16 + (fn > 0), fn)):
        rect(g, x, 24, x + 2, 28 - l, "F")
        rect(g, x, 28 - l, x + 2, 28 - l, "B")
    hx, hy = head_at or (21, 14 + bob)
    return over(outline(g), head(hx, hy, eye))


def sit(flick=0, eye="open"):
    g = grid()
    tail(g, [(9, 27), (7, 27), (6, 26), (5, 25), (4, 24), (4, 23 - flick), (5, 22 - flick)], flick)
    ellipse(g, 16, 22.5, 6.5, 6, "F")
    ellipse(g, 16, 23, 3, 4, "B")
    rect(g, 12, 27, 14, 28, "B")
    rect(g, 18, 27, 20, 28, "B")
    return chin_collar(over(outline(g), head(16, 12, eye)), 16, 18)


def sleep(f):
    """Lying loaf: long rounded back, head resting at the front, tail up at the back."""
    g = grid()
    top = 17 - (f in (1, 2))          # breathing
    tail(g, [(3, top + 2), (2, top + 1), (2, top), (1, top - 1), (1, top - 2), (1, top - 3)])
    ellipse(g, 12, 24, 9.5, 24 - top, "F")
    rect(g, 3, 24, 21, 28, "F")
    for y in range(29, S):            # flat on the floor
        rect(g, 0, y, S - 1, y, None)
    rect(g, 5, 27, 19, 28, "B")
    g = over(outline(g), head(22, 23, "closed"))
    rect(g, 11, 26, 13, 26, "B")      # tucked front paw: a small bump on the belly line
    rect(g, 11, 25, 13, 25, "O")
    px(g, 10, 26, "O")
    px(g, 10, 27, "O")
    stamp(g, 25 + f, 7 - 2 * f, ("xxxx", "..x.", ".x..", "xxxx"), "Z")
    return g


def petted(f):
    g = sit(flick=f % 2, eye="happy")
    stamp(g, 27, 5 - f, (".x.x.", "xxxxx", ".xxx.", "..x.."), "H")
    return g


def dangle(f, eye="open"):
    g = grid()
    tail(g, [(10, 26), (9, 27), (8 + f, 28), (8 + f, 29)])
    ellipse(g, 16, 21, 5, 7, "F")
    ellipse(g, 16, 22, 2.5, 4.5, "B")
    rect(g, 12 - f, 26, 13 - f, 30, "F")   # legs
    rect(g, 19 + f, 26, 20 + f, 30, "F")
    rect(g, 9, 19 - f, 11, 20 - f, "F")    # arms
    rect(g, 21, 19 - f, 23, 20 - f, "F")
    return chin_collar(over(outline(g), head(16, 11, eye)), 16, 17)


def back_head(cx, cy):
    """Back of the head: ears and tabby stripes, no face."""
    g = grid()
    ellipse(g, cx, cy, 7, 5.5, "F")
    ears(g, cx, cy, "S")                    # back of the ear
    if STYLE["stripes"]:
        for dx, top, bot in ((-3, -4, 1), (0, -5, 4), (3, -4, 1)):
            rect(g, cx + dx, cy + top, cx + dx, cy + bot, "S")
    return outline(g)


def climb(f):
    """Climbing up the window, back to the viewer: paws reach up in turn, legs push, tail swings."""
    up = f % 2
    sway = (0, 1, 0, -1)[f]
    g = grid()
    ellipse(g, 16, 17, 6, 7, "F")
    if STYLE["stripes"]:
        for y, half in ((13, 3), (16, 4), (19, 4), (22, 3)):  # tabby bands across the back
            rect(g, 16 - half, y, 16 + half, y, "S")
    g = outline(g)
    for x, lift in ((10, 2 * up), (20, 2 - 2 * up)):      # back legs push in turn
        leg = grid()
        rect(leg, x, 21 - lift, x + 2, 27 - lift, "F")
        rect(leg, x, 27 - lift, x + 2, 27 - lift, "B")
        g = over(g, outline(leg))
    for side, top in ((-1, 2 + 4 * up), (1, 6 - 4 * up)):  # arms, one reaching higher
        arm = grid()
        ax = 16 + side * 9
        rect(arm, min(ax, ax + side), top, max(ax, ax + side), 13, "F")
        rect(arm, min(ax, 16 + side * 6), 12, max(ax, 16 + side * 6), 13, "F")   # shoulder
        rect(arm, min(ax, ax + side), top, max(ax, ax + side), top + 1, "B")
        g = over(g, outline(arm))
    t = grid()
    tail(t, [(16, 23), (16, 24), (17, 25), (17 + sway, 26), (18 + sway, 27), (18 + sway, 28),
             (19 + 2 * sway, 29), (19 + 2 * sway, 30)])
    g = over(g, outline(t))
    return over(g, back_head(16, 8))


PEEK_EDGE = 10   # rows of the peek frame above the window edge; Service.qml clips the rest


def peek(eye="open"):
    """Peeking over a window's top edge: ears, eyes and paws. Rows from PEEK_EDGE down are behind the window."""
    g = head(16, 8, eye)
    for x in (3, 26):                       # paws gripping the edge
        p = grid()
        rect(p, x, PEEK_EDGE - 2, x + 2, PEEK_EDGE + 1, "B")
        g = over(g, outline(p))
    for y in range(PEEK_EDGE, S):
        rect(g, 0, y, S - 1, y, None)
    return g


def hang(swing=0, eye="open"):
    """Hanging by the front paws: paws at the very top of the frame, body dangling."""
    g = grid()
    for x in (7, 24):                       # arms come up from behind the head
        rect(g, x, 3, x + 1, 12, "F")
        rect(g, x - 1 + (x > 16), 1, x + 1 + (x > 16), 2, "B")   # paws on the edge
    tail(g, [(10, 26), (9, 27), (8 + swing, 28), (8 + swing, 29)])
    ellipse(g, 16, 21, 5, 7, "F")
    ellipse(g, 16, 22, 2.5, 4.5, "B")
    rect(g, 12 + swing, 26, 13 + swing, 30, "F")
    rect(g, 19 + swing, 26, 20 + swing, 30, "F")
    return over(outline(g), head(16, 11, eye))


def crouch(wiggle=0):
    """Low hunting crouch, rear and tail wiggling, eyes locked on."""
    g = grid()
    tail(g, [(4, 22), (3, 21), (2, 20), (2 + wiggle, 19), (2 + wiggle, 18), (3 + wiggle, 17)])
    rect(g, 7 + wiggle, 26, 9 + wiggle, 28, "F")      # bent back leg
    rect(g, 11, 26, 12, 28, "S")
    rect(g, 20, 27, 21, 28, "S")
    ellipse(g, 13 + wiggle * 0.5, 24, 8, 3.5, "F")
    for y in range(26, S):
        for x in range(S):
            if g[y][x] == "F":
                g[y][x] = "B"
    rect(g, 17, 27, 19, 28, "B")                      # front paws flat
    return over(outline(g), head(22, 20, "wide"))


def pounce(f):
    """Airborne leap: stretched out, front paws reaching forward."""
    g = grid()
    tail(g, [(4, 17), (3, 16 + f), (2, 15 + f), (1, 15 + f), (0, 14 + f)])
    rect(g, 4, 22, 6, 23, "F")                        # back legs kicked back
    rect(g, 2, 23, 4, 24, "B")
    ellipse(g, 13, 19, 9, 4, "F")
    ellipse(g, 13, 21, 5, 1.5, "B")
    rect(g, 19, 22, 23, 23, "F")                      # front legs reaching
    rect(g, 23, 23 - f, 25, 24 - f, "B")
    return over(outline(g), head(22, 14, "wide"))


def paw(g, x0, y0, x1, y1):
    """A raised front leg on its own outlined layer, white toes at (x1, y1)."""
    p = grid()
    rect(p, x0, y0, x1, y1, "F")
    rect(p, x1 - 1, y1 - 1, x1, y1, "B")
    return over(g, outline(p))


def bat(f):
    """Standing, swatting forward with one front paw."""
    g = stand((0, 0, 4, 0), eye="wide")
    return paw(g, 24, 21, 28, 22) if f == 0 else paw(g, 24, 23, 28, 25)


def groom(f):
    """Sitting, licking a raised paw."""
    g = sit(eye="closed")
    g = paw(g, 18, 15 + f % 2, 20, 19)
    if f % 2:
        px(g, 17, 16, "N")                            # tongue
    return g


def stretch(f, eye="closed", wag=0):
    """Play-bow stretch after a nap: front down, rear up. Eyes open and wagging, it is a dog asking to play."""
    g = grid()
    up = f == 1
    tail(g, [(5, 16 - up), (4, 15 - up), (4, 14 - up), (4, 13 - up), (5, 12 - up)], wag)
    rect(g, 7, 20, 8, 28, "F")                        # back legs straight
    rect(g, 11, 20, 12, 28, "S")
    rect(g, 7, 28, 8, 28, "B")
    ellipse(g, 10, 19 - up, 5, 4, "F")
    ellipse(g, 17, 24, 7, 3, "F")
    rect(g, 17, 27, 28, 28, "F")                      # front legs stretched flat
    rect(g, 27, 27, 28, 28, "B")
    return over(outline(g), head(22, 22, eye))


def scratch(f):
    """Sitting, a hind leg up scratching behind the ear."""
    g = sit(eye="closed")
    leg = grid()
    top = 12 + f % 2
    rect(leg, 23, top, 24, 23, "F")
    rect(leg, 23, top, 24, top + 1, "B")
    return over(g, outline(leg))


def belly(f):
    """On his back for a belly rub: belly up, legs paddling in the air, a heart above."""
    g = grid()
    tail(g, [(4, 26), (3, 26), (2, 26), (1, 26), (0, 26)], f)
    ellipse(g, 13, 24, 9, 4, "F")
    ellipse(g, 13, 22.5, 6, 2, "B")
    for i, x in enumerate((7, 11, 15, 19)):
        top = 15 + 2 * ((i + f) % 2)
        rect(g, x, top, x + 1, 21, "F")
        rect(g, x, top, x + 1, top + 1, "B")
    for y in range(29, S):            # flat on the floor
        rect(g, 0, y, S - 1, y, None)
    g = over(outline(g), head(22, 22, "happy"))
    stamp(g, 26, 8 - f, (".x.x.", "xxxxx", ".xxx.", "..x.."), "H")
    return g


def sniff(f):
    """Walking with the nose along the ground."""
    lift = ((0, 2, 2, 0), (0, 0, 0, 0), (2, 0, 0, 2), (0, 0, 0, 0))[f]
    return stand(lift, sway=f % 2, eye="closed", head_at=(22, 20 + f % 2))


def bark(f):
    """Standing; on the bark the head snaps up, the mouth opens and two marks fly off."""
    if f == 0:
        return stand()
    g = stand(sway=1, eye="happy", head_at=(21, 13))
    rect(g, 20, 16, 22, 17, "E")
    px(g, 21, 17, "N")
    stamp(g, 24, 0, ("x..x..x", "x..x.x.", ".....x."), "Z")
    return g


def yawn(f):
    """Sitting with a big yawn."""
    g = sit(eye="closed")
    if f == 1:
        rect(g, 15, 14, 17, 16, "E")
        px(g, 16, 16, "N")
    else:
        rect(g, 15, 15, 17, 15, "E")
    return g


def yarn(f):
    """The toy in the top-left 12x12 of the frame: a ball of yarn, or a tennis ball with one seam; f rotates it."""
    g = grid()
    cos, sin = [(1, 0), (0.7, 0.7), (0, 1), (-0.7, 0.7)][f]
    if STYLE["toy"] == "ball":                        # smaller than yarn, resting on the cell's floor
        ellipse(g, 5.5, 6.5, 4, 4, "Y")
        for t in range(-4, 5):
            x, y = round(5.5 + t * cos), round(6.5 + t * sin)
            if g[y][x] == "Y":
                g[y][x] = "y"
        return outline(g)
    ellipse(g, 5.5, 5.5, 5, 5, "Y")
    for k in (-2, 0, 2):                              # three parallel strands
        for t in range(-5, 6):
            x, y = round(5.5 + t * cos - k * sin), round(5.5 + t * sin + k * cos)
            if g[y][x] == "Y":
                g[y][x] = "y"
    return outline(g)


def art(g, x0, y0, rows):
    """Multi-colour stamp: each character is a palette key, '.' is empty."""
    for dy, row in enumerate(rows):
        for dx, ch in enumerate(row):
            if ch != ".":
                px(g, x0 + dx, y0 + dy, ch)


def ask(f):
    """Sitting, looking up at you, meowing on the second frame."""
    g = sit(flick=f, eye="up")
    if f:
        rect(g, 16, 14, 16, 15, "O")
    return g


def bowl(food, f):
    """Bowl on the floor in front of her, rim at row 24."""
    g = grid()
    top = "CkCCkCCkCCkC" if food else ("WWwWWWWWWwWW" if f % 2 else "WWWWWwWWWWWw")
    art(g, 17, 24, ("k" + top + "k", "KKKKKKKKKKKKKK", ".KKKKKKKKKKKK.", "..kkkkkkkkkk.."))
    return outline_with(g, "D")


def dine(f, food):
    """Head down in the bowl: lapping water or munching kibble."""
    g = grid()
    tail(g, [(3, 22), (2, 21), (1, 20), (1, 19), (1 + f % 2, 18), (2 + f % 2, 17)])
    rect(g, 6, 26, 8, 28, "F")
    rect(g, 10, 26, 11, 28, "S")
    ellipse(g, 12, 23.5, 8, 4, "F")
    for y in range(26, S):
        for x in range(S):
            if g[y][x] == "F":
                g[y][x] = "B"
    g = over(outline(g), head(23, 21 + (f % 2 if food else 0), "closed"))
    if not food and f % 2:
        px(g, 23, 24, "N")            # tongue dipping in
    b = bowl(food, f)
    for y in range(S):                # the rim's top outline stays behind her face
        for x in range(S):
            if b[y][x] and not (b[y][x] == "D" and y < 24 and g[y][x]):
                g[y][x] = b[y][x]
    return g


def outline_with(g, c):
    g = outline(g)
    for y in range(S):
        for x in range(S):
            if g[y][x] == "O":
                g[y][x] = c
    return g


ICONS = {
    "water": ("...D...", "..DwD..", ".DWwWD.", "DWWwWWD", "DWWWWWD", "DWWWWWD", ".DWWWD.", "..DDD.."),
    "food":  (".C.C.C.C.", "CCCCCCCCC", "KKKKKKKKK", ".KKKKKKK.", "..kkkkk.."),
    "break": ("..yyy..", ".yYYYy.", "yYyYyYy", "yYYyYYy", "yYyYyYy", ".yYYYy.", "..yyy.."),
}


def bubble(kind):
    """Speech bubble in the top-left 16x14, tail at the bottom left pointing at her head."""
    g = grid()
    rect(g, 2, 1, 13, 9, "L")
    rect(g, 1, 2, 14, 8, "L")
    for x, y in ((3, 10), (2, 11), (2, 10)):
        px(g, x, y, "L")
    g = outline_with(g, "D")
    icon = ICONS[kind]
    art(g, 8 - (len(icon[0]) + 1) // 2, 5 - len(icon) // 2, icon)
    return g


# The bubbles are the same picture for every pet: drawn in shared palette keys, the "break"
# one shows each pet's own toy (Y/y).
BUBBLES = [bubble(k) for k in ("water", "food", "break")]


def rows():
    """Every animation drawn in the current STYLE. A dog swaps two poses and adds rows at the end;
    a dog of a breed has its own poses (dog_rows)."""
    if "breed" in STYLE:
        return dog_rows()
    sheet = [
        ("idle",   [stand(), stand(sway=1), stand(), stand(sway=1, eye="closed")]),
        ("walk",   [stand((0, 2, 2, 0)), stand((0, 1, 1, 0), sway=1), stand(bob=1),
                    stand((2, 0, 0, 2)), stand((1, 0, 0, 1), sway=1), stand(bob=1)]),
        ("sit",    [sit(), sit(flick=1)]),
        ("sleep",  [sleep(f) for f in range(4)]),
        ("petted", [petted(f) for f in range(4)]),
        ("held",   [dangle(0), dangle(1)]),
        ("fall",   [dangle(0, "wide"), dangle(1, "wide")]),
        ("climb",  [climb(f) for f in range(4)]),
        ("peek",   [peek(e) for e in ("open", "left", "open", "right", "closed")]),
        ("crouch", [crouch(0), crouch(1)]),
        ("pounce", [pounce(0), pounce(1)]),
        ("bat",    [bat(0), bat(1)]),
        ("groom",  [groom(f) for f in range(4)]),
        ("stretch", [stretch(f) for f in range(3)]),
        ("yawn",   [yawn(f) for f in range(3)]),
        ("yarn",   [yarn(f) for f in range(4)]),
        ("ask",    [ask(0), ask(1)]),
        ("drink",  [dine(f, False) for f in range(4)]),
        ("eat",    [dine(f, True) for f in range(4)]),
        ("bubble", BUBBLES),
    ]
    if STYLE["face"] == "dog":
        swap = {"crouch": [stretch(1, "happy", 0), stretch(1, "happy", 1)],
                "groom": [scratch(f) for f in range(4)]}
        sheet = [(name, swap.get(name, frames)) for name, frames in sheet]
        sheet += [("sniff", [sniff(f) for f in range(4)]), ("bark", [bark(0), bark(1)]),
                  ("belly", [belly(0), belly(1)])]
    return sheet


def write_png(path, w, h, rgba):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))
    raw = b"".join(b"\0" + rgba[y * w * 4:(y + 1) * w * 4] for y in range(h))
    with open(path, "wb") as fh:
        fh.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
                 + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


# ------------------------------------------------------------------------------------------ dogs
# A dog is drawn like the cat: a big front-facing head on a compact body, so the two belong
# together. The breeds differ in head shape, ears, muzzle, tail, coat and a pixel or two of build.
# Every part is painted in its own local coordinates and asks mark() for its colour there, so a
# marking (a Dalmatian's spots, a husky's saddle, a golden's waves) moves, tilts and squashes with
# the part it is on in every pose instead of staying put on the frame.

FLOOR = 28   # the row the feet stand on: the window places the pet by it

# body: torso half-length and half-height standing. up: how many px higher the body stands (longer
# legs). tuck: how far the belly line rises towards the hips. legw: leg width. skull: head
# half-sizes. square: 2 is a round head, more is blockier. muzzle: half-sizes of the muzzle patch.
# eyes: how far each eye sits from the middle. ears, tail: shapes below. cheeks: a ruff that widens
# the lower face (what keeps the shiba's pricked ears from reading as a cat's or a fox's).
BREEDS = {
    "golden":    {"body": (8.5, 5), "up": 0, "tuck": 0, "legw": 3, "skull": (7, 5.5), "square": 2,
                  "muzzle": (4, 2.5), "eyes": 4, "ears": "flaps", "tail": "plume", "cheeks": False},
    "shiba":     {"body": (7, 4.5), "up": -1, "tuck": 0, "legw": 3, "skull": (6.5, 5), "square": 2,
                  "muzzle": (3.5, 2.3), "eyes": 4, "ears": "small", "tail": "curl", "cheeks": True},
    "husky":     {"body": (8, 4), "up": 2, "tuck": 0.35, "legw": 3, "skull": (5.5, 5.5), "square": 2,
                  "muzzle": (3, 2.5), "eyes": 3, "ears": "slim", "tail": "sickle", "cheeks": False},
    "dalmatian": {"body": (7.5, 4.5), "up": 1, "tuck": 0, "legw": 2, "skull": (6.5, 5.5), "square": 2,
                  "muzzle": (3.5, 2.4), "eyes": 4, "ears": "drop", "tail": "whip", "cheeks": False},
}

# Tail widths from base to tip: a golden's slim tail (its feathering is drawn apart), a
# Dalmatian's thin whip, a husky's bushy brush. A shiba's is a curl, drawn as a ring.
TAIL_W = {"plume": (2, 2, 1, 1, 1), "whip": (2, 2, 1, 1, 1), "sickle": (3, 3, 3, 3, 2)}

# Dalmatian spots per part: (u, v, radius), u and v -1..1 across the part, the radius in px so a
# spot keeps its size when the part squashes. Legs and tails take (how far along, 0).
SPOTS = {
    "torso": [(-0.62, -0.35, 0.8), (-0.2, 0.25, 0.8), (0.12, -0.55, 0.8), (0.45, 0.2, 0.75),
              (-0.88, 0.3, 0.75), (0.72, -0.3, 0.75), (-0.38, -0.8, 0.75), (0.15, 0.65, 0.75)],
    "front": [(-0.5, -0.45, 0.8), (0.4, 0.05, 0.8), (-0.1, 0.55, 0.75), (0.6, -0.55, 0.75),
              (-0.65, 0.35, 0.75)],
    "head":  [(-0.62, -0.5, 0.8), (0.55, -0.7, 0.75), (0.75, 0.25, 0.75)],
    "leg0":  [(0.3, -0.5, 0.6)],      # each leg its own: one spot row across all four is a barcode
    "leg1":  [],
    "leg2":  [(0.65, 0.5, 0.6)],
    "leg3":  [(0.2, 0.5, 0.6)],
    "arm":   [(0.5, 0, 0.6)],
    "tail":  [(0.3, 0, 0.6), (0.7, 0, 0.6)],
}

# Golden retriever coat: short wavy strands in the darker shade, anchored like the spots.
WAVES = [(-0.55, -0.3), (0.0, -0.5), (0.35, 0.1), (-0.2, 0.3), (-0.8, 0.05), (0.62, -0.25)]

FAR = {"F": "S", "B": "b"}   # far legs are in shade


def breed():
    return BREEDS[STYLE["breed"]]


def mark(part, u, v, lx, ly, rx, ry):
    """Colour of a part at local (u, v), each -1..1 across it. (lx, ly) are px from its centre and
    (rx, ry) its half-sizes; along a leg or tail lx is px from its start and rx its length."""
    kind = STYLE["breed"]
    if kind == "dalmatian":
        if part == "ear":
            return "M"
        for su, sv, rad in SPOTS.get(part, ()):
            if part.startswith(("leg", "arm", "tail")):
                if abs(lx - su * rx) <= rad and (sv == 0 or abs(v - sv) <= 0.7):
                    return "M"
            elif (lx - su * rx) ** 2 + (ly - sv * ry) ** 2 <= rad * rad:
                return "M"
        return "F"
    part = part.rstrip("0123456789")                     # which leg only matters for the spots
    if kind == "husky":                                  # dark hood and saddle, white everywhere else
        if part in ("leg", "arm", "paw", "cheek", "muzzle"):
            return "B"
        if part == "torso":
            return "M" if v < -0.45 else "B" if v > 0.25 else "F"
        if part == "front":
            return "B" if abs(u) < 0.55 and v > -0.45 else "M" if v < -0.6 else "F"
        if part == "head":                               # a hood down the sides, white brows, a line down the forehead
            hood = v < -0.55 or (abs(u) < 0.13 and v < 0.1) or (abs(u) > 0.62 and v < -0.15)
            return "M" if hood else "B"
        if part == "ear":
            return "M"
        if part == "tail":
            return "M" if v > 0.2 or u > 0.85 else "B"
        return "F"
    if kind == "shiba":                                  # urajiro: cream cheeks, chest, belly, legs
        if part in ("cheek", "muzzle", "paw"):
            return "B"
        if part == "torso":
            return "B" if v > 0.45 else "F"
        if part == "front":
            return "B" if abs(u) < 0.5 and v > -0.35 else "F"
        if part == "head":
            return "B" if v > 0.15 else "F"
        if part in ("leg", "arm"):
            return "B" if u > 0.6 else "F"
        if part == "tail":
            return "B" if v > 0.25 else "F"
        return "F"
    if kind == "golden":
        if part in ("torso", "front"):
            for wu, wv in WAVES:
                if (round(lx - wu * rx), round(ly - wv * ry)) in ((0, 0), (1, -1)):
                    return "S"
        if part == "front" and abs(u) < 0.42 and v > -0.3:
            return "B"                                   # pale chest
        if part == "muzzle":
            return "B"
    return "F"


def blob(g, part, cx, cy, rx, ry, ang=0.0, flip=False, far=False, square=2, tuck=0.0):
    """A rotated ellipse (blockier as square grows). flip turns the markings over (on his back);
    tuck lifts the belly line towards the back end."""
    ca, sa = math.cos(ang), math.sin(ang)
    for y in range(S):
        for x in range(S):
            dx, dy = x - cx, y - cy
            lx, ly = dx * ca + dy * sa, -dx * sa + dy * ca
            u, v = lx / rx, ly / ry
            if abs(u) ** square + abs(v) ** square <= 1 and not (tuck and u < 0 and v > 1 - tuck * -u * 1.6):
                c = mark(part, u, -v if flip else v, lx, -ly if flip else ly, rx, ry)
                g[y][x] = FAR.get(c, c) if far else c


def post(g, part, x0, y0, x1, y1, paw_end=None, far=False):
    """A leg or arm as a box, painted along its length: down for a leg, sideways for an arm laid
    flat. paw_end ("bottom", "top", "left", "right") is the edge that gets the paw."""
    across = paw_end in ("left", "right")
    n = max(1, (x1 - x0) if across else (y1 - y0))
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            along = (x - x0 if paw_end == "right" else x1 - x) if across else (y1 - y if paw_end == "top" else y - y0)
            side = ((y - y0) if across else (x - x0)) / max(1, (y1 - y0) if across else (x1 - x0)) * 2 - 1
            edge = {"bottom": y == y1, "top": y == y0, "left": x == x0, "right": x == x1}.get(paw_end, False)
            c = mark("paw" if edge else part, along / n, side, along, side, n, 1)
            px(g, x, y, FAR.get(c, c) if far else c)


def stroke(g, part, pts, widths, far=False):
    """A tail through pts, with widths from base to tip (stamped squares).
    mark() gets u = how far along (0..1), v = which side (-1..1, + is to the left of travel)."""
    segs = [(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    total = sum(math.dist(a, b) for a, b in segs) or 1
    done = 0.0
    for (x0, y0), (x1, y1) in segs:
        n = math.dist((x0, y0), (x1, y1))
        steps = max(1, int(n * 4))
        nx, ny = ((y1 - y0) / n, -(x1 - x0) / n) if n else (0, -1)
        for i in range(steps + 1):
            t = i / steps
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            along = done + n * t
            w = widths[min(int(along / total * len(widths)), len(widths) - 1)]
            for oy in range(w):
                for ox in range(w):
                    qx, qy = round(x - (w - 1) / 2) + ox, round(y - (w - 1) / 2) + oy
                    side = ((qx - x) * nx + (qy - y) * ny) / max(1, w / 2)
                    c = mark(part, along / total, side, along, side, total, 1)
                    px(g, qx, qy, FAR.get(c, c) if far else c)
        done += n


def dog_tail(g, pts, wag=0):
    """The breed's tail through pts (base first), the tip moved by wag. A shiba's curl is a ring
    sitting at the first point instead."""
    kind = breed()["tail"]
    if kind == "curl":
        cx, cy = pts[0][0] + wag * 0.5, pts[0][1]
        blob(g, "tail", cx, cy, 3, 2.6)
        px(g, round(cx), round(cy), "S")                 # the hole of the curl
        return
    pts = [(x, y - wag * i / (len(pts) - 1) * 1.5) for i, (x, y) in enumerate(pts)]
    if kind == "plume":                                  # a golden's: feathering hangs from a slim tail
        segs = list(zip(pts[:-1], pts[1:]))
        total = sum(math.dist(p0, p1) for p0, p1 in segs)
        k, at = 0, 1.0
        for (x0, y0), (x1, y1) in segs:
            n = math.dist((x0, y0), (x1, y1)) or 1
            while at <= n:
                x, y = x0 + (x1 - x0) * at / n, y0 + (y1 - y0) * at / n
                reach = 2.5 if k % 2 else 1.5            # strands of two lengths read as hair
                if y + reach < FLOOR and k * 1.2 < total - 1:   # none under a tail on the floor or at its tip
                    stroke(g, "fringe", [(x, y), (x - 0.4, y + reach)], (1,))
                k, at = k + 1, at + 1.2
            at -= n
    stroke(g, "tail", pts, TAIL_W[kind])


def dog_ears(g, cx, cy):
    """Pricked ears drawn under the skull: a husky's tall slim ones set close together, a shiba's
    small ones leaning out."""
    kind = breed()["ears"]
    rows = {"slim": ((0, 0), (-1, 0), (-1, 0), (-1, 1), (-1, 1), (-2, 1)),
            "small": ((1, 1), (0, 1), (-1, 1), (-2, 2), (-2, 2))}[kind]
    ox = {"slim": 3.5, "small": 4.5}[kind]
    for s in (-1, 1):
        ex = round(cx + s * ox)
        for i, (a, b) in enumerate(rows):
            y = round(cy - 4) - len(rows) + 1 + i
            lo, hi = (a, b) if s > 0 else (-b, -a)
            rect(g, ex + lo, y, ex + hi, y, mark("ear", 0, 0, 0, 0, 1, 1))
        inner = (2, 3) if kind == "small" else (2, 4)
        rect(g, ex, round(cy - 4) - len(rows) + 1 + inner[0], ex, round(cy - 4) - len(rows) + 1 + inner[1], "B")


def dog_flaps(cx, cy, swing=0):
    """A Dalmatian's black drop ears hanging over the sides of the head, as their own outlined layer."""
    e = grid()
    shape = ("xx.", "xxx", "xxx", "xxx", "xxx", "xxx", ".x.")
    for s in (-1, 1):
        ox = round(cx + s * 7)
        for dy, row in enumerate(shape):
            for dx, ch in enumerate(row):
                if ch == "x":
                    sw = swing if dy >= len(shape) - 3 else 0
                    x = ox + s * (dx - 1) + s * sw
                    px(e, x, round(cy - 5) + dy, mark("ear", 0, 0, dx, dy, 1, 1))
    return outline(e)


def dog_face(cx, cy, eye="open", mouth="pant"):
    """The front-facing head, as its own outlined layer."""
    b = breed()
    sx, sy = b["skull"]
    g = grid()
    if b["ears"] in ("slim", "small"):
        dog_ears(g, cx, cy)
    blob(g, "head", cx, cy, sx, sy, square=b["square"])
    if b["ears"] == "flaps":                            # soft flaps, part of the head
        for s in (-1, 1):
            ox = cx + s * 7
            rect(g, min(ox - s, ox - 3 * s), cy - 5, max(ox - s, ox - 3 * s), cy - 5, "S")
            rect(g, min(ox, ox - s), cy - 4, max(ox, ox - s), cy - 4, "S")
            rect(g, min(ox, ox + s), cy - 3, max(ox, ox + s), cy + 3, "S")
    if b["cheeks"]:                                      # ruff at the jaw
        for s in (-1, 1):
            blob(g, "cheek", cx + s * (sx - 1.5), cy + 2.2, 2.4, 2.2)
            px(g, round(cx + s * (sx + 0.6)), round(cy + 1), mark("cheek", 0, 0, 0, 0, 1, 1))
    mx, my = b["muzzle"]
    blob(g, "muzzle", cx, cy + 3, mx, my)
    rect(g, cx - 1, cy + 1, cx + 1, cy + 1, "n")          # the nose: what says dog, not cat
    px(g, cx, cy + 2, "n")
    if mouth == "pant":
        rect(g, cx, cy + 3, cx, cy + 4, "N")
    elif mouth in ("open", "yawn"):
        rect(g, cx - 1, cy + 3, cx + 1, cy + 4 + (mouth == "yawn"), "n")
        px(g, cx, cy + 4 + (mouth == "yawn"), "N")
    if STYLE["breed"] in ("shiba", "husky") and eye != "closed":
        for s in (-1, 1):
            px(g, cx + s * b["eyes"], cy - 2, "B")       # pale eyebrow dots
    # Eyes set close reach the nose's row: shut or smiling, they go a row up (and a shut one
    # shorter), or eyes and nose run together into one line across the face.
    close = b["eyes"] < 4
    for s in (-1, 1):
        ex = cx + s * b["eyes"]
        if eye == "open":
            rect(g, ex, cy, ex, cy + 1, "E")
        elif eye == "closed" and close:
            rect(g, min(ex, ex + s), cy, max(ex, ex + s), cy, "O")
        elif eye == "closed":
            rect(g, ex - 1, cy + 1, ex + 1, cy + 1, "O")
        elif eye == "happy":
            px(g, ex - 1, cy + 1 - close, "O"); px(g, ex, cy - close, "O"); px(g, ex + 1, cy + 1 - close, "O")
        elif eye == "wide":
            rect(g, min(ex, ex - s), cy, max(ex, ex - s), cy + 1, "E")
        elif eye == "up":
            rect(g, ex, cy - 1, ex, cy, "E")
    g = outline(g)
    if b["ears"] == "drop":
        g = over(g, dog_flaps(cx, cy))
    return g


def collar_half():
    """Half the collar's width: no wider than the muzzle, so narrower on a narrow head."""
    return 2 if breed()["skull"][0] < 6 else 3


def stand_dog(lift=(0, 0, 0, 0), bob=0, wag=0, eye="open", mouth="pant", head_at=None, paw=None):
    """Side-on body, front-facing head. lift = (back near, back far, front near, front far) in px."""
    b = breed()
    rx, ry = b["body"]
    cy = 21 - b["up"] + bob
    top = round(cy + ry * 0.5)
    w = b["legw"]
    bn, bf, fn, ff = lift
    far = grid()
    post(far, "leg1", 11 + (bf > 0), top, 12 + (bf > 0), FLOOR - bf, "bottom", far=True)
    post(far, "leg3", 20 + (ff > 0), top, 21 + (ff > 0), FLOOR - ff, "bottom", far=True)
    g = outline(far)
    body = grid()
    tail_at = {"plume": [(5, cy - 2), (3, cy - 2.5), (1.5, cy - 3), (0, cy - 4)],
               "whip": [(5, cy - 1.5), (3, cy - 2), (1.5, cy - 4), (1, cy - 6), (1.5, cy - 7.5)],
               "sickle": [(5.5, cy - 2.5), (3, cy - 5), (3, cy - 8), (5, cy - 9.5)],
               "curl": [(6.5, cy - ry - 0.5)]}[b["tail"]]
    dog_tail(body, tail_at, wag)
    blob(body, "torso", 13, cy, rx, ry, tuck=b["tuck"])
    if b["tail"] == "plume":                             # feathering under a golden's belly
        for x in range(9, 17, 2):
            low = max((y for y in range(S) if body[y][x]), default=0)
            px(body, x, low + 1, "F")
    if paw is not None:
        fn = 4                                           # the batting leg is off the floor
    for slot, x, l in ((0, 6 + (bn > 0), bn), (2, 16 + (fn > 0), fn)):
        post(body, f"leg{slot}", x, top, x + w - 1, FLOOR - l, "bottom")
    g = over(g, outline(body))
    if paw is not None:                                  # the paw swatting forward
        a = grid()
        post(a, "arm", 20, 20 + paw, 27, 21 + paw, "right")
        g = over(g, outline(a))
    hx, hy = head_at or (21, 14 + bob - (STYLE["breed"] == "dalmatian"))
    return over(g, dog_face(hx, hy, eye, mouth))


def sit_dog(flick=0, eye="open", mouth="pant", scratch=None):
    """Sitting, facing out: haunches at the sides, straight front legs, tail curled round on the
    floor. scratch = a hind leg raised to the ear, its paw at that offset."""
    b = breed()
    w = b["legw"]
    g = grid()
    if b["tail"] == "curl":
        dog_tail(g, [(9.5, 20.5)], flick)
    else:
        dog_tail(g, [(11, FLOOR - 1), (7, FLOOR - 1), (4.5, 26.5), (3.5, 24.5), (4, 22.5)], flick)
    for s in (-1, 1):
        if not (scratch is not None and s > 0):
            blob(g, "torso", 16 + s * 5.5, 25.5, 2.6, 3)  # haunches
    rx = 6 if b["legw"] == 2 else 6.5
    blob(g, "front", 16, 22.5, rx, 6)
    g = outline(g)
    legs = grid()
    for slot, x in ((3, 13 - (w == 2)), (2, 18)):
        post(legs, f"leg{slot}", x, 23, x + w - 1, FLOOR, "bottom")
    g = over(g, outline(legs))
    g = chin_collar(over(g, dog_face(16, 12, eye, mouth)), 16, 18, collar_half())
    if scratch is not None:                              # bent hind leg: knee out, paw up at the ear
        lg = grid()
        stroke(lg, "leg", [(21, 25.5), (25, 22.5), (23, 14.5 + scratch)], (2,))
        rect(lg, 22, 13 + scratch, 23, 14 + scratch, mark("paw", 0, 0, 0, 0, 1, 1))
        g = over(g, outline(lg))
    return g


def lie_dog(f):
    """Asleep: a long loaf with the head resting at the front, the tail wrapped round."""
    b = breed()
    g = grid()
    ry = 5.5 if f in (1, 2) else 5                       # breathing
    if b["tail"] == "curl":
        dog_tail(g, [(5, 28.5 - 2 * ry)])
    else:
        dog_tail(g, [(3.5, 24), (2, 26.5), (4, FLOOR - 1), (9, FLOOR - 1)])
    blob(g, "torso", 12, FLOOR + 0.5 - ry, 9.5, ry, square=2.6)
    for y in range(FLOOR + 1, S):                        # flat on the floor
        rect(g, 0, y, S - 1, y, None)
    g = over(outline(g), dog_face(22, 23, "closed", "shut"))
    rect(g, 11, 26, 13, 26, mark("paw", 0, 0, 0, 0, 1, 1))   # tucked front paw
    rect(g, 11, 25, 13, 25, "O")
    px(g, 10, 26, "O")
    px(g, 10, 27, "O")
    for y in range(FLOOR + 2, S):
        rect(g, 0, y, S - 1, y, None)
    stamp(g, 25 + f, 7 - 2 * f, ("xxxx", "..x.", ".x..", "xxxx"), "Z")
    return g


def held_dog(f, eye="open", mouth="shut"):
    """Held up under the front legs: body hanging, hind legs and tail dangling."""
    b = breed()
    g = grid()
    if b["tail"] == "curl":
        dog_tail(g, [(10.5, 23)], f)
    else:
        dog_tail(g, [(11, 26), (9.5, 27.5), (8.5 + f, 29), (8.5 + f, 30.5)])
    blob(g, "front", 16, 21, 5, 7)
    g = outline(g)
    limbs = grid()
    for slot, x in ((0, 12 - f), (1, 19 + f)):
        post(limbs, f"leg{slot}", x, 26, x + 1, 30, "bottom")
    for x0, x1 in ((9, 11), (21, 23)):
        post(limbs, "arm", x0, 19 - f, x1, 20 - f, "left" if x0 < 16 else "right")
    g = over(g, outline(limbs))
    return chin_collar(over(g, dog_face(16, 11, eye, mouth)), 16, 17, collar_half())


def bow_dog(up=1, eye="happy", mouth="pant", wag=0):
    """Play bow: rump up, chest and forelegs flat on the floor. Also the stretch after a nap."""
    b = breed()
    w = b["legw"]
    far = grid()
    post(far, "leg1", 11, 19 - up, 12, FLOOR, "bottom", far=True)
    g = outline(far)
    body = grid()
    tail_up = {"curl": [(7, 12.5 - up)], "sickle": [(6, 15 - up), (4, 12.5 - up), (4.5, 10 - up), (6, 8.5 - up)]}
    dog_tail(body, tail_up.get(b["tail"], [(6, 16 - up), (4.5, 14 - up), (4, 12 - up), (4.5, 10 - up)]), wag)
    blob(body, "torso", 13.5, 21.5 - up * 0.5, 8, 4, 0.42 + 0.06 * up)
    post(body, "leg0", 7, 20 - up, 7 + w - 1, FLOOR, "bottom")
    post(body, "arm", 17, FLOOR - 1, 28, FLOOR, "right")
    g = over(g, outline(body))
    return over(g, dog_face(22, 22, eye, mouth))


def leap_dog(f):
    """Airborne: stretched out, front paws reaching, hind legs kicked back."""
    g = grid()
    b = breed()
    if b["tail"] == "curl":
        dog_tail(g, [(5.5, 14)])
    else:
        dog_tail(g, [(5, 17), (3, 16 + f), (1.5, 15 + f), (0.5, 14 + f)])
    post(g, "arm", 2, 22, 6, 23, "left")                 # hind legs kicked back
    blob(g, "torso", 13, 19, 9, 4)
    post(g, "arm", 19, 22 - f, 25, 23 - f, "right")      # forelegs reaching
    return over(outline(g), dog_face(22, 14, "wide", "open"))


def back_dog(f):
    """On his back for a belly rub: belly up, legs paddling, a heart above."""
    g = grid()
    b = breed()
    if b["tail"] == "curl":
        dog_tail(g, [(4, 23)], f)
    else:
        dog_tail(g, [(5, 26), (3, 26), (1, 26 - f * 0.7), (0, 25 - f)])
    blob(g, "torso", 13, 24, 9, 4, flip=True)
    g = outline(g)
    legs = grid()
    for i, x in enumerate((7, 11, 15, 19)):
        top = 15 + 2 * ((i + f) % 2)
        post(legs, f"leg{i}", x, top, x + 1, 21, "top", far=i % 2 == 1)
    g = over(g, outline(legs))
    for y in range(FLOOR + 2, S):
        rect(g, 0, y, S - 1, y, None)
    g = over(g, dog_face(22, 22, "happy", "pant"))
    stamp(g, 26, 8 - f, (".x.x.", "xxxxx", ".xxx.", "..x.."), "H")
    return g


def ask_dog(f):
    """Sitting, looking up at you, a woof on the second frame and the tail going."""
    return sit_dog(flick=f, eye="up", mouth="open" if f else "shut")


def dine_dog(f, food):
    """Standing with his head down in the bowl: lapping water or crunching kibble."""
    # No collar: his chin is in the bowl.
    g = stand_dog(wag=f % 2, eye="closed", mouth="shut", head_at=(23, 21 + (f % 2 if food else 0)))
    b = bowl(food, f)
    for y in range(S):                # the rim's top outline stays behind his face
        for x in range(S):
            if b[y][x] and not (b[y][x] == "D" and y < 24 and g[y][x]):
                g[y][x] = b[y][x]
    if not food and f % 2:
        px(g, 23, 24, "N")            # tongue in the water
    return g


def dog_rows():
    """The dog's sheet: the cat's rows in the same order, then sniff, bark and belly.
    Dogs don't climb, so the climb and peek rows hold the idle pose to keep the rows lined up."""
    idle = [stand_dog(), stand_dog(wag=1), stand_dog(), stand_dog(wag=1, eye="closed")]
    sniff_lift = ((0, 2, 2, 0), (0, 0, 0, 0), (2, 0, 0, 2), (0, 0, 0, 0))
    return [
        ("idle",   idle),
        ("walk",   [stand_dog((0, 2, 2, 0)), stand_dog((0, 1, 1, 0), wag=1), stand_dog(bob=1),
                    stand_dog((2, 0, 0, 2)), stand_dog((1, 0, 0, 1), wag=1), stand_dog(bob=1)]),
        ("sit",    [sit_dog(), sit_dog(flick=1)]),
        ("sleep",  [lie_dog(f) for f in range(4)]),
        ("petted", [over(sit_dog(flick=f % 2, eye="happy"), heart(27, 5 - f)) for f in range(4)]),
        ("held",   [held_dog(0), held_dog(1)]),
        ("fall",   [held_dog(0, "wide", "open"), held_dog(1, "wide", "open")]),
        ("climb",  idle),
        ("peek",   idle + idle[:1]),
        ("crouch", [bow_dog(1, wag=0), bow_dog(1, wag=1)]),
        ("pounce", [leap_dog(0), leap_dog(1)]),
        ("bat",    [stand_dog(eye="wide", mouth="shut", paw=0), stand_dog(eye="wide", mouth="shut", paw=2)]),
        ("groom",  [sit_dog(eye="happy", mouth="pant", scratch=f % 2) for f in range(4)]),
        ("stretch", [bow_dog(0, "closed", "shut"), bow_dog(1, "closed", "shut"), bow_dog(0, "closed", "shut")]),
        ("yawn",   [sit_dog(eye="closed", mouth="shut"), sit_dog(eye="closed", mouth="yawn"),
                    sit_dog(eye="closed", mouth="shut")]),
        ("yarn",   [yarn(f) for f in range(4)]),
        ("ask",    [ask_dog(0), ask_dog(1)]),
        ("drink",  [dine_dog(f, False) for f in range(4)]),
        ("eat",    [dine_dog(f, True) for f in range(4)]),
        ("bubble", BUBBLES),
        ("sniff",  [stand_dog(sniff_lift[f], wag=f % 2, eye="closed", mouth="shut", head_at=(22, 20 + f % 2))
                    for f in range(4)]),
        ("bark",   [stand_dog(mouth="shut"), bark_mark(stand_dog(wag=1, eye="happy", mouth="open", head_at=(21, 13)))]),
        ("belly",  [back_dog(0), back_dog(1)]),
    ]


def heart(x, y):
    g = grid()
    stamp(g, x, y, (".x.x.", "xxxxx", ".xxx.", "..x.."), "H")
    return g


def bark_mark(g):
    stamp(g, 24, 0, ("x..x..x", "x..x.x.", ".....x."), "Z")
    return g


def main():
    outdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sprites")
    os.makedirs(outdir, exist_ok=True)
    for species, kind in SPECIES.items():
        for coat, overrides in kind["coats"].items():
            STYLE.clear()
            STYLE.update(kind["style"], **overrides.get("style", {}))
            sheet = rows()
            cols = max(len(frames) for _, frames in sheet)
            w, h = cols * S, len(sheet) * S
            pal = {**PALETTE, **kind["palette"], **{k: v for k, v in overrides.items() if k != "style"}}
            buf = bytearray(w * h * 4)
            for r, (name, frames) in enumerate(sheet):
                for c, g in enumerate(frames):
                    for y in range(S):
                        for x in range(S):
                            if g[y][x]:
                                i = ((r * S + y) * w + c * S + x) * 4
                                buf[i:i + 4] = bytes(pal[g[y][x]]) + b"\xff"
            out = os.path.normpath(os.path.join(outdir, f"{species}-{coat}.png"))
            write_png(out, w, h, bytes(buf))
            print(f"wrote {out} ({w}x{h})")


if __name__ == "__main__":
    main()
