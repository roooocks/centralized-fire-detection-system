const express = require('express');
const cors = require('cors');
const path = require('path');

const apiRoutes = require('./routes');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' })); // 도면 이미지 base64 대비 limit 증가

app.use(express.static(path.join(__dirname, '../front')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../front/index.html'));
});

app.use('/api', apiRoutes);

app.get('/api/status', (req, res) => {
  res.json({
    message: 'G1B4 REST API Server',
    statusList: ['미수신', '생존', '정상', '화재 의심', '화재']
  });
});

module.exports = app;
