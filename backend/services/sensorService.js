const pool = require('../config/db');
const { toDbStatus, toDisplayStatus } = require('../config/status');

async function getAllSensors(query) {
  let sql = `
    SELECT 
      d.device_id,
      d.status,
      d.last_ping,
      d.description,
      d.x,
      d.y,
      d.floor_id,
      f.name AS floor_name,
      h.flame_val,
      h.temp_val,
      h.battery_level,
      h.signal_strength,
      h.received_at
    FROM devices d
    LEFT JOIN floor_table f ON d.floor_id = f.id
    LEFT JOIN LATERAL (
      SELECT *
      FROM heartbeat_logs h
      WHERE h.device_id = d.device_id
      ORDER BY h.received_at DESC
      LIMIT 1
    ) h ON true
    WHERE 1 = 1
  `;

  const params = [];

  if (query.floor_id) {
    params.push(query.floor_id);
    sql += ` AND d.floor_id = $${params.length}`;
  }

  if (query.status) {
    params.push(toDbStatus(query.status));
    sql += ` AND d.status = $${params.length}`;
  }

  if (query.keyword) {
    params.push(`%${query.keyword}%`);
    sql += ` AND (d.device_id ILIKE $${params.length} OR d.description ILIKE $${params.length})`;
  }

  sql += ` ORDER BY d.device_id`;

  const result = await pool.query(sql, params);

  return result.rows.map(row => ({
    ...row,
    status_label: toDisplayStatus(row.status)
  }));
}

async function getSensorById(deviceId) {
  const result = await pool.query(
    `
    SELECT 
      d.*,
      f.name AS floor_name
    FROM devices d
    LEFT JOIN floor_table f ON d.floor_id = f.id
    WHERE d.device_id = $1
    `,
    [deviceId]
  );

  const sensor = result.rows[0];

  if (!sensor) return null;

  return {
    ...sensor,
    status_label: toDisplayStatus(sensor.status)
  };
}

async function createSensor(data) {
  const status = toDbStatus(data.status);
  const exists = await getSensorById(data.device_id);

  if (exists) {
    throw new Error('이미 존재하는 감지기 ID입니다. 다른 ID를 입력해주세요.');
  }

  try {
    const result = await pool.query(
    `
    INSERT INTO devices
    (device_id, status, description, x, y, floor_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
    `,
    [
      data.device_id,
      status,
      data.description || null,
      data.x || null,
      data.y || null,
      data.floor_id || null
    ]
  );

    return {
      ...result.rows[0],
      status_label: toDisplayStatus(result.rows[0].status)
    };
  } catch (err) {
    if (err.code === '23505') {
      throw new Error('이미 존재하는 감지기 ID입니다. 다른 ID를 입력해주세요.');
    }
    throw err;
  }
}

async function updateSensor(deviceId, data) {
  const current = await getSensorById(deviceId);

  if (!current) {
    throw new Error('감지기를 찾을 수 없습니다.');
  }

  const status = data.status ? toDbStatus(data.status) : current.status;

  const result = await pool.query(
    `
    UPDATE devices
    SET
      status = $1,
      description = $2,
      x = $3,
      y = $4,
      floor_id = $5
    WHERE device_id = $6
    RETURNING *
    `,
    [
      status,
      data.description ?? current.description,
      data.x ?? current.x,
      data.y ?? current.y,
      data.floor_id ?? current.floor_id,
      deviceId
    ]
  );

  return {
    ...result.rows[0],
    status_label: toDisplayStatus(result.rows[0].status)
  };
}

async function deleteSensor(deviceId) {
  const result = await pool.query(
    `
    DELETE FROM devices
    WHERE device_id = $1
    RETURNING *
    `,
    [deviceId]
  );

  if (result.rows.length === 0) {
    throw new Error('감지기를 찾을 수 없습니다.');
  }

  return result.rows[0];
}

module.exports = {
  getAllSensors,
  getSensorById,
  createSensor,
  updateSensor,
  deleteSensor
};