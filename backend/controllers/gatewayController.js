const gatewayService = require('../services/gatewayService');
const { success, fail } = require('../utils/response');

async function receiveHeartbeat(req, res) {
  try {
    const result = await gatewayService.saveHeartbeat(req.body);
    return success(res, result, '생존 신호 저장 성공', 201);
  } catch (err) {
    return fail(res, err.message, 500);
  }
}

async function receiveFireData(req, res) {
  try {
    const result = await gatewayService.saveEvent(req.body);
    return success(res, result, '센서 이벤트 저장 성공', 201);
  } catch (err) {
    return fail(res, err.message, 500);
  }
}

async function receiveJoin(req, res) {
  try {
    const result = await gatewayService.saveJoin(req.body);
    return success(res, result, '감지기 등록 신호 저장 성공', 201);
  } catch (err) {
    return fail(res, err.message, 500);
  }
}

module.exports = { receiveHeartbeat, receiveFireData, receiveJoin };
