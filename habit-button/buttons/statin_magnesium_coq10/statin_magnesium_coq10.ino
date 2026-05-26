// ═══════════════════════════════════════════════════════════════
//  Habit Button — Wemos D1 Mini (ESP8266)
//  Press the button → reads today's state from Supabase,
//  toggles this habit, writes it back, updates the LED.
//
//  LED:  green  = habit already done
//        red    = habit not done yet
//        blue   = connecting / working
//        rapid red flash = error
//
//  Phase 1 (prototype): USB-powered, stays awake, LED shows
//  live status. Press button to toggle.
// ═══════════════════════════════════════════════════════════════

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

// ── ✏️  Edit these for each button ─────────────────────────────

const char* WIFI_SSID     = "Fred";
const char* WIFI_PASSWORD = "PinkBear2";

// Paste the exact habit name from your tracker (case-sensitive):
const char* HABIT_NAME = "Statin, Magnesium, CoQ10";

// Your timezone string (POSIX format).
// Pacific:  "PST8PDT,M3.2.0,M11.1.0"
// Mountain: "MST7MDT,M3.2.0,M11.1.0"
// Central:  "CST6CDT,M3.2.0,M11.1.0"
// Eastern:  "EST5EDT,M4.1.0,M10.5.0"
const char* TIMEZONE = "EST5EDT,M3.2.0,M11.1.0";

// ── Supabase config (same for all buttons) ─────────────────────

const char* SUPABASE_URL = "https://qbyuyoiiuoaeinvfiudv.supabase.co";
const char* APP_SECRET   = "7265d62639a9ec3e37c5c3a2ac7e0e193aba9c00128efd719c59a78aebe2091e";

// ── Pin assignments ─────────────────────────────────────────────
//
//  Wemos D1 Mini pinout:
//
//    D1 Mini    GPIO    Use
//    ────────   ────    ───────────────────────────
//    D3         GPIO0   Button (to GND)  ← keep free at boot!
//    D5         GPIO14  LED Red   (220Ω to GND)
//    D6         GPIO12  LED Green (220Ω to GND)
//    D7         GPIO13  LED Blue  (220Ω to GND)
//
//  For a common-cathode RGB LED: R→D5, G→D6, B→D7, GND→GND
//  For two separate LEDs: Red→D5, Green→D6

const int PIN_BUTTON = D3;  // GPIO0 — pulled HIGH, LOW when pressed
const int PIN_R      = D5;
const int PIN_G      = D6;
const int PIN_B      = D7;

// ── Internal constants ──────────────────────────────────────────
const int  RESET_HOUR    = 3;    // habits roll over at 3am local
const long DEBOUNCE_MS   = 300;  // button debounce delay


// ── LED helpers ─────────────────────────────────────────────────

void setLED(bool r, bool g, bool b) {
  digitalWrite(PIN_R, r ? HIGH : LOW);
  digitalWrite(PIN_G, g ? HIGH : LOW);
  digitalWrite(PIN_B, b ? HIGH : LOW);
}

void ledRed()    { setLED(true,  false, false); }
void ledGreen()  { setLED(false, true,  false); }
void ledBlue()   { setLED(false, false, true);  }
void ledYellow() { setLED(true,  true,  false); }
void ledOff()    { setLED(false, false, false); }

void ledError() {
  for (int i = 0; i < 6; i++) {
    ledRed(); delay(120);
    ledOff(); delay(120);
  }
}


// ── Date/key helpers ────────────────────────────────────────────

// Returns "YYYY-MM-DD" adjusted for the 3am reset.
// Matches the getDayKey() logic in habit-tracker.html.
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

// Returns "YYYY-MM-DD" of the Monday that starts this week.
// Matches the getWeekKey() logic in habit-tracker.html.
String getWeekKey() {
  time_t now = time(nullptr);
  struct tm t;
  localtime_r(&now, &t);
  if (t.tm_hour < RESET_HOUR) now -= 86400;
  localtime_r(&now, &t);
  // tm_wday: 0=Sun, 1=Mon … 6=Sat  →  days since Monday
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

// Calls state-read, fills doc with the full state object.
// Returns true on success.
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

// Calls state-write with the full doc.  Returns true on success.
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

// Toggles the habit for today and updates the LED.
void handleToggle() {
  ledBlue();  // working…

  String dayKey  = getDayKey();
  String weekKey = getWeekKey();
  Serial.printf("dayKey=%s  weekKey=%s\n", dayKey.c_str(), weekKey.c_str());

  // 1. Read current state
  DynamicJsonDocument doc(4096);
  if (!readState(dayKey, weekKey, doc)) {
    ledError();
    return;
  }

  // 2. Toggle this habit
  bool wasDone = doc["daily"][HABIT_NAME].as<bool>();
  doc["daily"][HABIT_NAME] = !wasDone;
  Serial.printf("'%s' %s → %s\n", HABIT_NAME,
    wasDone ? "done" : "not done",
    wasDone ? "unmarking" : "marking done");

  // 3. Write back
  if (!writeState(doc)) {
    ledError();
    return;
  }

  // 4. Celebrate / show new state
  bool nowDone = !wasDone;
  if (nowDone) {
    // Brief white flash then settle on green
    for (int i = 0; i < 2; i++) {
      setLED(true, true, true); delay(80);
      ledOff();                  delay(80);
    }
    ledGreen();
  } else {
    // Just go back to red
    ledRed();
  }
}

// Reads today's state on boot/reconnect and sets the LED.
void refreshLED() {
  ledBlue();

  String dayKey  = getDayKey();
  String weekKey = getWeekKey();

  DynamicJsonDocument doc(4096);
  if (!readState(dayKey, weekKey, doc)) {
    ledError();
    ledRed();  // default to "not done" on error
    return;
  }

  bool isDone = doc["daily"][HABIT_NAME].as<bool>();
  Serial.printf("Current state of '%s': %s\n", HABIT_NAME, isDone ? "DONE" : "not done");
  isDone ? ledGreen() : ledRed();
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

  // Connect to WiFi
  ledBlue();
  Serial.printf("Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.printf("\nConnected! IP: %s\n", WiFi.localIP().toString().c_str());

  // HTTPS — skip cert verification for prototype.
  // (Fine on a trusted home network; swap for proper cert in v2.)
  wifiClient.setInsecure();

  // Sync time via NTP so getDayKey() / getWeekKey() are correct
  configTzTime(TIMEZONE, "pool.ntp.org", "time.nist.gov");
  Serial.print("Syncing NTP");
  while (time(nullptr) < 1000000000UL) {
    delay(300);
    Serial.print(".");
  }
  Serial.println(" done");

  // Attach button interrupt
  attachInterrupt(digitalPinToInterrupt(PIN_BUTTON), onButtonPress, FALLING);

  // Show today's status
  refreshLED();
}

void loop() {
  if (buttonPressed) {
    buttonPressed = false;
    handleToggle();
  }

  // Reconnect if WiFi dropped
  if (WiFi.status() != WL_CONNECTED) {
    ledBlue();
    Serial.println("WiFi lost, reconnecting…");
    WiFi.reconnect();
    while (WiFi.status() != WL_CONNECTED) delay(500);
    refreshLED();
  }

  delay(50);
}
