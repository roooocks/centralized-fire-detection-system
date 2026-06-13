# MQTT 단독 테스트용 CLI
# 실제 LoRa 수신 없이 백엔드 토픽, payload 규격만 확인할 때 사용

import argparse
from datetime import datetime

from config import (
    MQTT_HOST,
    MQTT_PORT,
    GATEWAY_ID,
)
from mqtt.client import MqttGatewayClient
from mqtt.topics import Topics

HEARTBEAT_STATUSES = {"active", "disconnect"}
ALERT_STATUSES = {"suspect", "alert"}
JOIN_STATUSES = {"active"}


def now_ot():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def create_mqtt_client():
    mqtt_client = MqttGatewayClient(
        MQTT_HOST,
        MQTT_PORT,
        GATEWAY_ID,
    )
    mqtt_client.connect()
    return mqtt_client


def build_payload(args):
    return {
        "gid": GATEWAY_ID,
        "sid": args.sensor_id,
        "f": args.flame == "true",
        "t": args.temperature,
        "bp": args.bp,
        "rssi": args.rssi,
        "s": args.status,
        "ot": args.ot or now_ot(),
    }


def publish_join(args):
    payload = build_payload(args)
    topic = Topics.SENSOR.JOIN(
        gateway_id=GATEWAY_ID,
        sensor_id=args.sensor_id,
    )

    mqtt_client = create_mqtt_client()
    mqtt_client.publish(topic, payload)
    mqtt_client.disconnect()

    print("Published SENSOR JOIN")
    print("Topic:", topic)
    print("Payload:", payload)


def publish_alert(args):
    payload = build_payload(args)
    topic = Topics.SENSOR.ALERT(
        gateway_id=GATEWAY_ID,
        sensor_id=args.sensor_id,
    )

    mqtt_client = create_mqtt_client()
    mqtt_client.publish(topic, payload)
    mqtt_client.disconnect()

    print("Published SENSOR ALERT")
    print("Topic:", topic)
    print("Payload:", payload)


def publish_heartbeat(args):
    payload = build_payload(args)
    topic = Topics.SENSOR.HEARTBEAT(
        gateway_id=GATEWAY_ID,
        sensor_id=args.sensor_id,
    )

    mqtt_client = create_mqtt_client()
    mqtt_client.publish(topic, payload)
    mqtt_client.disconnect()

    print("Published SENSOR HEARTBEAT")
    print("Topic:", topic)
    print("Payload:", payload)


def add_common_arguments(parser, status_choices, default_status=None):
    parser.add_argument("--sensor-id", required=True)
    parser.add_argument("--flame", choices=["true", "false"], required=True)
    parser.add_argument("--temperature", type=float, required=True)
    parser.add_argument(
        "--bp",
        type=int,
        required=True,
        help="Sensor battery percentage. Example: 58",
    )
    parser.add_argument(
        "--rssi",
        type=int,
        required=True,
        help="LoRa receive signal strength in dBm. Example: -87",
    )
    parser.add_argument(
        "--status",
        choices=sorted(status_choices),
        default=default_status,
        required=default_status is None,
    )
    parser.add_argument(
        "--ot",
        default=None,
        help="Optional occurrence time. Default: current local time, YYYY-MM-DD HH:MM:SS",
    )


def main():
    parser = argparse.ArgumentParser()

    subparsers = parser.add_subparsers(
        dest="command",
        required=True,
    )

    join_parser = subparsers.add_parser("join")
    add_common_arguments(join_parser, JOIN_STATUSES, default_status="active")
    join_parser.set_defaults(func=publish_join)

    alert_parser = subparsers.add_parser("alert")
    add_common_arguments(alert_parser, ALERT_STATUSES)
    alert_parser.set_defaults(func=publish_alert)

    heartbeat_parser = subparsers.add_parser("heartbeat")
    add_common_arguments(heartbeat_parser, HEARTBEAT_STATUSES)
    heartbeat_parser.set_defaults(func=publish_heartbeat)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
