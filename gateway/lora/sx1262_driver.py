import time
import spidev
import lgpio

# IRQ 관련 내용은 8장
# 전체적인 opcode 관련 내용은 11장 ~ 13장
# https://cdn.sparkfun.com/assets/6/b/5/1/4/SX1262_datasheet.pdf

class SX1262Driver:
    # ===== SX1262 opcodes =====
    SET_STANDBY = 0x80
    SET_RX = 0x82
    SET_PACKET_TYPE = 0x8A
    SET_RF_FREQUENCY = 0x86
    SET_MODULATION_PARAMS = 0x8B
    SET_PACKET_PARAMS = 0x8C
    SET_DIO_IRQ_PARAMS = 0x08
    SET_BUFFER_BASE_ADDRESS = 0x8F
    SET_DIO2_AS_RF_SWITCH_CTRL = 0x9D
    GET_IRQ_STATUS = 0x12
    CLEAR_IRQ_STATUS = 0x02
    GET_RX_BUFFER_STATUS = 0x13
    GET_PACKET_STATUS = 0x14
    READ_BUFFER = 0x1E
    WRITE_REGISTER = 0x0D

    # ===== LoRa register addresses =====
    REG_LORA_SYNC_WORD = 0x0740

    # Radio.SetPublicNetwork(false) = Private sync word
    # Radio.SetPublicNetwork(true) = Public sync word
    LORA_SYNC_WORD_PRIVATE = 0x1424
    LORA_SYNC_WORD_PUBLIC = 0x3444

    # ===== Packet types =====
    PACKET_TYPE_LORA = 0x01

    # ===== Standby modes =====
    STDBY_RC = 0x00
    STDBY_XOSC = 0x01

    # ===== LoRa IRQ masks =====
    IRQ_TX_DONE = 0x0001
    IRQ_RX_DONE = 0x0002
    IRQ_PREAMBLE_DETECTED = 0x0004
    IRQ_SYNC_WORD_VALID = 0x0008
    IRQ_HEADER_VALID = 0x0010
    IRQ_HEADER_ERROR = 0x0020
    IRQ_CRC_ERROR = 0x0040
    IRQ_CAD_DONE = 0x0080
    IRQ_CAD_DETECTED = 0x0100
    IRQ_TIMEOUT = 0x0200
    IRQ_ALL = 0xFFFF

    # ===== LoRa parameter codes =====
    BW_CODES = {
        7_800: 0x00,
        10_400: 0x08,
        15_600: 0x01,
        20_800: 0x09,
        31_250: 0x02,
        41_700: 0x0A,
        62_500: 0x03,
        125_000: 0x04,
        250_000: 0x05,
        500_000: 0x06,
    }

    CR_CODES = {
        "4/5": 0x01,
        "4/6": 0x02,
        "4/7": 0x03,
        "4/8": 0x04,
    }

    def __init__(
        self,
        spi_bus,
        spi_device,
        spi_speed,
        reset_pin,
        busy_pin,
        dio1_pin,
        cs_pin=None,
        txen_pin=None,
    ):
        self.reset_pin = reset_pin
        self.busy_pin = busy_pin
        self.dio1_pin = dio1_pin
        self.cs_pin = cs_pin
        self.txen_pin = txen_pin

        self.gpio = lgpio.gpiochip_open(0)

        lgpio.gpio_claim_output(self.gpio, self.reset_pin)
        lgpio.gpio_claim_input(self.gpio, self.busy_pin)
        lgpio.gpio_claim_input(self.gpio, self.dio1_pin)

        if self.cs_pin is not None:
            lgpio.gpio_claim_output(self.gpio, self.cs_pin)
            lgpio.gpio_write(self.gpio, self.cs_pin, 1)

        if self.txen_pin is not None:
            lgpio.gpio_claim_output(self.gpio, self.txen_pin)
            # 수신 전용 게이트웨이이므로 TXEN은 기본 LOW
            lgpio.gpio_write(self.gpio, self.txen_pin, 0)

        self.spi = spidev.SpiDev()
        self.spi.open(spi_bus, spi_device)
        self.spi.max_speed_hz = spi_speed
        self.spi.mode = 0
        self.spi.bits_per_word = 8

        # Waveshare HAT의 SX1262 CS는 기본 CE0(GPIO8)이 아니라 BCM21
        # 때문에 spidev의 자동 CE 제어를 끄고, GPIO로 CS를 직접 제어
        if self.cs_pin is not None:
            self.spi.no_cs = True

    def reset(self):
        lgpio.gpio_write(self.gpio, self.reset_pin, 0)
        time.sleep(0.01)
        lgpio.gpio_write(self.gpio, self.reset_pin, 1)
        time.sleep(0.02)
        self.wait_busy()

    def wait_busy(self, timeout_sec=2.0):
        start = time.time()

        while lgpio.gpio_read(self.gpio, self.busy_pin) == 1:
            if time.time() - start > timeout_sec:
                raise TimeoutError("SX1262 BUSY timeout")
            time.sleep(0.0005)

    def read_dio1(self):
        return lgpio.gpio_read(self.gpio, self.dio1_pin)

    # 실제 칩과의 통신 담당 (읽기/쓰기 신경 안씀)
    def transfer(self, data):
        self.wait_busy()

        # HAT을 쓰는 경우 핀 직접 제어를 해줘야 한다고...
        if self.cs_pin is not None:
            lgpio.gpio_write(self.gpio, self.cs_pin, 0)
            time.sleep(0.000001)

        # 실제 통신
        rx = self.spi.xfer2(data)

        if self.cs_pin is not None:
            time.sleep(0.000001)
            lgpio.gpio_write(self.gpio, self.cs_pin, 1)

        self.wait_busy()
        return rx

    # 칩과의 쓰기 통신
    def command(self, opcode, params=None):
        if params is None:
            params = []
        return self.transfer([opcode] + params)

    # 칩과의 읽기 통신
    def read_command(self, opcode, read_length, params=None):
        if params is None:
            params = []

        # SX1262 읽기 명령은 opcode/parameter 뒤에 status용 dummy 1바이트 필요
        rx = self.transfer([opcode] + params + [0x00] + [0x00] * read_length)

        # 다만 실질적으로 필요한 값은 맨 뒤에 있는 값이라 -read_length만큼 가서 전부 읽는다.
        return rx[-read_length:] if read_length > 0 else []

    @staticmethod
    def _u16_bytes(value):
        return [(value >> 8) & 0xFF, value & 0xFF]

    @staticmethod
    def _u24_bytes(value):
        return [
            (value >> 16) & 0xFF,
            (value >> 8) & 0xFF,
            value & 0xFF,
        ]

    @staticmethod
    def _rf_frequency_bytes(frequency_hz):
        # SX1262 SetRfFrequency:
        # rf_freq = frequency_hz * 2^25 / 32MHz
        rf = round(frequency_hz * (1 << 25) / 32_000_000)
        return list(rf.to_bytes(4, "big"))

    def set_standby(self):
        self.command(self.SET_STANDBY, [self.STDBY_RC])

    def set_packet_type_lora(self):
        self.command(self.SET_PACKET_TYPE, [self.PACKET_TYPE_LORA])

    def write_register(self, address, data):
        self.command(
            self.WRITE_REGISTER,
            [
                (address >> 8) & 0xFF,
                address & 0xFF,
            ] + list(data),
        )

    def set_lora_sync_word(self, public_network=False):
        sync_word = (
            self.LORA_SYNC_WORD_PUBLIC
            if public_network
            else self.LORA_SYNC_WORD_PRIVATE
        )

        self.write_register(
            self.REG_LORA_SYNC_WORD,
            [
                (sync_word >> 8) & 0xFF,
                sync_word & 0xFF,
            ],
        )

    def set_dio2_as_rf_switch_ctrl(self, enabled=True):
        self.command(self.SET_DIO2_AS_RF_SWITCH_CTRL, [0x01 if enabled else 0x00])

    def set_rf_frequency(self, frequency_hz):
        self.command(self.SET_RF_FREQUENCY, self._rf_frequency_bytes(frequency_hz))

    def set_modulation_params(
        self,
        spreading_factor=7,
        bandwidth=125_000,
        coding_rate="4/5",
        low_data_rate_optimize=False,
    ):
        if spreading_factor < 5 or spreading_factor > 12:
            raise ValueError("spreading_factor must be between 5 and 12")

        if bandwidth not in self.BW_CODES:
            raise ValueError(f"unsupported LoRa bandwidth: {bandwidth}")

        if coding_rate not in self.CR_CODES:
            raise ValueError(f"unsupported LoRa coding rate: {coding_rate}")

        self.command(
            self.SET_MODULATION_PARAMS,
            [
                spreading_factor,
                self.BW_CODES[bandwidth],
                self.CR_CODES[coding_rate],
                0x01 if low_data_rate_optimize else 0x00,
            ],
        )

    def set_packet_params(
        self,
        preamble_length=8,
        explicit_header=True,
        payload_length=255,
        crc_on=True,
        iq_inverted=False,
    ):
        self.command(
            self.SET_PACKET_PARAMS,
            [
                (preamble_length >> 8) & 0xFF,
                preamble_length & 0xFF,
                0x00 if explicit_header else 0x01,
                payload_length & 0xFF,
                0x01 if crc_on else 0x00,
                0x01 if iq_inverted else 0x00,
            ],
        )

    def set_buffer_base_address(self, tx_base=0x00, rx_base=0x00):
        self.command(self.SET_BUFFER_BASE_ADDRESS, [tx_base & 0xFF, rx_base & 0xFF])

    def set_dio_irq_params(self, irq_mask, dio1_mask, dio2_mask=0x0000, dio3_mask=0x0000):
        self.command(
            self.SET_DIO_IRQ_PARAMS,
            self._u16_bytes(irq_mask)
            + self._u16_bytes(dio1_mask)
            + self._u16_bytes(dio2_mask)
            + self._u16_bytes(dio3_mask),
        )

    def get_irq_status(self):
        data = self.read_command(self.GET_IRQ_STATUS, 2)
        return (data[0] << 8) | data[1]

    def clear_irq_status(self, irq_mask=IRQ_ALL):
        self.command(self.CLEAR_IRQ_STATUS, self._u16_bytes(irq_mask))

    def set_rx(self, timeout=0xFFFFFF):
        # timeout 단위는 약 15.625us입니다. 0xFFFFFF는 continuous RX 용도로 사용합니다.
        self.command(self.SET_RX, self._u24_bytes(timeout))

    def get_rx_buffer_status(self):
        data = self.read_command(self.GET_RX_BUFFER_STATUS, 2)
        payload_length = data[0]
        rx_start_buffer_pointer = data[1]
        return payload_length, rx_start_buffer_pointer

    def get_packet_status(self):
        data = self.read_command(self.GET_PACKET_STATUS, 3)

        # SX1262 LoRa packet status 값은 0.5dB/0.25dB 단위로 인코딩되어 있습니다.
        rssi_pkt = -data[0] / 2.0
        snr_raw = data[1] if data[1] < 128 else data[1] - 256
        snr_pkt = snr_raw / 4.0
        signal_rssi_pkt = -data[2] / 2.0

        return {
            "rssi": rssi_pkt,
            "snr": snr_pkt,
            "signal_rssi": signal_rssi_pkt,
        }

    def get_packet_rssi(self):
        packet_status = self.get_packet_status()
        return int(round(packet_status["rssi"]))

    def read_buffer(self, offset, length):
        if length <= 0:
            return b""
        data = self.read_command(self.READ_BUFFER, length, params=[offset & 0xFF])
        return bytes(data)

    def start_rx_continuous(self):
        self.clear_irq_status(self.IRQ_ALL)
        self.set_rx(0xFFFFFF)

    def close(self):
        try:
            if self.cs_pin is not None:
                lgpio.gpio_write(self.gpio, self.cs_pin, 1)
            if self.txen_pin is not None:
                lgpio.gpio_write(self.gpio, self.txen_pin, 0)
        finally:
            self.spi.close()
            lgpio.gpiochip_close(self.gpio)
