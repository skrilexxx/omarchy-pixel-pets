# Pixel Pets

![Pixel Pets](preview.png)

A pixel-art cat, a dog, or both, living on your [Omarchy](https://omarchy.org) desktop. They walk along the
bottom of the screen, sit, nap, and stay out of your way: clicks next to them go straight through to your
windows. What follows describes the cat; the dog and the two together come further down.

- **Click** her to pet her.
- **Drag** her to pick her up, let go to drop her.
- **Double-click** her to give her a ball of yarn (or use the button in the settings). She chases and bats it around; you can drag and throw it too.
- Wiggle the **mouse** near the bottom of the screen and she may stalk and pounce on it.

Now and then she climbs up one of your windows (back to you, tail swinging). If there is room above it she
gets onto the top and treats it as her floor for a while: walks along it, sits, grooms, naps, then climbs
back down. On a window right under the bar there is no room to stand: at the small size she keeps low up
there, prowling in a crouch and napping in front of the bar; at bigger sizes she slips over the top edge
and peeks back over it, then climbs back down.
Click her while she peeks and she ducks; if the window closes or moves, or you switch workspace, she drops.

Between all that she grooms, yawns, and stretches after naps.

She hides under fullscreen apps.

## Care reminders

She can remind you to look after yourself. Every so often she sits down with a speech bubble asking for
**water**, **food** or a **break** (the yarn ball). Click her to give it: she drinks or eats from a bowl, or
the ball drops out for a play break. Ignore her for five minutes and she comes over to your mouse with the
bubble bouncing. Timers start over when you come back after being away (idle, locked or asleep) for five
minutes or more. The dog does the same; with both out they take turns.

## Settings

Click the icon in the bar to open the settings: which pets are out, a name and coat for each, size,
energy (lazy to playful), and switches for following the time of day, hiding while the screen is shared,
stalking the pointer, climbing windows and care reminders (with how often water, food and a break
come), plus a button for each pet's toy. Point at any of them and
the line at the bottom says what it does. Right-click the icon to hide or show the pets. A pet's name
pops up when you pet it.

The **Pets** switch at the top of the settings picks a cat, a dog, or both. Each has its own name and
coats (dog: golden, shiba, husky, dalmatian, chocolate). A dog stays on the ground: no window climbing.
He fetches a thrown tennis ball back to where it was thrown from and barks for another throw, sniffs
along the floor, scratches behind his ear, chases his tail, and play-bows before pouncing on the mouse.
Energy and the time of day steer him exactly as they steer the cat.

With both out they visit each other now and then, more often the livelier they are: they sit together,
play (a play bow from the dog, a paw on the nose from the cat), or nap side by side.

Each pet wanders off past the edge of the screen now and then and is gone for a few minutes:
the cat for about half the time, the dog for about 20%. Giving or picking up its toy calls it back. "Wander off" in the settings turns this off.

## Things they get up to

How often the self-started ones happen follows the energy slider and the time of day.

- **Cuddling:** a pet joining a sleeper lies down face to face with it, heads just touching.
- **The chase:** a lively dog sometimes chases the cat. She escapes up a window and stays on top of it or
  peeks down from behind it (if "Climb windows" is on), or bolts off the screen edge and strolls back in;
  he barks after her.
- **Contagious yawn:** one yawns, the other often follows, and now and then both nap.
- **Welcome back:** leave the desk for a few minutes and they nap. Touch the mouse and the dog runs to
  your pointer for hearts; the cat stretches and yawns. Sleepy pets just stretch and sleep on.
- **Petting has a limit:** after a few pets in a row the cat swats the pointer, walks off and sulks for a
  bit. A few more and the dog rolls over for a belly rub. Pets count at stroking pace; faster clicks don't,
  so a double-click is still just the toy.
- **Ask to play:** four times a day, at random moments between 9 and 21 o'clock, the dog brings you his
  ball unasked and bows; ignored, he lies down next to it. Once a day the cat nudges her yarn your way.
- **Zoomies:** at high energy, a sudden race from one end of the screen to the other and back.
  Holding a pet's toy in the top third of the screen for five seconds sets it off too.
- **Dreams:** once per long nap a thought bubble shows the toy or the other pet.
- **Music:** while something plays, sitting tails flick faster and the dog spins more.
- **Startled:** a window opening or closing right over a pet makes the cat hop and scurry off and
  the dog bark, at most once every few minutes.
- **Camera shy:** a few seconds into a screen or window share they run off and stay away until it ends;
  screenshots and thumbnails don't count. Switch in the settings.
- **Low battery:** below 20% they get sleepy, below 10% they sleep; plugging in wakes them.

Settings are saved in `~/.config/omarchy/pixel-pets.json`.

## Install

```sh
omarchy plugin add https://github.com/skrilexxx/omarchy-pixel-pets --enable
```

Remove with `omarchy plugin remove skrilexxx.pixel-pets`.

## Requirements

Omarchy with its Quickshell-based shell (Hyprland). Nothing to install: the pets are plain QML and PNG
sprites, and read window and mouse positions from Hyprland's own IPC socket. A few reactions use what
the shell already offers and simply don't happen without it: media players (MPRIS) for the music,
UPower for the battery, Wayland's idle notification for the nap while you're away. Settings are saved to
`~/.config/omarchy/pixel-pets.json`; no other config is touched.

## Develop

```sh
python3 tools/make_sprites.py   # redraw sprites/<species>-<coat>.png (coats are in CAT_COATS and DOG_COATS)
python3 tools/make_preview.py . preview.png   # rebuild the store preview from the sprites
node tools/test_brain.js        # behaviour self-check
tools/tour.sh                   # live: every action in turn, named above the pet; Ctrl+C stops it
omarchy plugin validate .

# install the working copy (plugin folders may not be symlinks)
rsync -a --delete --exclude .git ./ ~/.config/omarchy/plugins/skrilexxx.pixel-pets/
omarchy-shell shell rescanPlugins
omarchy plugin enable skrilexxx.pixel-pets   # puts the icon in the right of the bar
omarchy restart shell           # needed after changing .qml/.js; images hot-reload, code does not
```

Layout: `Service.qml` is the pet window, input and saved settings, `Panel.qml` is the bar icon and settings
panel, `Brain.js` is the behaviour, `tools/make_sprites.py` draws the
sprite sheet (32x32 frames, one row per animation).

## License

MIT, code and art.
