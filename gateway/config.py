MQTT_HOST = "192.168.0.10"
MQTT_PORT = 1883

GATEWAY_ID = "gateway-01"

# ===== LoRa SPI 설정 =====
# Waveshare SX1262 868/915M LoRaWAN/GNSS HAT 기준
LORA_SPI_BUS = 0
LORA_SPI_DEVICE = 0
LORA_SPI_SPEED = 2_000_000

# ===== Waveshare SX1262 HAT GPIO 핀 =====
# BCM GPIO 번호 기준
# PIN MAP : https://www.waveshare.com/wiki/SX1262_XXXM_LoRaWAN/GNSS_HAT#Pinout_Definition
LORA_RESET_PIN = 18
LORA_BUSY_PIN = 20
LORA_CS_PIN = 21
LORA_DIO1_PIN = 16
LORA_TXEN_PIN = 6

# ===== LoRa PHY 설정 =====
# 감지기 송신 코드와 반드시 같아야 함
LORA_FREQUENCY = 921_000_000     # 한국 기준 920.9MHz ~ 923.3MHz
LORA_SPREADING_FACTOR = 10       # 확산 계수: 7~12, 클 수록 멀리 송신
LORA_BANDWIDTH = 125_000         # 대역폭: 125kHz, 250, 500 중 하나 / 노이즈 강함 + 배터리 절약 + 장거리 + 느림
LORA_CODING_RATE = "4/5"
LORA_PREAMBLE_LENGTH = 8         # 동기화 신호
LORA_CRC_ON = True
LORA_IQ_INVERTED = False
LORA_MAX_PAYLOAD_LENGTH = 255

# 감지기 Radio.SetPublicNetwork(false)에 대응 (중계기 없는 P2P 방식)
# False = Private sync word, True = Public sync word
LORA_PUBLIC_NETWORK = False

# SF10/BW125는 일반적으로 OFF
# SF11 이상 또는 심볼 시간이 길어지는 설정에서는 True가 안전합니다.
LORA_LOW_DATA_RATE_OPTIMIZE = LORA_SPREADING_FACTOR >= 11

# 수신 대기 로그 출력 간격입니다. 0이면 대기 로그를 출력하지 않습니다.
RX_WAIT_LOG_INTERVAL_SEC = 5
