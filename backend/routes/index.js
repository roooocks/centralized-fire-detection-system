const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const floorRoutes      = require('./floorRoutes');
const sensorRoutes     = require('./sensorRoutes');
const fireRecordRoutes = require('./fireRecordRoutes');
const gatewayRoutes    = require('./gatewayRoutes');
const authRoutes       = require('./authRoutes');

router.use('/floors',       floorRoutes);
router.use('/sensors',      sensorRoutes);
router.use('/fire-records', fireRecordRoutes);
router.use('/gateway',      gatewayRoutes);
router.use('/auth',         authRoutes);

router.get('/db-test', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ success: true, message: 'DB 연결 성공' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'DB 연결 실패: ' + err.message });
  }
});

module.exports = router;
