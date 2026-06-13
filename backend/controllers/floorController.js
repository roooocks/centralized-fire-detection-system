const floorService = require('../services/floorService');
const { success, fail } = require('../utils/response');

async function getFloors(req, res) {
  try {
    const floors = await floorService.getAllFloors();
    return success(res, floors, '층 목록 조회 성공');
  } catch (err) {
    return fail(res, err.message, 500);
  }
}

async function createFloor(req, res) {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return fail(res, '층 이름은 필수입니다.', 400);
    const floor = await floorService.createFloor(name.trim());
    return success(res, floor, '층 추가 성공', 201);
  } catch (err) {
    return fail(res, err.message, 400);
  }
}

async function updateFloor(req, res) {
  try {
    const floor = await floorService.updateFloor(req.params.id, req.body);
    return success(res, floor, '층 수정 성공');
  } catch (err) {
    return fail(res, err.message, 404);
  }
}

async function reorderFloors(req, res) {
  try {
    const floors = await floorService.reorderFloors(req.body.items);
    return success(res, floors, '층 순서 저장 성공');
  } catch (err) {
    return fail(res, err.message, 400);
  }
}

async function uploadFloorImage(req, res) {
  try {
    const floor = await floorService.saveFloorImage(req.params.id, req.body.imageData, req.body.fileName);
    return success(res, floor, '도면 이미지 저장 성공');
  } catch (err) {
    return fail(res, err.message, 400);
  }
}

async function deleteFloor(req, res) {
  try {
    const floor = await floorService.deleteFloor(req.params.id);
    return success(res, floor, '층 삭제 성공');
  } catch (err) {
    return fail(res, err.message, 404);
  }
}

module.exports = {
  getFloors,
  createFloor,
  updateFloor,
  reorderFloors,
  uploadFloorImage,
  deleteFloor
};
