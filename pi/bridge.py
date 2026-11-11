"""Serve the controller app on your own network and give it a live link to the frame.

    python3 bridge.py --host life-frame.local
    then open http://<this machine>:8080/ in a browser on the same network.

Opened from disk or from GitHub Pages, the controller page cannot reach a
http:// device on your network (the browser forbids it), so it stays a
simulator. Served by this script over plain http, the page finds the API below
(it asks /api/hello on load) and its Device pane grows a Live card:

    GET  /api/hello   {"bridge": true, "wled": host, "offline": bool}
    GET  /api/info    the controller's /json/info, passed through
    POST /api/state   a WLED state (JSON), passed through to /json/state
    POST /api/pixels  raw RGB bytes, 3 per pixel, sent on to the frame over DDP

Everything else is a file from the controller folder. Standard library only.
"""

import argparse
import functools
import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from wled import WLED, WLEDError

HERE = os.path.dirname(os.path.abspath(__file__))
CONTROLLER = os.path.normpath(os.path.join(HERE, "..", "controller"))
MAX_BODY = 1 << 20


class Handler(SimpleHTTPRequestHandler):
    wled = None                     # set in main()

    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n < 0 or n > MAX_BODY:
            raise ValueError("body too large")
        return self.rfile.read(n)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/hello":
            try:
                self.wled.info()
                offline = False
            except WLEDError:
                offline = True
            return self._json(200, {"bridge": True, "wled": self.wled.host, "offline": offline})
        if path == "/api/info":
            try:
                return self._json(200, self.wled.info())
            except WLEDError as e:
                return self._json(502, {"error": str(e)})
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        try:
            body = self._body()
        except ValueError as e:
            return self._json(413, {"error": str(e)})
        if path == "/api/state":
            try:
                state = json.loads(body.decode("utf-8"))
            except ValueError:
                return self._json(400, {"error": "not JSON"})
            try:
                return self._json(200, self.wled.set_state(state))
            except WLEDError as e:
                return self._json(502, {"error": str(e)})
        if path == "/api/pixels":
            if len(body) % 3:
                return self._json(400, {"error": "expected 3 bytes per pixel"})
            try:
                self.wled.send_ddp(body)
            except OSError as e:
                return self._json(502, {"error": str(e)})
            self.send_response(204)
            self.end_headers()
            return None
        return self._json(404, {"error": "unknown endpoint"})

    def log_message(self, fmt, *args):
        if "/api/pixels" not in (args[0] if args else ""):   # 30 a second is noise
            super().log_message(fmt, *args)


def main(argv=None):
    p = argparse.ArgumentParser(description="Serve the L.I.F.E. controller with a live link to the frame.")
    p.add_argument("--host", default="life-frame.local", help="the WLED controller (default %(default)s)")
    p.add_argument("--port", type=int, default=8080)
    p.add_argument("--bind", default="0.0.0.0", help="address to listen on (default: every interface)")
    a = p.parse_args(argv)

    if not os.path.isfile(os.path.join(CONTROLLER, "index.html")):
        print("error: controller not found at %s" % CONTROLLER, file=sys.stderr)
        return 1
    Handler.wled = WLED(a.host)
    handler = functools.partial(Handler, directory=CONTROLLER)
    server = ThreadingHTTPServer((a.bind, a.port), handler)
    print("Serving %s on http://%s:%d/ -> WLED at %s" % (CONTROLLER, a.bind, a.port, a.host))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        Handler.wled.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
