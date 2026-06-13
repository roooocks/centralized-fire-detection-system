class Topics:
    class SENSOR:
        @staticmethod
        def JOIN(gateway_id, sensor_id):
            return f"gateway/{gateway_id}/sensor/{sensor_id}/join"

        @staticmethod
        def HEARTBEAT(gateway_id, sensor_id):
            return f"gateway/{gateway_id}/sensor/{sensor_id}/heartbeat"

        @staticmethod
        def ALERT(gateway_id, sensor_id):
            return f"gateway/{gateway_id}/sensor/{sensor_id}/alert"

    class GATEWAY:
        @staticmethod
        def STATUS(gateway_id):
            return f"gateway/{gateway_id}/status"

    class WILDCARD:
        ALL_SENSOR_JOIN = "gateway/+/sensor/+/join"
        ALL_SENSOR_HEARTBEAT = "gateway/+/sensor/+/heartbeat"
        ALL_SENSOR_ALERT = "gateway/+/sensor/+/alert"
        ALL_GATEWAY_STATUS = "gateway/+/status"
