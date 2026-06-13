const express = require('express');
const router = express.Router();
const fireRecordController = require('../controllers/fireRecordController');

router.get('/', fireRecordController.getRecords);
router.get('/:id', fireRecordController.getRecord);
router.post('/', fireRecordController.createRecord);
router.delete('/:id', fireRecordController.deleteRecord);

module.exports = router;