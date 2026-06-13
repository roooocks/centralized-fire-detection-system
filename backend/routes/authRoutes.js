const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.post('/login', async (req, res) => {
  try {
    const { user_id, userId, password } = req.body;
    const loginId = user_id || userId;

    if (!loginId || !password) {
      return res.status(400).json({ success: false, message: '아이디와 비밀번호를 입력해주세요.' });
    }

    const result = await pool.query(
      `SELECT id, name, user_id FROM users WHERE user_id = $1 AND password = $2 LIMIT 1`,
      [loginId, password]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    return res.json({ success: true, message: '로그인 성공', data: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: '로그인 처리 실패: ' + err.message });
  }
});

module.exports = router;
