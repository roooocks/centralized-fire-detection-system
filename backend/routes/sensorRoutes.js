const express = require('express');
const router = express.Router();
const sensorController = require('../controllers/sensorController');

router.get('/',           sensorController.getSensors);
router.get('/:deviceId',  sensorController.getSensor);
router.post('/',          sensorController.createSensor);
router.patch('/:deviceId', sensorController.updateSensor);
router.delete('/:deviceId', sensorController.deleteSensor);

module.exports = router;
