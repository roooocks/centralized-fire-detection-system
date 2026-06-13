// ⚠️ 이 파일은 DB 연동 이후 사용되지 않습니다. (레거시 보존용)
const { SENSOR_STATUS } = require('../config/status');

const sensors = [
  {
    device_id: 'ABC123',
    floor: '1층',
    location: '1층 탕비실',
    status: SENSOR_STATUS.NO_SIGNAL,
    flame_val: null,
    gas_val: null,
    temp_val: null,
    battery_level: null,
    signal_strength: null,
    last_received_at: null
  },
  {
    device_id: 'DEF456',
    floor: '1층',
    location: '1층 로비',
    status: SENSOR_STATUS.NO_SIGNAL,
    flame_val: null,
    gas_val: null,
    temp_val: null,
    battery_level: null,
    signal_strength: null,
    last_received_at: null
  },
  {
    device_id: 'XYZ789',
    floor: '2층',
    location: '2층 서버실',
    status: SENSOR_STATUS.NO_SIGNAL,
    flame_val: null,
    gas_val: null,
    temp_val: null,
    battery_level: null,
    signal_strength: null,
    last_received_at: null
  },
  {
    device_id: 'QWE111',
    floor: '2층',
    location: '2층 회의실',
    status: SENSOR_STATUS.NO_SIGNAL,
    flame_val: null,
    gas_val: null,
    temp_val: null,
    battery_level: null,
    signal_strength: null,
    last_received_at: null
  }
];

const fireRecords = [];

module.exports = {
  sensors,
  fireRecords
};
