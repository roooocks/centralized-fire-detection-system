const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function getAllFloors() {
  const result = await pool.query(
    'SELECT * FROM floor_table ORDER BY order_index ASC, id ASC'
  );
  return result.rows;
}

async function createFloor(name) {
  const result = await pool.query(
    `INSERT INTO floor_table (name, order_index)
     VALUES ($1, COALESCE((SELECT MAX(order_index) FROM floor_table), 0) + 1)
     RETURNING *`,
    [name]
  );
  return result.rows[0];
}

async function updateFloor(id, data) {
  const fields = [];
  const values = [];
  let idx = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(data.name);
  }
  if (data.order_index !== undefined) {
    fields.push(`order_index = $${idx++}`);
    values.push(Number(data.order_index));
  }
  if (data.image !== undefined) {
    fields.push(`image = $${idx++}`);
    values.push(data.image || null);
  }

  if (fields.length === 0) throw new Error('수정할 내용이 없습니다.');

  values.push(id);

  const result = await pool.query(
    `UPDATE floor_table SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );

  if (result.rows.length === 0) throw new Error('층을 찾을 수 없습니다.');
  return result.rows[0];
}

async function reorderFloors(items) {
  if (!Array.isArray(items)) throw new Error('items 배열이 필요합니다.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      await client.query(
        'UPDATE floor_table SET order_index = $1 WHERE id = $2',
        [Number(item.order_index), item.id]
      );
    }
    await client.query('COMMIT');
    return getAllFloors();
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function saveFloorImage(id, imageData, originalName) {
  if (!imageData || !imageData.startsWith('data:image/')) {
    throw new Error('이미지 데이터가 올바르지 않습니다.');
  }

  const match = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error('base64 이미지 형식이 아닙니다.');

  const mime = match[1];
  const base64 = match[2];
  const extFromMime = mime.split('/')[1].replace('jpeg', 'jpg');
  const safeName = String(originalName || `floor_${id}.${extFromMime}`).replace(/[^a-zA-Z0-9_.-]/g, '_');
  const fileName = `${Date.now()}_${safeName}`;

  const uploadDir = path.join(__dirname, '../../front/uploads/floors');
  fs.mkdirSync(uploadDir, { recursive: true });

  const filePath = path.join(uploadDir, fileName);
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));

  const publicPath = `/uploads/floors/${fileName}`;
  return updateFloor(id, { image: publicPath });
}

async function deleteFloor(id) {
  const result = await pool.query(
    'DELETE FROM floor_table WHERE id = $1 RETURNING *',
    [id]
  );
  if (result.rows.length === 0) throw new Error('층을 찾을 수 없습니다.');
  return result.rows[0];
}

module.exports = {
  getAllFloors,
  createFloor,
  updateFloor,
  reorderFloors,
  saveFloorImage,
  deleteFloor
};
