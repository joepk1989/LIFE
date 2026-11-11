"""Prove the link between the Pi and the frame -- the Phase 1 finish line.

    python3 test_link.py --host life-frame.local

Four checks, then each side lights in turn so you can confirm by eye. The pixel
count comes from frame.py (PIXELS_PER_SIDE), so there is only one copy of it.
Standard library only. Exit code 0 when all four checks pass.
"""

import argparse
import socket
import sys
import time

from frame import DEFAULT_HOST, PIXELS_PER_SIDE, SIDES, segments, side_colour
from wled import WLED, WLEDError


def check(n, label, ok, detail):
    print("%d. %-28s %s  %s" % (n, label, "ok  " if ok else "FAIL", detail))
    return ok


def main(argv=None):
    p = argparse.ArgumentParser(description="Check the link to the L.I.F.E. frame.")
    p.add_argument("--host", default=DEFAULT_HOST)
    p.add_argument("--hold", type=float, default=2.0, help="seconds each side stays lit")
    p.add_argument("--bri", type=float, default=40, help="brightness for the side test, 0-100")
    p.add_argument("--no-lights", action="store_true", help="checks only, do not light the sides")
    a = p.parse_args(argv)
    w = WLED(a.host)
    expected = 4 * PIXELS_PER_SIDE
    passed = 0

    # 1. the name resolves
    try:
        addr = socket.gethostbyname(a.host)
        passed += check(1, "hostname resolves", True, "%s -> %s" % (a.host, addr))
    except OSError as e:
        check(1, "hostname resolves", False, "%s: %s" % (a.host, e))
        print("   Is the controller on the network, and is its mDNS name life-frame?")
        return 1

    # 2. WLED answers
    try:
        info = w.info()
        passed += check(2, "WLED answers", True, "WLED %s" % info.get("ver"))
    except WLEDError as e:
        check(2, "WLED answers", False, str(e))
        return 1

    # 3. the controller drives the number of pixels we think it does
    count = info.get("leds", {}).get("count")
    ok = count == expected
    passed += check(3, "pixel count", ok, "controller %s, frame.py %d (4 × %d)" % (count, expected, PIXELS_PER_SIDE))
    if not ok:
        print("   Set the LED outputs in WLED to 4 × %d, or fix PIXELS_PER_SIDE in frame.py." % PIXELS_PER_SIDE)

    # 4. the four sides exist as segments
    seg = [(s.get("start"), s.get("stop")) for s in w.state().get("seg", [])]
    want = [(s["start"], s["stop"]) for s in segments()]
    ok = seg[:4] == want and len(seg) == 4
    passed += check(4, "four side segments", ok, "found %s" % seg)
    if not ok:
        print("   Run: python3 frame.py --host %s --setup" % a.host)

    if passed == 4 and not a.no_lights:
        print("\nLighting each side in turn -- check it is the side named.")
        before = w.state()
        try:
            for i, name in enumerate(SIDES):
                for j in range(4):
                    side_colour(w, j, (255, 255, 255) if j == i else (0, 0, 0), a.bri)
                print("   %s" % name)
                time.sleep(a.hold)
        finally:
            w.set_state({k: before[k] for k in ("on", "bri", "seg") if k in before})

    print("\n%d of 4 checks passed." % passed)
    return 0 if passed == 4 else 1


if __name__ == "__main__":
    sys.exit(main())
