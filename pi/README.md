# Pi scripts

Four Python files that talk to the frame's WLED controller over the network. Standard library only, Python 3.8 or newer: nothing to install on a fresh Raspberry Pi OS. They also run on any laptop on the same network.

> **Not yet tested on the hardware.** These scripts were written from the description in the [build manual](../docs/build-manual.md) (§ 10) and the controller app, and checked against a stand-in that imitates WLED's JSON API and DDP receiver — not against the real Dig-Quad. Expect to fix small things the first time they meet the frame.

| File | What it does |
| --- | --- |
| `wled.py` | Client for the WLED JSON API: read info and state, apply state, look effects up by name. Also `send_ddp()` for streaming pixels, and the note on why animation should use DDP instead of HTTP. |
| `frame.py` | The frame as four named sides (top, right, bottom, left), with the controller app's moods and a hue sweep. Also a command-line tool. **`PIXELS_PER_SIDE = 135`** at the top is the one number everything depends on: 135 for Build A, 21 for Build B. |
| `test_link.py` | Four checks — hostname resolves, WLED answers, pixel count matches `PIXELS_PER_SIDE`, the four side segments exist — then lights each side in turn so you can confirm by eye. Takes the pixel count from `frame.py`. |
| `bridge.py` | Serves the controller app (`../controller/`) over plain http and gives it a live link to the frame. See below. |

## Usage

```bash
# one-time: write the four-side segment layout into the controller
python3 frame.py --host life-frame.local --setup
```

```bash
# prove the link (the Phase 1 finish line)
python3 test_link.py --host life-frame.local
```

```bash
# drive it
python3 frame.py --mood golden --bri 70
python3 frame.py --sweep 8
python3 frame.py --off
```

Moods: `prism`, `afterglow`, `golden`, `bloom`, `forest`, `current` — the same colour stops as the app.

## The bridge

The controller app on GitHub Pages, or opened from disk, cannot reach a `http://` device on your network: the browser blocks it. Run the bridge on a machine on the same network as the frame:

```bash
python3 bridge.py --host life-frame.local
```

Then open `http://<that machine>:8080/` in a browser. The page notices the bridge and its Device pane (menu → Device) gets a **Live** card:

- **Drive the frame** sends every change you make as a WLED state — the nearest WLED effect to what the page shows.
- **Stream every pixel** sends the page's own pixels, 30 times a second, over DDP. The frame then shows exactly the page. When you stop, WLED goes back to its own effects after about 2.5 seconds.
- **Write the four segments** does what `frame.py --setup` does, using the pixel count set in the page's Frame pane.

The bridge answers these, and serves everything else from `../controller/`:

| Request | What happens |
| --- | --- |
| `GET /api/hello` | `{"bridge": true, "wled": host, "offline": bool}` |
| `GET /api/info` | the controller's `/json/info`, passed through |
| `POST /api/state` | the JSON body, passed through to `/json/state` |
| `POST /api/pixels` | raw RGB bytes, 3 per pixel, sent to the frame over DDP (UDP port 4048) |

Options: `--port` (default 8080) and `--bind` (default every interface; use `127.0.0.1` to keep it to this machine). The bridge has no password: run it on your own network only.
