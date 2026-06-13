import json
import paho.mqtt.client as mqtt

class MqttGatewayClient:
    def __init__(self, host, port, gateway_id):
        self.host = host
        self.port = port
        self.gateway_id = gateway_id

        self.client = mqtt.Client(client_id=gateway_id)

    def connect(self):
        self.client.connect(self.host, self.port, keepalive=60)
        self.client.loop_start()

    def publish(self, topic, payload):
        self.client.publish(
            topic,
            json.dumps(payload, ensure_ascii=False)
        )

    def disconnect(self):
        self.client.loop_stop()
        self.client.disconnect()
