import json

from config import (
    LORA_FREQUENCY,
    LORA_SPREADING_FACTOR,
    LORA_BANDWIDTH,
    LORA_CODING_RATE,
    LORA_PREAMBLE_LENGTH,
    LORA_CRC_ON,
    LORA_IQ_INVERTED,
    LORA_MAX_PAYLOAD_LENGTH,
    LORA_PUBLIC_NETWORK,
    LORA_LOW_DATA_RATE_OPTIMIZE,
)


class LoRaReceiver:
    def __init__(self, driver):
        self.driver = driver
        self.last_rssi = None

    def setup(self):
        self.driver.reset()
        self.driver.set_standby()

        # Waveshare SX1262 HAT은 DIO2를 RF switch 제어에 사용
        self.driver.set_dio2_as_rf_switch_ctrl(True)

        self.driver.set_packet_type_lora()

        # 감지기 Radio.SetPublicNetwork(false)에 맞춰 Private sync word 설정
        self.driver.set_lora_sync_word(public_network=LORA_PUBLIC_NETWORK)

        self.driver.set_rf_frequency(LORA_FREQUENCY)

        self.driver.set_modulation_params(
            spreading_factor=LORA_SPREADING_FACTOR,
            bandwidth=LORA_BANDWIDTH,
            coding_rate=LORA_CODING_RATE,
            low_data_rate_optimize=LORA_LOW_DATA_RATE_OPTIMIZE,
        )

        self.driver.set_packet_params(
            preamble_length=LORA_PREAMBLE_LENGTH,
            explicit_header=True,
            payload_length=LORA_MAX_PAYLOAD_LENGTH,
            crc_on=LORA_CRC_ON,
            iq_inverted=LORA_IQ_INVERTED,
        )

        self.driver.set_buffer_base_address(tx_base=0x00, rx_base=0x00)

        # 미리 필터링 설정
        irq_mask = (
            self.driver.IRQ_RX_DONE
            | self.driver.IRQ_TIMEOUT
            | self.driver.IRQ_CRC_ERROR
            | self.driver.IRQ_HEADER_ERROR
        )

        # RX_DONE, TIMEOUT, CRC_ERROR, HEADER_ERROR를 DIO1로 올리기
        self.driver.set_dio_irq_params(
            irq_mask=irq_mask,
            dio1_mask=irq_mask,
        )

        self.driver.start_rx_continuous()

    def receive(self):
        self.last_rssi = None

        # DIO1이 LOW면 아직 처리할 IRQ가 없는 상태
        if self.driver.read_dio1() == 0:
            return None

        irq_status = self.driver.get_irq_status()

        if irq_status == 0:
            return None

        try:
            if irq_status & self.driver.IRQ_RX_DONE:
                if irq_status & (self.driver.IRQ_CRC_ERROR | self.driver.IRQ_HEADER_ERROR):
                    return None

                payload_length, start_pointer = self.driver.get_rx_buffer_status()
                payload = self.driver.read_buffer(start_pointer, payload_length)

                # RSSI는 LoRa payload 내부 값이 아니라 게이트웨이가 실제 수신한 무선 신호 세기
                # 일부 수신 직후 타이밍에서 읽기 실패가 날 수 있으므로 payload 처리는 유지하고 로그에서 확인
                try:
                    self.last_rssi = self.driver.get_packet_rssi()
                except Exception as exc:
                    print(f"RSSI read error: {exc}", flush=True)
                    self.last_rssi = None

                return payload

            if irq_status & self.driver.IRQ_TIMEOUT:
                return None

            return None
        finally:
            # 에러가 나던 말던 IRQ를 지우고 다음 패킷 수신 대기로 복귀
            self.driver.clear_irq_status(irq_status)
            self.driver.set_rx(0xFFFFFF)

    def parse_payload(self, raw_payload):
        """
        감지기 LoRa payload를 dict로 파싱

        감지기 payload 예시:
        {
          "k":"hb" or "evt" or "join",
          "sid":"flame-001",
          "seq":12,
          "f":false,
          "t":24.63,
          "bat_pct":58,
          "s":"active"
        }
        """
        if isinstance(raw_payload, bytes):
            raw_payload = raw_payload.decode("utf-8", errors="strict")

        raw_payload = raw_payload.strip("\x00\r\n \t")
        event = json.loads(raw_payload)

        if not isinstance(event, dict):
            raise ValueError("LoRa payload must be a JSON object")

        return event
