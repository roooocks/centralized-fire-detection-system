const sensorService = require('../services/sensorService');
const { success, fail } = require('../utils/response');

async function getSensors(req, res) {
  try {
    const sensors = await sensorService.getAllSensors(req.query);
    return success(res, sensors, '감지기 목록 조회 성공');
  } catch (err) {
    return fail(res, err.message, 500);
  }
}

async function getSensor(req, res) {
  try {
    const sensor = await sensorService.getSensorById(req.params.deviceId);

    if (!sensor) {
      return fail(res, '감지기를 찾을 수 없습니다.', 404);
    }

    return success(res, sensor, '감지기 조회 성공');
  } catch (err) {
    return fail(res, err.message, 500);
  }
}

async function createSensor(req, res) {
  try {
    const sensor = await sensorService.createSensor(req.body);
    return success(res, sensor, '감지기 등록 성공', 201);
  } catch (err) {
    return fail(res, err.message, 400);
  }
}

async function updateSensor(req, res) {
  try {
    const sensor = await sensorService.updateSensor(req.params.deviceId, req.body);
    return success(res, sensor, '감지기 수정 성공');
  } catch (err) {
    return fail(res, err.message, 400);
  }
}

async function deleteSensor(req, res) {
  try {
    const sensor = await sensorService.deleteSensor(req.params.deviceId);
    return success(res, sensor, '감지기 삭제 성공');
  } catch (err) {
    return fail(res, err.message, 404);
  }
}

module.exports = {
  getSensors,
  getSensor,
  createSensor,
  updateSensor,
  deleteSensor
};