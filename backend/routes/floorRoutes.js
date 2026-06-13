const express = require('express');
const router = express.Router();
const floorController = require('../controllers/floorController');

router.get('/', floorController.getFloors);
router.post('/', floorController.createFloor);
router.patch('/reorder', floorController.reorderFloors);
router.patch('/:id', floorController.updateFloor);
router.post('/:id/image', floorController.uploadFloorImage);
router.delete('/:id', floorController.deleteFloor);

module.exports = router;
