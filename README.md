![alt text](http://itsthe.life/wp-content/uploads/2017/04/minimal-life.jpg "Artwork L.I.F.E.")

# L.I.F.E.

This is the readme for L.I.F.E.

Here you can discover programs needed to bring it to the next level.


## Documentation

| Document | English | Nederlands |
| --- | --- | --- |
| Build manual — Phase 1, Build A (5 V WS2813) and Build B (24 V FCOB WS2814 RGBW): wiring, build steps, WLED settings, power budget, bill of materials, fault finding | [build-manual.md](docs/build-manual.md) | [build-manual.nl.md](docs/build-manual.nl.md) |
| Fit-out list — what is owned and what is left to buy for Build A | [fit-out-list.md](docs/fit-out-list.md) | [fit-out-list.nl.md](docs/fit-out-list.nl.md) |
| Controller schematic — how the controller app is put together | [controller-schematic.md](docs/controller-schematic.md) | — |

Diagrams are in [`docs/images/`](docs/images/).


## Programs

### Controller

[`controller/`](controller/) — the L.I.F.E. controller app: a 2D and 3D preview of the 150 × 150 cm frame with gradients, motion effects, moods, microphone react mode, scenes, photo mode and the WLED JSON export.

**Try it online:** https://joepk1989.github.io/LIFE/ (GitHub Pages).

No build step and no dependencies to install: open `controller/index.html` in a browser, straight from disk or from any static host.

```
controller/
├── index.html        markup
├── style.css         styles
├── app.js            the program
├── vendor/           three.js r128 (MIT)
├── data/             pose artwork, wall photo, frame module, low-poly kit, poser mesh
└── assets/           the pose artwork and wall photo as plain image files
```

### Pi scripts

[`pi/`](pi/) — `wled.py`, `frame.py`, `test_link.py` and `bridge.py`: drive the frame from a Raspberry Pi or a laptop, prove the link, and give the controller app a live connection to the real frame. Standard library only. **Not yet tested on the hardware** — see [`pi/README.md`](pi/README.md).

### Flashing lights

text
