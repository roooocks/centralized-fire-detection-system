const pool = require('../config/db');
const { DB_STATUS, toDbStatus, toDisplayStatus } = require('../config/status');

function normalizeTimestamp(value) {
  if (!value) return new Date();
  const parsed = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function normalizeFlame(value) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  return false;
}

function normalizeBattery(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

async function getDeviceFloorInfo(deviceId) {
  const result = await pool.query(
    `
    SELECT d.device_id, d.floor_id, d.description, f.name AS floor_name
    FROM devices d
    LEFT JOIN floor_table f ON d.floor_id = f.id
    WHERE d.device_id = $1
    `,
    [deviceId]
  );
  return result.rows[0] || null;
}

async function upsertDevice(data, forcedStatus) {
  const status = toDbStatus(forcedStatus || data.status || data.s || DB_STATUS.ACTIVE);
  const deviceId = data.device_id || data.sid;
  const description = data.description || deviceId;
  const lastPing = normalizeTimestamp(data.on_time || data.ot);

  const result = await pool.query(
    `
    INSERT INTO devices (device_id, status, last_ping, description, x, y, floor_id)
    VALUES ($1, $2, $3, $4, 50, 50, NULL)
    ON CONFLICT (device_id)
    DO UPDATE SET
      status = EXCLUDED.status,
      last_ping = EXCLUDED.last_ping,
      description = COALESCE(devices.description, EXCLUDED.description)
    RETURNING *
    `,
    [deviceId, status, lastPing, description]
  );

  return {
    ...result.rows[0],
    status_label: toDisplayStatus(result.rows[0].status)
  };
}

/**
 * heartbeat_logs는 최신 상태 확인용 테이블이라 같은 device_id는 누적 INSERT가 아니라 UPDATE 후,
 * 기존 row가 없을 때만 INSERT한다. UNIQUE 제약조건이 없어도 동작하게 UPDATE -> INSERT 방식으로 처리.
 */
async function upsertHeartbeatLog(deviceId, data) {
  const values = [
    normalizeFlame(data.flame_val ?? data.f),
    data.temp_val ?? data.t ?? null,
    normalizeBattery(data.battery_level ?? data.bp),
    data.signal_strength ?? data.rssi ?? null,
    normalizeTimestamp(data.on_time || data.ot),
    deviceId
  ];

  const updated = await pool.query(
    `
    UPDATE heartbeat_logs
    SET
      flame_val = $1,
      temp_val = $2,
      battery_level = $3,
      signal_strength = $4,
      received_at = $5
    WHERE device_id = $6
    RETURNING *
    `,
    values
  );

  if (updated.rows.length > 0) {
    return updated.rows[0];
  }

  const inserted = await pool.query(
    `
    INSERT INTO heartbeat_logs
    (device_id, flame_val, temp_val, battery_level, signal_strength, received_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
    `,
    [deviceId, values[0], values[1], values[2], values[3], values[4]]
  );

  return inserted.rows[0];
}

async function saveJoin(data) {
  const device = await upsertDevice(data, data.status || data.s || DB_STATUS.ACTIVE);
  const heartbeat = await upsertHeartbeatLog(device.device_id, data);

  return {
    ...device,
    flame_val: heartbeat.flame_val,
    temp_val: heartbeat.temp_val,
    battery_level: heartbeat.battery_level,
    signal_strength: heartbeat.signal_strength,
    received_at: heartbeat.received_at
  };
}

async function saveHeartbeat(data) {
  const device = await upsertDevice(data, data.status || data.s || DB_STATUS.ACTIVE);
  const heartbeat = await upsertHeartbeatLog(device.device_id, data);

  return {
    ...device,
    flame_val: heartbeat.flame_val,
    temp_val: heartbeat.temp_val,
    battery_level: heartbeat.battery_level,
    signal_strength: heartbeat.signal_strength,
    received_at: heartbeat.received_at
  };
}

async function saveEvent(data) {
  const rawStatus = data.status || data.s || (normalizeFlame(data.flame_val ?? data.f) ? DB_STATUS.ALERT : DB_STATUS.SUSPECT);
  const status = toDbStatus(rawStatus) === DB_STATUS.SUSPECT ? DB_STATUS.SUSPECT : DB_STATUS.ALERT;
  const eventFlame = status === DB_STATUS.ALERT ? 1 : normalizeFlame(data.flame_val ?? data.f);
  const device = await upsertDevice(data, status);
  const heartbeat = await upsertHeartbeatLog(device.device_id, { ...data, flame_val: eventFlame });
  const floorInfo = await getDeviceFloorInfo(device.device_id);
  const floorName = data.floor_name || data.floor || floorInfo?.floor_name || '미지정';
  const incomingDescription = data.description || data.location || data.title || null;
  const description =
    floorInfo?.description ||
    (incomingDescription && incomingDescription !== device.device_id ? incomingDescription : null) ||
    device.device_id;

  // 실제 sensor_logs 테이블에는 status, received_at 컬럼이 없으므로 존재하는 컬럼만 사용한다.
  const result = await pool.query(
    `
    INSERT INTO sensor_logs
    (device_id, flame_val, temp_val, floor_name, description, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
    `,
    [
      device.device_id,
      eventFlame,
      data.temp_val ?? data.t ?? null,
      floorName,
      description,
      normalizeTimestamp(data.on_time || data.ot)
    ]
  );

  return {
    ...result.rows[0],
    status,
    status_label: toDisplayStatus(status),
    battery_level: heartbeat.battery_level,
    signal_strength: heartbeat.signal_strength,
    received_at: result.rows[0].created_at
  };
}

async function saveSuspicious(data) {
  return saveEvent({ ...data, status: DB_STATUS.SUSPECT, flame_val: false });
}

async function saveFire(data) {
  return saveEvent({ ...data, status: DB_STATUS.ALERT, flame_val: true });
}

module.exports = {
  saveJoin,
  saveHeartbeat,
  saveEvent,
  saveSuspicious,
  saveFire,
  upsertDevice
};
