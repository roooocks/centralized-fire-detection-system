const DB_STATUS = {
  DISCONNECT: 'disconnect',
  ACTIVE: 'active',
  SUSPECT: 'suspect',
  ALERT: 'alert'
};

const STATUS_LABEL = {
  disconnect: '미수신',
  active: '생존',
  suspect: '화재 의심',
  alert: '화재'
};

function toDbStatus(status) {
  if (!status) return DB_STATUS.DISCONNECT;

  if (status === '미수신') return DB_STATUS.DISCONNECT;
  if (status === '생존') return DB_STATUS.ACTIVE;
  if (status === '화재 의심') return DB_STATUS.SUSPECT;
  if (status === '화재의심') return DB_STATUS.SUSPECT;
  if (status === '화재') return DB_STATUS.ALERT;

  if (Object.values(DB_STATUS).includes(status)) {
    return status;
  }

  return DB_STATUS.DISCONNECT;
}

function toDisplayStatus(status) {
  return STATUS_LABEL[status] || status;
}

module.exports = {
  DB_STATUS,
  STATUS_LABEL,
  toDbStatus,
  toDisplayStatus
};