"""The frame as four named sides, with the controller app's moods and a hue sweep.

    python3 frame.py --host life-frame.local --setup     # once, after wiring
    python3 frame.py --mood golden --bri 70
    python3 frame.py --sweep 8
    python3 frame.py --off

Standard library only.
"""

import argparse
import colorsys
import sys
import time

from wled import WLED, WLEDError

# ---------------------------------------------------------------------------
# The one number everything else depends on. 135 is Build A (WS2813, 90/m,
# 150 cm a side). Build B, the 24 V FCOB strip, is 21. Count the LEDs in 10 cm
# and confirm this before running --setup: get it wrong and the controller is
# told to address the wrong number of pixels, silently.
PIXELS_PER_SIDE = 135
# ---------------------------------------------------------------------------

SIDES = ["top", "right", "bottom", "left"]
DEFAULT_HOST = "life-frame.local"

# Same stops as the controller app (controller/app.js, MOODS).
RAINBOW = ["#ff2d55", "#ff8a00", "#ffd400", "#35d47a", "#26c6da", "#3d5afe", "#d946ef", "#ff2d55"]
MOODS = {
    "prism":     RAINBOW,
    "afterglow": ["#ff2d55", "#ff8a00", "#ffce54", "#ff2d55"],
    "golden":    ["#f5c261", "#f5a623", "#7a4a12", "#f5c261"],
    "bloom":     ["#f472e0", "#d946ef", "#5b21b6", "#f472e0"],
    "forest":    ["#8ef0b0", "#35d47a", "#0f5132", "#8ef0b0"],
    "current":   ["#8be9fd", "#26c6da", "#1e3a8a", "#8be9fd"],
}


def segments(per_side=PIXELS_PER_SIDE):
    """The four sides as WLED segments: top, right, bottom, left."""
    return [{"id": i, "start": i * per_side, "stop": (i + 1) * per_side, "n": SIDES[i]}
            for i in range(4)]


def hex_to_rgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def sample(stops, t):
    """Colour at position t (0..1) along a list of hex stops."""
    cols = [hex_to_rgb(s) for s in stops]
    x = (t % 1.0) * (len(cols) - 1)
    i = min(int(x), len(cols) - 2)
    f = x - i
    return [round(a + (b - a) * f) for a, b in zip(cols[i], cols[i + 1])]


def pct_to_bri(pct):
    return max(0, min(255, round(pct / 100 * 255)))


def setup(w, per_side=PIXELS_PER_SIDE):
    """Write the four-side segment layout into the controller, and remove extras."""
    segs = segments(per_side)
    segs += [{"id": i, "stop": 0} for i in range(4, 16)]   # stop 0 deletes a segment
    return w.set_state({"seg": segs})


def side_colour(w, side, rgb, bri=None):
    """Light one side (0..3) in one colour and leave the others as they are."""
    state = {"on": True, "seg": [{"id": side, "fx": 0, "col": [list(rgb)]}]}
    if bri is not None:
        state["bri"] = pct_to_bri(bri)
    return w.set_state(state)


def mood(w, name, bri=None):
    """Spread a mood's gradient round the frame: each side gets its own colour."""
    stops = MOODS[name]
    segs = [{"id": i, "fx": 0, "col": [sample(stops, (i + 0.5) / 4)]} for i in range(4)]
    state = {"on": True, "transition": 7, "seg": segs}
    if bri is not None:
        state["bri"] = pct_to_bri(bri)
    return w.set_state(state)


def sweep(w, seconds, bri=None, rate=10):
    """Rotate the hue round the four sides for `seconds`.

    Over HTTP, so about ten updates a second at most -- see the DDP note in
    wled.py for anything faster.
    """
    if bri is not None:
        w.set_state({"on": True, "bri": pct_to_bri(bri)})
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        phase = (end - time.monotonic()) / max(seconds, 0.001)
        segs = []
        for i in range(4):
            r, g, b = colorsys.hsv_to_rgb((phase + i / 4) % 1.0, 1.0, 1.0)
            segs.append({"id": i, "fx": 0, "col": [[round(r * 255), round(g * 255), round(b * 255)]]})
        w.set_state({"on": True, "transition": 0, "seg": segs})
        time.sleep(1 / rate)


def off(w):
    return w.set_state({"on": False})


def main(argv=None):
    p = argparse.ArgumentParser(description="Drive the L.I.F.E. frame through WLED.")
    p.add_argument("--host", default=DEFAULT_HOST, help="controller hostname or IP (default %(default)s)")
    p.add_argument("--setup", action="store_true", help="write the four-side segment layout")
    p.add_argument("--mood", choices=sorted(MOODS), help="one of the app's moods")
    p.add_argument("--bri", type=float, metavar="PCT", help="brightness, 0-100")
    p.add_argument("--sweep", type=float, metavar="SECONDS", help="rotate the hue round the frame")
    p.add_argument("--off", action="store_true", help="switch the frame off")
    p.add_argument("--info", action="store_true", help="print what the controller reports")
    a = p.parse_args(argv)

    w = WLED(a.host)
    try:
        if a.info:
            i = w.info()
            print("%s · WLED %s · %s LEDs" % (i.get("name"), i.get("ver"), i.get("leds", {}).get("count")))
        if a.setup:
            setup(w)
            print("segments written: 4 × %d px" % PIXELS_PER_SIDE)
        if a.off:
            off(w)
        elif a.mood:
            mood(w, a.mood, a.bri)
        elif a.sweep:
            sweep(w, a.sweep, a.bri)
        elif a.bri is not None:
            w.set_state({"on": True, "bri": pct_to_bri(a.bri)})
        elif not (a.info or a.setup):
            p.print_help()
    except WLEDError as e:
        print("error: %s" % e, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
