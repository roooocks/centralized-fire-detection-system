from datetime import datetime
import time

from config import *
from mqtt.client import MqttGatewayClient
from mqtt.topics import Topics

from lora.sx1262_driver import SX1262Driver
from lora.receiver import LoRaReceiver


VALID_PAYLOAD_TYPES = {"hb", "evt", "join"}
VALID_STATUSES = {"disconnect", "active", "suspect", "alert"}
HEARTBEAT_STATUSES = {"active", "disconnect"}
ALERT_STATUSES = {"suspect", "alert"}
JOIN_STATUSES = {"active"}


def now_ot():
    # 백엔드 전송용 발생 시각, 날짜와 시분초를 모두 포함
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def parse_bool(value):
    # JSON bool or 문자열 bool 값을 안전하게 bool로 변환
    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "y"}:
            return True
        if normalized in {"false", "0", "no", "n", ""}:
            return False

    return bool(value)


def normalize_payload_type(value):
    payload_type = str(value or "").strip().lower()

    if payload_type not in VALID_PAYLOAD_TYPES:
        raise ValueError("payload의 k는 hb, evt, join 중 하나여야 합니다.")

    return payload_type


def normalize_status(value):
    status = str(value or "active").strip().lower()

    if status not in VALID_STATUSES:
        # 감지기에서 NORMAL 같은 값을 보낼 경우 백엔드 규격의 active로 보정
        if status == "normal":
            return "active"
        return "active"

    return status


def normalize_battery_percent(raw_event):
    battery_percent = raw_event.get("bat_pct", raw_event.get("bp"))

    if battery_percent is None:
        raise ValueError("payload에 bat_pct가 없습니다.")

    battery_percent = int(round(float(battery_percent)))
    return max(0, min(100, battery_percent))


def normalize_rssi(rssi, raw_event):
    # 실제 LoRa 수신 RSSI가 있으면 그것을 우선 사용
    # MQTT 단독 테스트처럼 LoRa 메타데이터가 없을 때만 payload 내부 rssi를 보조로 사용
    if rssi is None:
        rssi = raw_event.get("rssi")

    if rssi is None:
        # RSSI 읽기 실패 때문에 heartbeat/alert 자체가 누락되는 것을 막기 위한 fallback
        # 실제 LoRa RSSI는 보통 음수 dBm 값이므로, 0이 보이면 수신 로그 확인하기
        return 0

    return int(round(float(rssi)))


def normalize_event(raw_event, rssi=None):
    """
    감지기 LoRa payload를 백엔드 MQTT payload 규격으로 변환

    감지기 입력:
      {"k":"hb","sid":"flame-001","seq":12,"f":false,"t":24.63,"bat_pct":58,"s":"active"}

    백엔드 출력:
      {"gid":"gateway-01","sid":"flame-001","f":false,"t":24.63,"bp":58,"rssi":-87,"s":"active","ot":"YYYY-MM-DD HH:MM:SS"}
    """
    sensor_id = raw_event.get("sid") or raw_event.get("sensor_id")
    if not sensor_id:
        raise ValueError("payload에 sid가 없습니다.")

    payload_type = normalize_payload_type(raw_event.get("k"))
    flame = raw_event.get("f", raw_event.get("flame", False))
    temperature = raw_event.get("t", raw_event.get("temperature", 0.0))
    status = normalize_status(raw_event.get("s", raw_event.get("status", "active")))

    payload = {
        "gid": GATEWAY_ID,
        "sid": str(sensor_id),
        "f": parse_bool(flame),
        "t": float(temperature),
        "bp": normalize_battery_percent(raw_event),
        "rssi": normalize_rssi(rssi, raw_event),
        "s": status,
        "ot": raw_event.get("ot") or now_ot(),
    }

    return payload_type, payload


def select_topic(payload_type, payload):
    sensor_id = payload["sid"]
    status = payload["s"]

    # 게이트웨이 > 백엔드 MQTT 토픽 선택 규칙
    # hb + active/disconnect    -> heartbeat
    # evt + suspect/alert       -> alert
    # join + active             -> join
    if payload_type == "hb" and status in HEARTBEAT_STATUSES:
        return Topics.SENSOR.HEARTBEAT(
            gateway_id=GATEWAY_ID,
            sensor_id=sensor_id,
        )

    if payload_type == "evt" and status in ALERT_STATUSES:
        return Topics.SENSOR.ALERT(
            gateway_id=GATEWAY_ID,
            sensor_id=sensor_id,
        )

    if payload_type == "join" and status in JOIN_STATUSES:
        return Topics.SENSOR.JOIN(
            gateway_id=GATEWAY_ID,
            sensor_id=sensor_id,
        )

    raise ValueError(f"MQTT topic 선택 규칙에 맞지 않습니다. k={payload_type}, s={status}")


def create_lora_driver():
    return SX1262Driver(
        spi_bus=LORA_SPI_BUS,
        spi_device=LORA_SPI_DEVICE,
        spi_speed=LORA_SPI_SPEED,
        reset_pin=LORA_RESET_PIN,
        busy_pin=LORA_BUSY_PIN,
        dio1_pin=LORA_DIO1_PIN,
        cs_pin=LORA_CS_PIN,
        txen_pin=LORA_TXEN_PIN,
    )


def main():
    mqtt_client = MqttGatewayClient(
        MQTT_HOST,
        MQTT_PORT,
        GATEWAY_ID,
    )

    lora_driver = create_lora_driver() # 칩과의 통신 준비
    receiver = LoRaReceiver(lora_driver) # LoRa 수신 준비

    mqtt_client.connect()
    receiver.setup() # LoRa 수신

    print("Gateway started", flush=True)

    last_wait_log = time.time()

    try:
        while True:
            raw_payload = receiver.receive() # 수신 받았음?

            # 아 안받았네;;
            if raw_payload is None:
                if RX_WAIT_LOG_INTERVAL_SEC > 0:
                    now = time.time()
                    if now - last_wait_log >= RX_WAIT_LOG_INTERVAL_SEC:
                        print("Waiting LoRa packet...", flush=True)
                        last_wait_log = now

                time.sleep(0.1)
                continue

            # 받 았 구 나
            print(f"LoRa RX raw: {raw_payload!r}", flush=True)

            try:
                raw_event = receiver.parse_payload(raw_payload)
                payload_type, mqtt_payload = normalize_event(
                    raw_event,
                    rssi=receiver.last_rssi,
                )
                topic = select_topic(payload_type, mqtt_payload)
            except Exception as exc:
                print(f"Payload parse/normalize error: {exc}", flush=True)
                continue

            mqtt_client.publish(
                topic=topic,
                payload=mqtt_payload,
            )

            print("LoRa -> MQTT", flush=True)
            print(f"Topic: {topic}", flush=True)
            print(f"Payload: {mqtt_payload}", flush=True)
    except KeyboardInterrupt:
        print("Stopped", flush=True)
    finally:
        mqtt_client.disconnect()
        lora_driver.close()


if __name__ == "__main__":
    main()
