// ═══════════════════════════════════════════════════════════════
//  Habit Button — Wemos D1 Mini (ESP8266)
//  Statin, Magnesium, CoQ10
//
//  LED:  green        = habit done
//        red          = habit not done
//        pulsing blue = reminder (10:30pm – 11:59pm, if not done)
//        rapid red    = error
//
//  Reminder behaviour:
//    10:30pm → LED slowly pulses blue until button pressed or 11:59pm
//    11:59pm → pulse stops, LED goes red (habit counts as not done)
//    Button press → triple green blink, then solid green
// ═══════════════════════════════════════════════════════════════

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <math.h>

// ── ✏️  Edit these for each button ─────────────────────────────

const char* WIFI_SSID     = "Fred";
const char* WIFI_PASSWORD = "PinkBear2";

const char* HABIT_NAME = "Statin, Magnesium, CoQ10";

const char* TIMEZONE = "EST5EDT,M3.2.0,M11.1.0";

// ── Supabase config (same for all buttons) ─────────────────────

const char* SUPABASE_URL = "https://qbyuyoiiuoaeinvfiudv.supabase.co";
const char* APP_SECRET   = "7265d62639a9ec3e37c5c3a2ac7e0e193aba9c00128efd719c59a78aebe2091e";

// ── Pin assignments ─────────────────────────────────────────────

const int PIN_BUTTON = D3;   // GPIO0 — pulled HIGH, LOW when pressed
const int PIN_R      = D5;   // GPIO14
const int PIN_G      = D6;   // GPIO12
const int PIN_B      = D7;   // GPIO13

// ── Internal constants ──────────────────────────────────────────

const int  RESET_HOUR      = 3;     // habits roll over at 3am local
const long DEBOUNCE_MS     = 500;   // button debounce
const int  REMIND_START    = 22*60+30;  // 10:30pm in minutes-since-midnight
const int  REMIND_END      = 23*60+59;  // 11:59pm
const int  PULSE_PERIOD_MS = 4000;  // one full breathing cycle (slower = more natural)

// ── Runtime state ───────────────────────────────────────────────

bool habitDone      = false;  // local cache — updated on boot + every toggle
bool reminderActive = false;  // true while pulsing blue
bool autoExpired    = false;  // true after 11:59pm cutoff (resets next day)


// ── LED helpers ─────────────────────────────────────────────────

// Stop any PWM and set all pins digitally.
void setLED(bool r, bool g, bool b) {
  analogWrite(PIN_B, 0);  // clear any PWM on blue first
  digitalWrite(PIN_R, r ? HIGH : LOW);
  digitalWrite(PIN_G, g ? HIGH : LOW);
  digitalWrite(PIN_B, b ? HIGH : LOW);
}

void ledRed()   { setLED(true,  false, false); }
void ledGreen() { setLED(false, true,  false); }
void ledBlue()  { setLED(false, false, true);  }
void ledOff()   { setLED(false, false, false); }

void ledError() {
  for (int i = 0; i < 6; i++) {
    ledBlue(); delay(120);
    ledOff();  delay(120);
  }
}

// Slow sine-wave pulse on the blue channel.
// Call repeatedly from loop() while reminder is active.
void pulseBlueTick() {
  // Breathing curve: sine lifted to 0–1, then squared to spend more
  // time near the bottom (dim) and peak briefly — like a real breath.
  float phase = (millis() % PULSE_PERIOD_MS) / (float)PULSE_PERIOD_MS * TWO_PI;
  float s = 0.5f + 0.5f * sin(phase - HALF_PI);  // 0→1→0, starts at 0
  float brightness = s * s;                        // square for perceptual curve
  digitalWrite(PIN_R, LOW);
  digitalWrite(PIN_G, LOW);
  analogWrite(PIN_B, (int)(brightness * 900));     // cap at 900 — not blindingly bright
}

void ledTripleGreen() {
  for (int i = 0; i < 3; i++) {
    ledGreen(); delay(200);
    ledOff();   delay(150);
  }
  // LED stays off — bedroom-friendly
}


// ── Date/key helpers ────────────────────────────────────────────

String getDayKey() {
  time_t now = time(nullptr);
  struct tm t;
  localtime_r(&now, &t);
  if (t.tm_hour < RESET_HOUR) {
    now -= 86400;
    localtime_r(&now, &t);
  }
  char buf[11];
  strftime(buf, sizeof(buf), "%Y-%m-%d", &t);
  return String(buf);
}

String getWeekKey() {
  time_t now = time(nullptr);
  struct tm t;
  localtime_r(&now, &t);
  if (t.tm_hour < RESET_HOUR) now -= 86400;
  localtime_r(&now, &t);
  int daysToMon = (t.tm_wday == 0) ? 6 : t.tm_wday - 1;
  now -= (time_t)daysToMon * 86400;
  localtime_r(&now, &t);
  char buf[11];
  strftime(buf, sizeof(buf), "%Y-%m-%d", &t);
  return String(buf);
}


// ── Supabase helpers ────────────────────────────────────────────

WiFiClientSecure wifiClient;
HTTPClient http;

bool readState(const String& dayKey, const String& weekKey, JsonDocument& doc) {
  String url = String(SUPABASE_URL) + "/functions/v1/state-read";
  http.begin(wifiClient, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-habit-secret", APP_SECRET);

  String body = "{\"dayKey\":\"" + dayKey + "\",\"weekKey\":\"" + weekKey + "\"}";
  int code = http.POST(body);

  if (code != 200) {
    Serial.printf("[read] HTTP %d\n", code);
    http.end();
    return false;
  }

  String payload = http.getString();
  http.end();

  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    Serial.printf("[read] JSON error: %s\n", err.c_str());
    return false;
  }
  return true;
}

bool writeState(JsonDocument& doc) {
  String url = String(SUPABASE_URL) + "/functions/v1/state-write";
  http.begin(wifiClient, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-habit-secret", APP_SECRET);

  String body;
  serializeJson(doc, body);
  int code = http.POST(body);
  http.end();

  if (code != 200) {
    Serial.printf("[write] HTTP %d\n", code);
    return false;
  }
  return true;
}


// ── Button state ────────────────────────────────────────────────

volatile bool buttonPressed = false;
unsigned long lastPress     = 0;

IRAM_ATTR void onButtonPress() {
  unsigned long now = millis();
  if (now - lastPress > DEBOUNCE_MS) {
    buttonPressed = true;
    lastPress = now;
  }
}


// ── Core logic ──────────────────────────────────────────────────

void refreshLED() {
  ledBlue();

  String dayKey  = getDayKey();
  String weekKey = getWeekKey();

  DynamicJsonDocument doc(4096);
  if (!readState(dayKey, weekKey, doc)) {
    ledError();
    habitDone = false;
    ledOff();
    return;
  }

  habitDone = doc["daily"][HABIT_NAME].as<bool>();
  Serial.printf("Current state of '%s': %s\n", HABIT_NAME, habitDone ? "DONE" : "not done");
  ledOff();  // always off after boot — no light in bedroom
}

void handleToggle() {
  reminderActive = false;   // stop any pulse immediately

  ledBlue();

  String dayKey  = getDayKey();
  String weekKey = getWeekKey();
  Serial.printf("dayKey=%s  weekKey=%s\n", dayKey.c_str(), weekKey.c_str());

  DynamicJsonDocument doc(4096);
  if (!readState(dayKey, weekKey, doc)) {
    ledError();
    habitDone ? ledGreen() : ledOff();
    return;
  }

  bool wasDone = doc["daily"][HABIT_NAME].as<bool>();
  doc["daily"][HABIT_NAME] = !wasDone;
  Serial.printf("'%s' %s → %s\n", HABIT_NAME,
    wasDone ? "done" : "not done",
    wasDone ? "unmarking" : "marking done");

  if (!writeState(doc)) {
    ledError();
    habitDone ? ledGreen() : ledOff();
    return;
  }

  habitDone = !wasDone;

  if (habitDone) {
    ledTripleGreen();   // ✓ triple blink then solid green
  } else {
    ledOff();
  }
}

// Called every loop tick — manages the 10:30pm reminder window.
void checkReminder() {
  // Don't mess with LEDs if done or already expired
  if (habitDone || autoExpired) return;

  time_t now = time(nullptr);
  struct tm t;
  localtime_r(&now, &t);
  int totalMin = t.tm_hour * 60 + t.tm_min;

  // Daytime: make sure flags are clear
  if (totalMin >= RESET_HOUR * 60 && totalMin < REMIND_START) {
    reminderActive = false;
    autoExpired    = false;
    return;
  }

  // 11:59pm cutoff: stop pulse, habit stays not-done
  if (totalMin >= REMIND_END && !autoExpired) {
    autoExpired    = true;
    reminderActive = false;
    ledOff();
    Serial.println("11:59pm — habit expired as not done, LED off.");
    return;
  }

  // Reminder window: 10:30pm – 11:59pm
  if (totalMin >= REMIND_START && totalMin < REMIND_END) {
    reminderActive = true;
  }
}


// ── Arduino setup / loop ────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  Serial.printf("\n\nHabit Button starting — habit: %s\n", HABIT_NAME);

  pinMode(PIN_R, OUTPUT);
  pinMode(PIN_G, OUTPUT);
  pinMode(PIN_B, OUTPUT);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  ledOff();

  ledBlue();
  Serial.printf("Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.printf("\nConnected! IP: %s\n", WiFi.localIP().toString().c_str());

  wifiClient.setInsecure();

  configTzTime(TIMEZONE, "pool.ntp.org", "time.nist.gov");
  Serial.print("Syncing NTP");
  while (time(nullptr) < 1000000000UL) {
    delay(300);
    Serial.print(".");
  }
  Serial.println(" done");

  attachInterrupt(digitalPinToInterrupt(PIN_BUTTON), onButtonPress, FALLING);

  refreshLED();
}

void loop() {
  if (buttonPressed) {
    buttonPressed = false;
    handleToggle();
  }

  checkReminder();

  if (reminderActive) {
    pulseBlueTick();
  }

  if (WiFi.status() != WL_CONNECTED) {
    reminderActive = false;
    ledBlue();
    Serial.println("WiFi lost, reconnecting…");
    WiFi.reconnect();
    while (WiFi.status() != WL_CONNECTED) delay(500);
    refreshLED();
  }

  delay(20);  // tighter loop for smooth PWM pulse
}
