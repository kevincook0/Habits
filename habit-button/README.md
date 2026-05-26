# Habit Button — Build Guide

A physical WiFi button for each daily habit. Press it → the habit is toggled in Supabase, LED goes green.

---

## Parts list (per button)

| Part | Where to buy | ~Cost |
|------|-------------|-------|
| Wemos D1 Mini (ESP8266) | Amazon / AliExpress | $3–5 |
| Momentary push button (12mm tactile) | Amazon / AliExpress | $0.50 |
| RGB LED, common cathode | Amazon / AliExpress | $0.20 |
| 3× 220Ω resistors | Any electronics kit | $0.05 |
| Half-size breadboard | Amazon | $2 |
| Jumper wires (M-M) | Any kit | — |
| Micro-USB cable | Already have one | — |

**AliExpress tip:** Search "Wemos D1 Mini" and "12mm tactile button" — buy 5 of each, shipping included it's about $10 total for all 13 buttons.

---

## Breadboard wiring

```
Wemos D1 Mini           Breadboard
─────────────           ──────────
D3  (GPIO0)  ─────────► Button pin 1
GND          ─────────► Button pin 2   (other leg to GND)

D5  (GPIO14) ──[220Ω]──► RGB LED  R leg
D6  (GPIO12) ──[220Ω]──► RGB LED  G leg
D7  (GPIO13) ──[220Ω]──► RGB LED  B leg
GND          ─────────► RGB LED  GND (longest leg on common-cathode)
```

**RGB LED leg order** (flat side facing you, left to right):
`R — GND (longest) — G — B`

---

## Arduino IDE setup

### 1. Install the ESP8266 board package
1. Open Arduino IDE → **Preferences**
2. Add this URL to "Additional Boards Manager URLs":
   ```
   https://arduino.esp8266.com/stable/package_esp8266com_index.json
   ```
3. **Tools → Board → Boards Manager** → search "esp8266" → install

### 2. Install libraries
**Tools → Manage Libraries**, search and install:
- **ArduinoJson** by Benoit Blanchon (v7.x)

### 3. Board settings
- Board: **LOLIN(WEMOS) D1 R2 & mini**
- Upload Speed: **921600**
- Port: your USB port (appears when D1 Mini is plugged in)

### 4. Configure the sketch
Open `habit_button/habit_button.ino` and edit the top section:

```cpp
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* HABIT_NAME    = "Omega-3, VitD, Creatine";  // ← exact habit name
const char* TIMEZONE      = "PST8PDT,M3.2.0,M11.1.0";  // ← your timezone
```

The `HABIT_NAME` must exactly match one of these (copy-paste):
```
Out of bed by 7:30am
Make bed + open window
Omega-3, VitD, Creatine
10-min morning mobility
Minoxidil (AM)
Salad
Minoxidil (PM)
Tennis elbow rehab
1 French moment
10-min evening mobility
Neuropod
Statin, Magnesium, CoQ10
In bed by 11:00pm
```

### 5. Flash it
Plug in the D1 Mini via USB → **Upload** (→ arrow). Open Serial Monitor at 115200 baud to watch it connect and sync.

---

## How it works

1. **On power-up:** connects to WiFi, syncs time via NTP, reads today's state from Supabase, sets LED red or green
2. **Button press:** reads state → toggles this habit → writes back → updates LED
3. **LED meanings:**
   - 🔵 Blue = working / connecting
   - 🔴 Red = habit not done yet
   - 🟢 Green = habit done!
   - Rapid red flash = error (check Serial Monitor)

---

## Phase 2 upgrades (when you're ready)

### Battery-powered deep sleep
Add a wire from `D0 (GPIO16)` to `RST`. The chip wakes from deep sleep when RST is pulled low — wire your button to RST instead of D3. Change the end of `handleToggle()` to call `ESP.deepSleep(0)` instead of staying awake. Battery life: months on a small LiPo.

### Physical build
- **LiPo battery:** 500mAh is plenty. Wire through the D1 Mini's onboard charging circuit (JST connector or solder pads).
- **3D printed case:** Design around a ~35mm × 26mm × 8mm footprint for the D1 Mini. Leave a 12mm hole for the button, a small slot for the RGB LED, and a notch for the USB charging port.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Rapid red flash at startup | Check WiFi credentials in the sketch |
| Blue forever | NTP sync failing — check internet access |
| Green/red but button does nothing | Check D3 wiring; D3 must be HIGH at boot (don't connect to 3.3V directly) |
| "habit save failed" in browser | Button and browser are racing — one will win, refresh the page |
| Wrong day toggled | Check `TIMEZONE` string matches your timezone |
