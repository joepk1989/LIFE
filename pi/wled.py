"""A small client for the WLED JSON API, standard library only.

    from wled import WLED
    w = WLED("life-frame.local")
    print(w.info()["ver"])
    w.set_state({"on": True, "bri": 128})

HTTP is right for "go amber at 70 %" and wrong for animation: every call opens
a connection and WLED re-renders the whole state, so anything that changes many
times a second will stutter.

DDP NOTE -- read this before Phase 2.
When the Pi has to push frames (camera- or microphone-driven light), do not loop
over set_state(). Send the pixels themselves over DDP: UDP port 4048, which WLED
listens on without any setting. send_ddp() below does exactly that. WLED shows
the stream while it arrives and falls back to its own effects about 2.5 s after
the last packet (the realtime timeout), so a crashed script leaves the frame
running, not dark.
"""

import json
import socket
import urllib.error
import urllib.request

DDP_PORT = 4048
DDP_MAX_DATA = 1440          # bytes per packet: 480 RGB pixels, WLED's own limit
_DDP_TYPE_RGB24 = 0x0B       # RGB, 8 bits a channel
_DDP_DEST_DISPLAY = 1


class WLEDError(Exception):
    """The controller could not be reached, or answered with an error."""


class WLED:
    def __init__(self, host, timeout=3.0):
        self.host = host
        self.timeout = timeout
        self._effects = None
        self._ddp_sock = None
        self._ddp_seq = 0

    # ---- JSON API -------------------------------------------------------

    def _request(self, path, body=None):
        url = "http://%s%s" % (self.host, path)
        data = None
        headers = {}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers,
                                     method="POST" if data is not None else "GET")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                raw = r.read()
        except (urllib.error.URLError, OSError) as e:
            raise WLEDError("%s: %s" % (url, e)) from e
        try:
            return json.loads(raw.decode("utf-8")) if raw else {}
        except ValueError as e:
            raise WLEDError("%s: not JSON" % url) from e

    def info(self):
        """GET /json/info -- version, LED count (info['leds']['count']), name."""
        return self._request("/json/info")

    def state(self):
        """GET /json/state -- on, bri and the segment list (state['seg'])."""
        return self._request("/json/state")

    def set_state(self, state):
        """POST /json/state -- apply a (partial) state, e.g. {"on": False}."""
        return self._request("/json/state", state)

    def effects(self):
        """The effect names, in WLED's numbering (index = effect id)."""
        if self._effects is None:
            self._effects = self._request("/json/eff")
        return self._effects

    def effect_id(self, name):
        """Look an effect up by name, ignoring case: effect_id("breathe") -> 2."""
        wanted = name.strip().lower()
        for i, n in enumerate(self.effects()):
            if n.lower() == wanted:
                return i
        raise WLEDError("no effect called %r on %s" % (name, self.host))

    # ---- DDP ------------------------------------------------------------

    def send_ddp(self, rgb, offset=0):
        """Send raw RGB bytes (r, g, b per pixel) starting at pixel `offset`.

        Splits into packets of at most 1440 bytes and sets the push flag on the
        last one, so WLED shows the whole frame at once.
        """
        rgb = bytes(rgb)
        if self._ddp_sock is None:
            self._ddp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self._ddp_addr = (socket.gethostbyname(self.host), DDP_PORT)
        self._ddp_seq = self._ddp_seq % 15 + 1           # 1..15, 0 means "unused"
        channel = offset * 3
        for start in range(0, max(len(rgb), 1), DDP_MAX_DATA):
            chunk = rgb[start:start + DDP_MAX_DATA]
            last = start + DDP_MAX_DATA >= len(rgb)
            flags = 0x40 | (0x01 if last else 0x00)      # version 1, push on the last
            header = bytes([flags, self._ddp_seq, _DDP_TYPE_RGB24, _DDP_DEST_DISPLAY])
            header += (channel + start).to_bytes(4, "big") + len(chunk).to_bytes(2, "big")
            self._ddp_sock.sendto(header + chunk, self._ddp_addr)

    def close(self):
        if self._ddp_sock is not None:
            self._ddp_sock.close()
            self._ddp_sock = None
