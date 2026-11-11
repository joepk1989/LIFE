*L.I.F.E. — Build A afbouw*

# Wat er nog gekocht moet worden

De strip zit in het profiel, de voeding ligt op de plank en de controller is onderweg uit China. Alles hieronder is voorraad bij Conrad, TinyTronics of een lokale auto-onderdelenzaak — niets ervan heeft levertijd, en niets ervan houdt de test op de werkbank tegen.

- 3 al in bezit
- 15 te kopen
- 0 met levertijd

## In de werkplaats

- [x] LED strip, already mounted in aluminium profile — WS2813 · 5 V · 4 × 150 cm
- [x] Power supply, DIN rail with covered terminals — Mean Well HDR-60-5 · 6.5 A
- [x] LED controller — ordered, ships from ALLNET China — QuinLED Dig-Quad v3 · LAN

## Beveiliging

*tussen de voeding en al het andere*

- [ ] **ATO-steekzekeringen, 3 A (violet)** — `ATO / ATC standaard · × 4`  
  Eén per uitgang. De Dig-Quad kan tot 10 A per klem leveren; jouw vier zijden trekken elk nooit meer dan 1,25 A zodra de begrenzer per uitgang ingesteld is.
- [ ] **ATO-steekzekering, 7,5 A (bruin)** — `ATO / ATC standaard · × 1`  
  Op de hoofd-DC-toevoer, tussen de voeding en de controller. Gekozen om de 1,5 mm² kabel te beschermen, niet de voeding.
- [ ] **Zekeringhouders, inline** — `voor ATO-steekzekering · × 5`  
  Voor steekzekeringen, schroef- of boutmontage. Vijf in totaal — vier uitgangen en de toevoer.
- [ ] **IEC C14 apparaatingang met zekeringhouder** — `paneelmontage · T1A · × 1`  
  Netspanning de behuizing in, met een T1A traag. Een voeding van 32,5 W trekt ruim onder een kwart ampère bij 230 V.

## Bedrading en aansluitingen

*5 V is meedogenloos over 1,5 m — koop het extra paar*

- [ ] **4-aderige kabel, 0,75 mm²** — `0,75 mm² ≈ 18 AWG · × 8 m`  
  Eén streng per zijde: V+, massa, data en een reserveader waar je later blij mee bent. Koop 8 m voor vier strengen van 1,5 m, plus speling en vergissingen.
- [ ] **2-aderige kabel, 0,75 mm² — bijvoeden** — `0,75 mm² ≈ 18 AWG · × 7 m`  
  Bij 5 V zakt het uiteinde van een streng van 1,5 m weg en verkleurt het licht naar warm. Elke zijde aan beide kanten voeden lost dat op; dit is het paar dat dat doet.
- [ ] **2-aderige kabel, 1,5 mm²** — `1,5 mm² ≈ 16 AWG · × 1 m`  
  Van voeding naar controller. Korte afstand, hoge stroom — deze draagt alle vier de zijden tegelijk.
- [ ] **Adereindhulzen + krimptang** — `assortiment 0,75 & 1,5 mm² · × 1`  
  De Dig-Quad en de HDR hebben allebei schroefklemmen. Kale soepele draad in een schroefklem werkt los en wordt warm; adereindhulzen zijn het verschil tussen een prototype en een installatie.
- [ ] **Aardleiding, geel/groen** — `1,5 mm² + ringkabelschoenen · × 2 m`  
  De aluminium profielen zijn onbeschermd metaal en de netspanning zit in dezelfde kast. Verbind de profielen met de aarde van de apparaatingang: de HDR is klasse II en heeft geen aardklem, dus de draad loopt van de ingang rechtstreeks naar een ringkabelschoen op elk van de vier profielen.
- [ ] **Verbruiksmateriaal**  
  Soldeer, vloeimiddel, krimpkous in maten, trekontlastingen. Solderen aan WS2813-pads vraagt een fijne punt en een snelle hand — de pads laten makkelijk los.

## Behuizing

*de HDR is DIN-rail, dus bouw daaromheen*

- [ ] **DIN-rail kast + kort stuk rail** — `TS35-rail · × 1`  
  Gesloten kast, groot genoeg voor de voeding, de zekeringhouders en de Dig-Quad in zijn acrylbehuizing. Netspanning en 5 V op één plek, niets open en bloot.
- [ ] **Wartels** — `M12 / M16 · × 7`  
  Eén per zijde, plus netspanning, ethernet en de aarddraad naar de profielen. Zij nemen de trek op in plaats van de klemschroeven.
- [ ] **GX16 4-polige connectoren** — `4-polig aviation, paneel + kabeldeel · × 4 pr`  
  Alleen als de zijden los moeten voor transport. Schroefvergrendeld en gecodeerd, precies wat je wilt als je in het donker op locatie staat op te bouwen.

## Voor de controller

*zorg dat dit klaarligt op de dag dat hij binnenkomt*

- [ ] **Ethernet-patchkabel** — `Cat 5e of beter · × 1`  
  Je hebt de LAN-versie genomen, de juiste keuze binnen een aluminium frame — maar er moet nu wel een kabel liggen tot waar het frame staat.
- [ ] **USB-kabel om te flashen** — `per boardrevisie · × 1`  
  Kijk eerst welke connector jouw v3-board heeft — de QuinLED-documentatie vermeldt dat per revisie. Eén keer nodig, om WLED erop te zetten.

> ## De test op de werkbank heeft niets hiervan nodig
>
> Voeding, controller, de strip die je al hebt, een netwerkkabel. Flash WLED, zet de helderheidsbegrenzer **aan** met de begrenzer per uitgang op `1250 mA` per uitgang — samen `5000 mA`, zodat de voeding koel blijft in zijn kast met de ESP32 op dezelfde voeding — en laat één zijde branden.
>
> Dat bewijst de elektronica en beslecht het enige getal dat nog openstaat: tel de LED's in 10 cm en zet het aantal pixels per segment daarop. De advertentie claimt zowel 90 LED's/m als 100 pixels/m, en bij WS2813 is één LED één pixel — dus maar één van de twee kan kloppen.

------------------------------------------------------------------------

[Bouwhandleiding →](build-manual.nl.md) · 540 px · 135 per zijde · 5 V · HDR-60-5 · 6,5 A · ABL 4 × 1250 mA · Frame 150 × 150 cm
