// 보드 문제 생길 시 다시 넣기
// https://resource.heltec.cn/download/package_heltec_esp32_index.json

// 핀 맵
// https://resource.heltec.cn/download/WiFi_LoRa_32_V3/Wi-Fi_LoRa32_V3.2_Pinmap.png

#include "Arduino.h"
#include "LoRaWan_APP.h"
#include "radio/radio.h"

// ===================== Deep Sleep 관련 =====================
#include "esp_sleep.h"
#include "driver/rtc_io.h"
#include "esp_system.h"  // esp_random() 사용

// ===================== OneWireNg (DS18B20용) =====================
// 기존 OneWire + DallasTemperature 대신 사용
#include "OneWireNg_CurrentPlatform.h"
#include "drivers/DSTherm.h"
#include "utils/Placeholder.h"

// ===================== PIN 설정 =====================
#define FLAME_PIN 7                  // 화염 센서 DO, Active-Low 기준
#define TEMP_PIN  48                 // DS18B20 DQ
#define FLAME_WAKE_GPIO GPIO_NUM_7   // Deep Sleep wakeup 설정용 화염 센서 GPIO

#define BAT_ADC_PIN 1                // Heltec V3 배터리 전압 읽기용 ADC_IN
#define BAT_ADC_CTRL_PIN 37          // Heltec V3 배터리 ADC 회로 제어용 GPIO

// ===================== 감지기 정보 =====================
#define SENSOR_ID "flame-002"        // 감지기 고유 ID

// ===================== Payload 타입 =====================
#define PAYLOAD_TYPE_JOIN       "join" // 설치/재인식 신호
#define PAYLOAD_TYPE_HEARTBEAT  "hb"   // 생존 신호
#define PAYLOAD_TYPE_FIRE_EVENT "evt"  // 화재/불꽃 감지 이벤트

// ===================== LoRa 설정 =====================
#define RF_FREQUENCY 921000000       // LoRa 송수신 주파수: 921 MHz

#define TX_OUTPUT_POWER 8            // 송신 출력(dBm)

#define LORA_BANDWIDTH 0             // 대역폭(kHz)인데, 낮을 수록 멀리간다
// 0: 125 kHz
// 1: 250 kHz
// 2: 500 kHz

#define LORA_SPREADING_FACTOR 10     // 확산 인자(SF). 높을수록 장거리/안정성 증가, 속도 감소

#define LORA_CODINGRATE 1            // 전송 중 에러 발생 시 복구 비용(에러 정정 부호) 비율
// 1: 4/5
// 2: 4/6
// 3: 4/7
// 4: 4/8

#define LORA_PREAMBLE_LENGTH 8             // LoRa 패킷 동기화용 preamble 길이 (송수신 타이밍 맞추기)
#define LORA_FIX_LENGTH_PAYLOAD_ON false   // false: 가변 길이 payload 사용
#define LORA_IQ_INVERSION_ON false         // 일반 P2P 통신에서는 보통 false 쓴다고 (수신쪽도)
#define TX_TIMEOUT_VALUE 3000              // Radio.Send() 자체의 TX timeout(ms)

// ======================= 디버깅 모드 =====================
// true = 실제 LoRa 송신은 하지 않고 Serial 로그만 출력
// false = 실제 LoRa 송신
#define DEBUG_NO_TX false

// true = 세부 로그 출력
// false = 핵심 로그만 출력하고 싶을 때 사용
#define DEBUG_VERBOSE true

// ===================== Deep Sleep 타이밍 =====================
// 테스트용: 60초
#define HEARTBEAT_INTERVAL_US (60ULL * 1000000ULL)

// 실전용: 6시간 = 6 * 60분 * 60초 * 1,000,000us
// #define HEARTBEAT_INTERVAL_US (6ULL * 60ULL * 60ULL * 1000000ULL)

// join 전송 횟수
#define JOIN_SEND_COUNT 3

// join 전송 사이의 기본 대기 시간
#define JOIN_BASE_DELAY_MS 2000

// join 전송 사이에 추가할 랜덤 지연 범위
#define JOIN_RANDOM_JITTER_MS 3000

// heartbeat 송신 전에 추가할 랜덤 지연 범위
#define HEARTBEAT_RANDOM_JITTER_MS 5000

// 화염 감지가 계속 true일 때 재확인 간격
#define FLAME_CLEAR_CHECK_DELAY_MS 5000

// 화염이 false로 바뀐 직후 간단한 안정화 대기 시간
#define FLAME_CLEAR_STABLE_DELAY_MS 300

// Serial Monitor 연결 대기 시간
// 실제 배터리 운용 시에는 500 이하로 줄여도 됨
#define SERIAL_BOOT_DELAY_MS 1500

// LoRa 송신 완료를 기다리는 최대 시간
#define TX_WAIT_TIMEOUT_MS 5000

// ===================== 배터리 잔량 설정 =====================
// Heltec V3 배터리 측정 회로는 VBAT을 저항 분압해서 ADC로 읽음.
// 프로젝트 payload에는 전압값을 보내지 않고, 대략적인 잔량 퍼센트만 보냄.
#define BATTERY_ADC_MULTIPLIER 4.90f  // 390K / 100K 분압 기준 보정값
#define BATTERY_ADC_STABLE_MS 100     // ADC 회로 활성화 후 안정화 대기 시간

// 1셀 Li-Po 기준 대략적인 범위.
// 실제 배터리 잔량은 전압과 완전히 선형은 아니므로 표시용으로만 사용.
#define BATTERY_EMPTY_MV 3300
#define BATTERY_FULL_MV  4200

// ===================== 전역 변수 =====================
RadioEvents_t RadioEvents;

// OneWireNg 객체
OneWireNg_CurrentPlatform oneWire(TEMP_PIN, false);

// DS18B20 드라이버
DSTherm tempDriver(oneWire);

// RTC_DATA_ATTR:
// Deep Sleep 이후에도 유지되는 변수
// 단, 완전 전원 차단 후에는 초기화됨
RTC_DATA_ATTR uint32_t seq = 0;       // LoRa 전송 순서
RTC_DATA_ATTR uint32_t bootCount = 0; // 부팅 횟수

// LoRa 송신 상태
volatile bool txDone = true;
volatile bool txSuccess = false;

// 센서 값 저장
bool flameDetected = false;
float temperatureC = -127.0;
int batteryPct = 0;

// 화염이 false가 될 때까지 Sleep을 지연시키는 런타임 flag
bool flameClearWaitFlag = false;

// ===================== 공통 로그 함수 =====================
void logLine() {
  Serial.println();
}

template <typename T>
void logLine(const T& message) {
  Serial.println(message);
}

void logVerbose() {
#if DEBUG_VERBOSE
  Serial.println();
#endif
}

template <typename T>
void logVerbose(const T& message) {
#if DEBUG_VERBOSE
  Serial.println(message);
#endif
}

// ===================== LoRa 콜백 =====================
void OnTxDone(void) {
  logLine("[LoRa] TX DONE");
  txDone = true;
  txSuccess = true;
  Radio.Sleep();
}

void OnTxTimeout(void) {
  logLine("[LoRa] TX TIMEOUT");
  txDone = true;
  txSuccess = false;
  Radio.Sleep();
}

// ===================== 초기화 =====================
void testRssiRead() {
  int16_t rssi = Radio.Rssi(MODEM_LORA);

  char logBuffer[80];
  snprintf(logBuffer, sizeof(logBuffer), "[LBT] RSSI = %d dBm", rssi);
  logLine(logBuffer);
}

void initSerial() {
  Serial.begin(115200);
  delay(SERIAL_BOOT_DELAY_MS);

  logLine();
  logLine("========================================");
  logLine("BOOT OK - Heltec LoRa 32 V3.2 Sensor TX");
  logLine("Deep Sleep Flame + Heartbeat + Join Jitter Version");
  logLine("========================================");
}

void initSensors() {
  pinMode(FLAME_PIN, INPUT_PULLUP);

  // 배터리 ADC 회로는 읽을 때만 켜고, 평소에는 꺼서 불필요한 소모를 줄임.
  pinMode(BAT_ADC_PIN, INPUT);
  pinMode(BAT_ADC_CTRL_PIN, OUTPUT);
  digitalWrite(BAT_ADC_CTRL_PIN, HIGH);

  analogReadResolution(12);
  // adcAttachPin(BAT_ADC_PIN);
  // analogSetPinAttenuation(BAT_ADC_PIN, ADC_11db);

  char logBuffer[80];

  logLine("[INIT] SENSOR INIT OK");

  snprintf(logBuffer, sizeof(logBuffer), "[INIT] FLAME_PIN = GPIO%d", FLAME_PIN);
  logVerbose(logBuffer);

  snprintf(logBuffer, sizeof(logBuffer), "[INIT] TEMP_PIN  = GPIO%d", TEMP_PIN);
  logVerbose(logBuffer);

  snprintf(logBuffer, sizeof(logBuffer), "[INIT] BAT_ADC_PIN = GPIO%d", BAT_ADC_PIN);
  logVerbose(logBuffer);
}

void initLoRa() {
  Mcu.begin(HELTEC_BOARD, SLOW_CLK_TPYE);
  logLine("[INIT] MCU INIT OK");

  RadioEvents.TxDone = OnTxDone;
  RadioEvents.TxTimeout = OnTxTimeout;

  Radio.Init(&RadioEvents);
  Radio.SetPublicNetwork(false);  // P2P 설정

  logLine("[INIT] RADIO INIT OK");

  Radio.SetChannel(RF_FREQUENCY);
  logLine("[INIT] CHANNEL SET: 921.0 MHz");

  Radio.SetTxConfig(
    MODEM_LORA,
    TX_OUTPUT_POWER,
    0,
    LORA_BANDWIDTH,
    LORA_SPREADING_FACTOR,
    LORA_CODINGRATE,
    LORA_PREAMBLE_LENGTH,
    LORA_FIX_LENGTH_PAYLOAD_ON,
    true,   // CRC ON
    0,
    0,
    LORA_IQ_INVERSION_ON,
    TX_TIMEOUT_VALUE
  );

  logLine("[INIT] P2P SENSOR TX READY");
}

// ===================== Wakeup 원인 확인 =====================
const char* getWakeupCauseText(esp_sleep_wakeup_cause_t cause) {
  switch (cause) {
    case ESP_SLEEP_WAKEUP_EXT0:
      return "FLAME_EXT0";
    case ESP_SLEEP_WAKEUP_TIMER:
      return "TIMER_HEARTBEAT";
    case ESP_SLEEP_WAKEUP_UNDEFINED:
      return "POWER_ON_OR_RESET";
    default:
      return "UNKNOWN_WAKEUP";
  }
}

void printWakeupInfo(esp_sleep_wakeup_cause_t cause) {
  char logBuffer[120];

  logLine();
  logLine("--------------- WAKEUP INFO ---------------");

  snprintf(logBuffer, sizeof(logBuffer), "BOOT COUNT: %lu", (unsigned long)bootCount);
  logLine(logBuffer);

  snprintf(logBuffer, sizeof(logBuffer), "WAKEUP CAUSE: %s", getWakeupCauseText(cause));
  logLine(logBuffer);

  logLine("-------------------------------------------");
  logLine();
}

// ===================== 센서 읽기 =====================
// 화염 센서
bool readFlameSensor() {
  int value = digitalRead(FLAME_PIN);

  // 대부분의 화염 센서 DO 모듈:
  // HIGH → 정상
  // LOW  → 화염 감지
  return value == LOW;
}

// DS18B20 온도 읽기 (OneWireNg 방식)
float readTemperatureC() {
  Placeholder<DSTherm::Scratchpad> scratchpad;

  OneWireNg::ErrorCode ec =
    tempDriver.convertTempAll(DSTherm::MAX_CONV_TIME, false);

  if (ec != OneWireNg::EC_SUCCESS) {
    logLine("[TEMP] TEMP CONVERT ERROR");
    return -127.0;
  }

  for (const auto& id : oneWire) {

    // DS18B20 family code = 0x28
    if (id[0] != 0x28) {
      continue;
    }

    ec = tempDriver.readScratchpad(id, scratchpad);

    if (ec != OneWireNg::EC_SUCCESS) {
      logLine("[TEMP] TEMP READ ERROR");
      return -127.0;
    }

    return scratchpad->getTemp() / 1000.0;
  }

  logLine("[TEMP] TEMP SENSOR NOT FOUND");
  return -127.0;
}

// 배터리 전압을 대략적인 잔량 퍼센트로 변환
// Li-Po는 전압과 잔량이 선형으로 떨어지지 않으므로 시연/표시용 근사값.
int batteryPercentFromMilliVolts(int batteryMv) {
  // 3300mV 미만은 거의 방전으로 처리
  if (batteryMv < 3300) return 0;

  // 3500mV 미만 예외 처리
  if (batteryMv < 3500) {
    if (batteryMv >= 3400) return 6;
    return 3;
  }

  // 4200mV 이상은 완충으로 처리
  if (batteryMv >= 4200) return 100;

  // 3500mV ~ 4199mV 구간은 50mV 단위로 배열 인덱스 매핑
  // 인덱스 0 = 3500mV, 1 = 3550mV, ... 13 = 4150mV
  static const int percentLookup[] = {
    12, 18, 26, 34, 42, 50, 58, 65, 72, 78, 85, 88, 92, 96
  };

  int index = (batteryMv - 3500) / 50;

  // 혹시 나중에 기준값을 수정했을 때를 대비한 안전장치
  int maxIndex = (sizeof(percentLookup) / sizeof(percentLookup[0])) - 1;
  if (index < 0) index = 0;
  if (index > maxIndex) index = maxIndex;

  return percentLookup[index];
}

// Heltec V3 보드 내장 배터리 ADC 읽기
// payload에는 전압값을 넣지 않고 batteryPct만 넣음.
int readBatteryPercent() {
  digitalWrite(BAT_ADC_CTRL_PIN, HIGH);
  delay(100);

  int adcMv = analogReadMilliVolts(BAT_ADC_PIN);

  digitalWrite(BAT_ADC_CTRL_PIN, LOW);

  int batteryMv = (int)(adcMv * BATTERY_ADC_MULTIPLIER);

#if DEBUG_VERBOSE
  char logBuffer[120];
  snprintf(
    logBuffer,
    sizeof(logBuffer),
    "[BAT] ADC: %d mV | BAT: %d mV | approx: %d%%",
    adcMv,
    batteryMv,
    batteryPercentFromMilliVolts(batteryMv)
  );
  logLine(logBuffer);
#endif

  return batteryPercentFromMilliVolts(batteryMv);
}

// 센서 전체 읽기
void readAllSensors() {
  char logBuffer[140];

  logLine("[SENSOR] READ START");

  flameDetected = readFlameSensor();
  temperatureC = readTemperatureC();
  batteryPct = readBatteryPercent();

  snprintf(
    logBuffer,
    sizeof(logBuffer),
    "[SENSOR] FLAME: %s | TEMP: %.2f C | BAT: %d%%",
    flameDetected ? "DETECTED" : "NORMAL",
    temperatureC,
    batteryPct
  );

  logLine(logBuffer);
  logLine("[SENSOR] READ END");
}

// ===================== 상태 판단 =====================
// 센서 값을 기준으로 감지기 상태를 판단함.
// 이 함수만 나중에 수정하면 화재 판단 기준을 집중적으로 바꿀 수 있음.
const char* judgeSensorStatus(bool flame, float temp) {
    // 화재 확정 수준
  if (flame && temp >= 31.0) {
    return "alert";
  }

  // DS18B20 일반 사용 범위를 벗어난 값
  // 현재 백엔드 상태 구조에 fault가 없으므로 suspect로 임시 처리.
  if (temp < -20.0 || temp > 80.0) {
    return "suspect";
  }

  // DS18B20을 읽지 못한 경우
  // disconnect는 원래 게이트웨이/백엔드 판단에 더 가깝지만,
  // 시연 단계에서는 센서값 없음 상태를 표현하기 위해 사용.
  if (temp <= -100.0) {
    return "disconnect";
  }

  // 화재 의심 수준
  if (flame && temp < 31.0) {
    return "suspect";
  }

  // 정상 작동 중
  return "active";
}

void printSensorStatus(const char* status) {
  char logBuffer[80];

  snprintf(logBuffer, sizeof(logBuffer), "[SENSOR] STATUS: %s", status);
  logLine(logBuffer);
}

// ===================== JSON 생성 =====================
// 감지기 → 게이트웨이 LoRa 전송용 payload.
// gid, ot는 게이트웨이가 MQTT로 백엔드에 보낼 때 추가하는 전제.
void buildPayload(
  char* buffer,
  size_t size,
  const char* type,
  const char* status
) {
  snprintf(
    buffer,
    size,
    "{"
      "\"k\":\"%s\","
      "\"sid\":\"%s\","
      "\"seq\":%lu,"
      "\"f\":%s,"
      "\"t\":%.2f,"
      "\"bat_pct\":%d,"
      "\"s\":\"%s\""
    "}",
    type,
    SENSOR_ID,
    (unsigned long)seq++,
    flameDetected ? "true" : "false",
    temperatureC,
    batteryPct,
    status
  );
}

// ===================== 랜덤 지연 =====================
// 여러 감지기가 동시에 송신하는 상황을 줄이기 위한 지연.
// fire evt는 즉시성이 중요하므로 이 함수를 사용하지 않음.
void applyRandomDelay(const char* reason, uint32_t maxJitterMs) {
  char logBuffer[120];

  if (maxJitterMs == 0) {
    return;
  }

  uint32_t jitterMs = esp_random() % maxJitterMs;

  snprintf(
    logBuffer,
    sizeof(logBuffer),
    "[DELAY] %s random jitter: %lu ms",
    reason,
    (unsigned long)jitterMs
  );
  logLine(logBuffer);

  delay(jitterMs);
}

// ===================== LoRa 송신 =====================
bool sendSensorDataBlocking(const char* type, const char* wakeReason) {
  char payload[180];
  char logBuffer[260];

  const char* status = judgeSensorStatus(flameDetected, temperatureC);  // 센서 데이터 가져오기
  printSensorStatus(status);

  buildPayload(payload, sizeof(payload), type, status); // 송신에서 쓸 데이터 json 형태로 변경

  logLine();
  logLine("--------------- TX BEFORE ---------------");

  snprintf(logBuffer, sizeof(logBuffer), "[TX] TYPE: %s", type);
  logLine(logBuffer);

  snprintf(logBuffer, sizeof(logBuffer), "[TX] WAKE_REASON: %s", wakeReason);
  logVerbose(logBuffer);

  snprintf(logBuffer, sizeof(logBuffer), "[TX] PAYLOAD: %s", payload);
  logLine(logBuffer);

  logLine("-----------------------------------------");

#if DEBUG_NO_TX
  logLine("[TX] DEBUG_NO_TX = true");
  logLine("[TX] LoRa SEND SKIPPED");
  logLine("--------------- TX AFTER ----------------");
  logLine("[TX] RESULT: DEBUG_SKIP");
  logLine("-----------------------------------------");
  logLine();

  return true;
#else
  txDone = false;
  txSuccess = false;

  Radio.Send((uint8_t*)payload, strlen(payload));

  // 송신이 끝날 때 까지 기다리기, 다만 TX_WAIT_TIMEOUT_MS(5초)까지만
  unsigned long startMs = millis();
  while (!txDone && (millis() - startMs < TX_WAIT_TIMEOUT_MS)) {
    Radio.IrqProcess(); // RadioEvents에서 설정한 콜백 함수가 여기서 쓰인다.
    delay(1);
  }

  // 콜백이 오지 않은 경우를 대비한 강제종료 (대비책)
  if (!txDone) {
    logLine("[TX] WAIT TIMEOUT - CALLBACK NOT RECEIVED");
    txSuccess = false;
    txDone = true;
    Radio.Sleep();
  }

  logLine("--------------- TX AFTER ----------------");

  snprintf(
    logBuffer,
    sizeof(logBuffer),
    "[TX] RESULT: %s",
    txSuccess ? "SUCCESS" : "FAILED"
  );
  logLine(logBuffer);

  logLine("-----------------------------------------");
  logLine();

  return txSuccess;
#endif
}

// ===================== 화염 감지 해제 대기 =====================
// 화염 센서가 계속 LOW인 상태에서 Deep Sleep에 들어가면,
// EXT0 wakeup 조건이 계속 true라서 즉시 다시 깨어날 수 있다
// 그래서 flameClearWaitFlag를 켜고 화염 감지가 false가 될 때까지 대기
void waitUntilFlameCleared() {
  pinMode(FLAME_PIN, INPUT_PULLUP);

  if (!readFlameSensor()) {
    return;
  }

  flameClearWaitFlag = true;

  logLine("[FIRE] Flame is still detected.");
  logLine("[FIRE] Stay awake until flame becomes false.");

  while (flameClearWaitFlag) {
    delay(FLAME_CLEAR_CHECK_DELAY_MS);

    if (readFlameSensor()) {
      logLine("[FIRE] Flame still true. Delay and recheck.");
      continue;
    }

    delay(FLAME_CLEAR_STABLE_DELAY_MS);

    if (!readFlameSensor()) {
      flameClearWaitFlag = false;
      logLine("[FIRE] Flame cleared. Deep Sleep can continue.");
    }
  }
}

// ===================== Deep Sleep 설정 =====================
void configureWakeupSources() {
  char logBuffer[140];

  logLine("[SLEEP] Configure wakeup sources");

  // 보드와 코어의 호환성이 심각하게 구려서 EXT0 단일 wakeup만 사용
  rtc_gpio_deinit(FLAME_WAKE_GPIO);       // 사용중인 기능들 off (초기화)

  // 불꽃 감지 센서 자체에 가변저항이 있어서 필요 X
  rtc_gpio_pullup_en(FLAME_WAKE_GPIO);    // pullup 설정 = 켜기
  rtc_gpio_pulldown_dis(FLAME_WAKE_GPIO); // pulldown 설정 = 끄기

  // 화염 센서가 LOW가 되면 Deep Sleep 종료
  esp_err_t extWakeResult = esp_sleep_enable_ext0_wakeup(FLAME_WAKE_GPIO, 0);
  if (extWakeResult == ESP_OK) {
    logLine("[SLEEP] EXT0 wakeup enabled: FLAME LOW");
  } else {
    snprintf(logBuffer, sizeof(logBuffer), "[SLEEP] EXT0 wakeup failed: %d", (int)extWakeResult);
    logLine(logBuffer);
  }

  // Heartbeat wakeup
  // HEARTBEAT_INTERVAL_US << 이 시간 지나면 알아서 깬다!
  esp_sleep_enable_timer_wakeup(HEARTBEAT_INTERVAL_US);

  logLine("[SLEEP] Timer wakeup enabled");
}

// ===================== Deep Sleep 진입 =====================
void enterDeepSleep(const char* reason) {
  char logBuffer[120];

  logLine();
  logLine("--------------- DEEP SLEEP ---------------");

  snprintf(logBuffer, sizeof(logBuffer), "[SLEEP] REASON: %s", reason);
  logLine(logBuffer);

  waitUntilFlameCleared();  // 화염 감지 센서 상태가 감지면 여기서 무한 뺑이
  configureWakeupSources(); // 감지 상태가 아니라면 다시 Deep Sleep 설정

  logLine("[SLEEP] Entering Deep Sleep now...");
  logLine("------------------------------------------");
  Serial.flush();

  esp_deep_sleep_start(); // 꿀잠자기
}

// ===================== Wakeup별 작업 =====================
void prepareTxModules() {
  initSensors();

#if !DEBUG_NO_TX
  initLoRa();
   testRssiRead();
#else
  logLine("[INIT] DEBUG_NO_TX = true, LoRa init skipped");
#endif
}

void sendCurrentSensorState(const char* defaultPayloadType, const char* wakeReason) {
  const char* payloadType = defaultPayloadType;

  // 어떤 이유로 깨어났든, 현재 화염이 감지되면 화재 이벤트로 우선 전송
  if (flameDetected) {
    payloadType = PAYLOAD_TYPE_FIRE_EVENT;
  }

  sendSensorDataBlocking(payloadType, wakeReason);
}

void sendJoinBurst(const char* wakeReason) {
  char logBuffer[120];

  snprintf(
    logBuffer,
    sizeof(logBuffer),
    "[JOIN] Start join burst. count=%d",
    JOIN_SEND_COUNT
  );
  logLine(logBuffer);

  for (int i = 0; i < JOIN_SEND_COUNT; i++) {
    snprintf(
      logBuffer,
      sizeof(logBuffer),
      "[JOIN] Send %d/%d",
      i + 1,
      JOIN_SEND_COUNT
    );
    logLine(logBuffer);

    // 첫 join도 랜덤 지연을 적용해서 여러 감지기 동시 부팅 충돌을 줄임.
    applyRandomDelay("join", JOIN_RANDOM_JITTER_MS);

    sendSensorDataBlocking(PAYLOAD_TYPE_JOIN, wakeReason);

    // 마지막 전송 뒤에는 바로 Deep Sleep으로 들어가면 되므로 기본 대기는 생략.
    if (i < JOIN_SEND_COUNT - 1) {
      logLine("[JOIN] Base delay before next join");
      delay(JOIN_BASE_DELAY_MS);
    }
  }

  logLine("[JOIN] Join burst finished");
}

void handleFlameWakeup(const char* wakeReason) {
  logLine("[WAKE] Flame EXT0 wakeup detected");
  logLine("[WAKE] Flame event transmission will start");

  prepareTxModules();
  readAllSensors();

  sendSensorDataBlocking(PAYLOAD_TYPE_FIRE_EVENT, wakeReason);
}

void handleHeartbeatWakeup(const char* wakeReason) {
  logLine("[WAKE] Timer wakeup detected");
  logLine("[WAKE] Heartbeat transmission will start");

  prepareTxModules();
  readAllSensors();

  // 화염이 감지되지 않은 일반 heartbeat에만 랜덤 지연을 적용.
  // 화염이 true면 sendCurrentSensorState()에서 evt로 바뀌므로 즉시성 우선.
  if (!flameDetected) {
    applyRandomDelay("heartbeat", HEARTBEAT_RANDOM_JITTER_MS);

    // 중요! jitter 중 화염이 새로 발생했을 수 있으므로 송신 직전에 다시 읽음
    readAllSensors();
  }

  sendCurrentSensorState(PAYLOAD_TYPE_HEARTBEAT, wakeReason);
}

void handlePowerOnOrReset(const char* wakeReason) {
  logLine("[WAKE] Power on or reset detected");
  logLine("[WAKE] Join burst transmission will start");

  logVerbose(wakeReason);

  // 전원 연결 또는 RST 재부팅 시 감지기 설치/재인식용 join을 여러 번 송신.
  // LoRa 유실 가능성을 고려해서 각 join 사이에 기본 지연과 랜덤 지연을 함께 사용.
  prepareTxModules();
  readAllSensors();

  // 전원 켜짐 직후라도 화염이 있으면 join보다 화재 이벤트 우선
  // if (flameDetected) {
  //   logLine("[WAKE] Flame detected during power on/reset. Fire event has priority.");
  //   sendSensorDataBlocking(PAYLOAD_TYPE_FIRE_EVENT, wakeReason);
  //   return;
  // }

  sendJoinBurst(wakeReason);
}

// ===================== 메인 =====================
void setup() {
  initSerial();

  bootCount++;

  // Deep Sleep에서 깨어난 뒤 FLAME wakeup 핀을 일반 GPIO로 다시 쓰기 위한 처리
  rtc_gpio_deinit(FLAME_WAKE_GPIO);

  esp_sleep_wakeup_cause_t wakeupCause = esp_sleep_get_wakeup_cause();
  const char* wakeReason = getWakeupCauseText(wakeupCause);

  printWakeupInfo(wakeupCause);

  switch (wakeupCause) {
    case ESP_SLEEP_WAKEUP_EXT0:
      handleFlameWakeup(wakeReason);
      break;
    case ESP_SLEEP_WAKEUP_TIMER:
      handleHeartbeatWakeup(wakeReason);
      break;
    case ESP_SLEEP_WAKEUP_UNDEFINED:
      handlePowerOnOrReset(wakeReason);
      break;
    default:
      logLine("[WAKE] Unknown wakeup cause");
      logLine("[WAKE] No transmission, go back to Deep Sleep");
      break;
  }

  enterDeepSleep("Wakeup job finished");
}

void loop() {
  // 이 구조에서는 loop를 사용하지 않음.
  // setup()에서 wakeup 원인 판단 → 작업 1회 수행 → Deep Sleep 진입.
}
