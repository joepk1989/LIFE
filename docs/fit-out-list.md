*L.I.F.E. — Build A fit-out*

# What's left to buy

The strip is mounted, the supply is on the shelf and the controller is on its way from China. Everything below is shelf stock at Conrad, TinyTronics or a local automotive shop — none of it has a lead time, and none of it blocks the bench test.

- 3 already owned
- 15 to buy
- 0 with a lead time

## In the workshop

- [x] LED strip, already mounted in aluminium profile — WS2813 · 5 V · 4 × 150 cm
- [x] Power supply, DIN rail with covered terminals — Mean Well HDR-60-5 · 6.5 A
- [x] LED controller — ordered, ships from ALLNET China — QuinLED Dig-Quad v3 · LAN

## Protection

*between the supply and everything else*

- [ ] **ATO blade fuses, 3 A (violet)** — `ATO / ATC standard · × 4`  
  One per output. The Dig-Quad will pass up to 10 A a terminal; your four sides never draw more than 1.25 A each once the per-output limiter is set.
- [ ] **ATO blade fuse, 7.5 A (brown)** — `ATO / ATC standard · × 1`  
  On the main DC feed, between the supply and the board. Sized to protect the 1.5 mm² cable, not the supply.
- [ ] **Inline fuse holders** — `for ATO blade · × 5`  
  Blade type, screw or bolt mount. Five in total — four outputs and the feed.
- [ ] **IEC C14 inlet with fuse holder** — `panel mount · T1A · × 1`  
  Mains into the enclosure, with a T1A slow-blow. A 32.5 W supply draws well under a quarter of an amp at 230 V.

## Wire and terminations

*5 V is unforgiving over 1.5 m — buy the spare pair*

- [ ] **4-core cable, 0.75 mm²** — `0.75 mm² ≈ 18 AWG · × 8 m`  
  One run per side: V+, ground, data, and a spare core you will be glad of later. Buy 8 m for four 1.5 m runs plus slack and mistakes.
- [ ] **2-core cable, 0.75 mm² — injection** — `0.75 mm² ≈ 18 AWG · × 7 m`  
  At 5 V the far end of a 1.5 m run sags and the colour drifts warm. Feeding power to both ends of each side fixes it; this is the pair that does it.
- [ ] **2-core cable, 1.5 mm²** — `1.5 mm² ≈ 16 AWG · × 1 m`  
  Supply to board. Short run, high current — this is the one carrying all four sides at once.
- [ ] **Bootlace ferrules + crimper** — `0.75 & 1.5 mm² assortment · × 1`  
  The Dig-Quad and the HDR are both screw terminals. Bare stranded wire in a screw terminal works loose and heats up; ferrules are the difference between a prototype and an installation.
- [ ] **Earth bonding wire, green/yellow** — `1.5 mm² + ring tags · × 2 m`  
  The aluminium profiles are exposed metal and mains is in the same box. Bond the profiles back to the inlet's earth: the HDR is class II and has no earth terminal, so the wire runs from the inlet straight to a ring tag on each of the four profiles.
- [ ] **Consumables**  
  Solder, flux, assorted heatshrink, strain reliefs. Soldering to WS2813 pads wants a fine tip and a fast hand — the pads lift easily.

## Enclosure

*the HDR is DIN rail, so build around that*

- [ ] **DIN rail enclosure + short rail** — `TS35 rail · × 1`  
  Closed box, big enough for the supply, the fuse holders and the Dig-Quad in its acrylic case. Mains and 5 V in one place, nothing exposed.
- [ ] **Cable glands** — `M12 / M16 · × 7`  
  One per side, plus mains, Ethernet and the earth wire to the profiles. They take the strain instead of the terminal screws.
- [ ] **GX16 4-pin connectors** — `4-pin aviation, panel + lead · × 4 pr`  
  Only if the sides come apart for transport. Screw-locking and keyed, which is what you want when you are assembling at a venue in the dark.

## For the board

*have these ready for the day it lands*

- [ ] **Ethernet patch cable** — `Cat 5e or better · × 1`  
  You took the LAN version, which is the right call inside an aluminium frame — but it now needs a cable reaching wherever the frame stands.
- [ ] **USB cable for flashing** — `per board revision · × 1`  
  Check which connector your v3 board carries before you buy — the QuinLED docs list it per revision. Needed once, to put WLED on it.

> ## The bench test needs none of it
>
> Supply, board, the strip you already have, a network cable. Flash WLED, turn the brightness limiter **on** with the per-output limiter at `1250 mA` on each output — `5000 mA` together, which keeps the supply cool in its box with the ESP32 on the same rail — then light one side.
>
> That proves the electronics and settles the one number still open: count the LEDs in 10 cm and set pixels-per-segment to match. The listing claims both 90 LEDs/m and 100 pixels/m, and on WS2813 one LED is one pixel, so only one of them is true.

------------------------------------------------------------------------

[Build manual →](build-manual.md) · 540 px · 135 a side · 5 V · HDR-60-5 · 6.5 A · ABL 4 × 1250 mA · Frame 150 × 150 cm
