const express = require('express');
const router = express.Router();
const gatewayController = require('../controllers/gatewayController');

router.post('/join', gatewayController.receiveJoin);
router.post('/heartbeat', gatewayController.receiveHeartbeat);
router.post('/fire', gatewayController.receiveFireData);

module.exports = router;
