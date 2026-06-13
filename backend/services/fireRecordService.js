const pool = require('../config/db');

function isFireFlame(flameVal) {
  return flameVal === true || flameVal === 'true' || flameVal === 1 || flameVal === '1';
}

function toDisplayTypeByFlame(flameVal) {
  return isFireFlame(flameVal) ? '화재' : '화재 의심';
}

function toStatusByFlame(flameVal) {
  return isFireFlame(flameVal) ? 'alert' : 'suspect';
}

async function getAllRecords(query) {
  let sql = `
    SELECT
      id,
      device_id,
      flame_val,
      temp_val,
      floor_name,
      description,
      created_at
    FROM sensor_logs
    WHERE 1 = 1
  `;

  const params = [];

  if (query.date) {
    params.push(query.date);
    sql += ` AND DATE(created_at) = $${params.length}`;
  }

  if (query.type && query.type !== 'all') {
    if (query.type === '화재') {
      sql += ` AND flame_val::text IN ('true', '1')`;
    }
    if (query.type === '화재 의심' || query.type === '화재의심') {
      sql += ` AND COALESCE(flame_val::text, 'false') NOT IN ('true', '1')`;
    }
  }

  if (query.keyword) {
    params.push(`%${query.keyword}%`);
    sql += `
      AND (
        description ILIKE $${params.length}
        OR floor_name ILIKE $${params.length}
        OR device_id ILIKE $${params.length}
      )
    `;
  }

  sql += ` ORDER BY created_at DESC, id DESC`;

  const result = await pool.query(sql, params);

  return result.rows.map(row => ({
    id: row.id,
    device_id: row.device_id,
    floor: row.floor_name,
    floor_name: row.floor_name,
    title: row.description,
    location: row.description,
    flame_val: row.flame_val,
    temp_val: row.temp_val,
    flame: isFireFlame(row.flame_val) ? '감지' : '미감지',
    temp: row.temp_val,
    status: toStatusByFlame(row.flame_val),
    type: toDisplayTypeByFlame(row.flame_val),
    time: row.created_at,
    created_at: row.created_at
  }));
}

async function getRecordById(id) {
  const result = await pool.query(
    `
    SELECT
      id,
      device_id,
      flame_val,
      temp_val,
      floor_name,
      description,
      created_at
    FROM sensor_logs
    WHERE id = $1
    `,
    [id]
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0];

  return {
    id: row.id,
    device_id: row.device_id,
    floor: row.floor_name,
    floor_name: row.floor_name,
    title: row.description,
    location: row.description,
    flame_val: row.flame_val,
    temp_val: row.temp_val,
    flame: isFireFlame(row.flame_val) ? '감지' : '미감지',
    temp: row.temp_val,
    status: toStatusByFlame(row.flame_val),
    type: toDisplayTypeByFlame(row.flame_val),
    time: row.created_at,
    created_at: row.created_at
  };
}

async function createRecord(data) {
  const flameVal = data.status === 'suspect' ? false : (data.flame_val ?? true);

  const result = await pool.query(
    `
    INSERT INTO sensor_logs
    (device_id, flame_val, temp_val, floor_name, description, created_at)
    VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamp, NOW()))
    RETURNING *
    `,
    [
      data.device_id,
      flameVal,
      data.temp_val ?? null,
      data.floor_name || data.floor || null,
      data.description || data.location || data.title || null,
      data.created_at || data.time || null
    ]
  );

  return {
    ...result.rows[0],
    status: toStatusByFlame(result.rows[0].flame_val),
    type: toDisplayTypeByFlame(result.rows[0].flame_val)
  };
}

async function deleteRecord(id) {
  const result = await pool.query(
    `DELETE FROM sensor_logs WHERE id = $1 RETURNING *`,
    [id]
  );

  if (result.rows.length === 0) throw new Error('화재 기록을 찾을 수 없습니다.');
  return result.rows[0];
}

module.exports = {
  getAllRecords,
  getRecordById,
  createRecord,
  deleteRecord
};
