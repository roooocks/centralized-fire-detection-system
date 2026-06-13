const fireRecordService = require('../services/fireRecordService');
const { success, fail } = require('../utils/response');

async function getRecords(req, res) {
  try {
    const records = await fireRecordService.getAllRecords(req.query);
    return success(res, records, '화재 기록 조회 성공');
  } catch (err) {
    return fail(res, err.message, 500);
  }
}

async function getRecord(req, res) {
  try {
    const record = await fireRecordService.getRecordById(req.params.id);

    if (!record) {
      return fail(res, '화재 기록을 찾을 수 없습니다.', 404);
    }

    return success(res, record, '화재 기록 상세 조회 성공');
  } catch (err) {
    return fail(res, err.message, 500);
  }
}

async function createRecord(req, res) {
  try {
    const record = await fireRecordService.createRecord(req.body);
    return success(res, record, '화재 기록 저장 성공', 201);
  } catch (err) {
    return fail(res, err.message, 400);
  }
}

async function deleteRecord(req, res) {
  try {
    const record = await fireRecordService.deleteRecord(req.params.id);
    return success(res, record, '화재 기록 삭제 성공');
  } catch (err) {
    return fail(res, err.message, 404);
  }
}

module.exports = {
  getRecords,
  getRecord,
  createRecord,
  deleteRecord
};