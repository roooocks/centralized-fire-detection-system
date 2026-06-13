const http = require('http');
const { Server } = require('socket.io');
const mqtt = require('mqtt');

const app = require('./app');
const pool = require('./config/db');
const gatewayService = require('./services/gatewayService');
const { DB_STATUS } = require('./config/status');

const PORT = process.env.PORT || 3000;
// 백엔드 단독 MQTT 테스트: mqtt://127.0.0.1:1883
// 게이트웨이와 테스트: mqtt://192.168.0.10:1883
const MQTT_URL = process.env.MQTT_URL || 'mqtt://127.0.0.1:1883';

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

pool.query('SELECT NOW()', (err) => {
  if (err) {
    console.error('DB 연결 실패:', err.message);
  } else {
    console.log('DB 연결 성공');
  }
});

const mqttClient = mqtt.connect(MQTT_URL);

mqttClient.on('connect', () => {
  console.log('MQTT Broker 연결 성공:', MQTT_URL);

  mqttClient.subscribe(
    [
      'gateway/+/sensor/+/join',
      'gateway/+/sensor/+/heartbeat',
      'gateway/+/sensor/+/suspect',
      'gateway/+/sensor/+/alert'
    ],
    (err) => {
      if (err) {
        console.error('MQTT 토픽 구독 실패:', err.message);
      } else {
        console.log('MQTT 토픽 구독 성공');
        console.log('구독 토픽: gateway/+/sensor/+/join');
        console.log('구독 토픽: gateway/+/sensor/+/heartbeat');
        console.log('구독 토픽: gateway/+/sensor/+/suspect');
        console.log('구독 토픽: gateway/+/sensor/+/alert');
      }
    }
  );
});

function normalizeMqttPayload(topic, payload) {
  const topicParts = topic.split('/');
  const gid = topicParts[1];
  const sid = topicParts[3];
  const topicType = topicParts[4];

  const place =
    payload.description ||
    payload.place ||
    payload.location ||
    payload.floor_name ||
    sid;

  return {
    topic_type: topicType,
    gateway_id: payload.gid || gid,
    device_id: payload.sid || sid,
    flame_val: payload.flame ?? payload.f ?? false,
    temp_val: payload.temperature ?? payload.t ?? null,
    battery_level: payload.battery_level ?? payload.bat_pct ?? payload.bp ?? null,
    signal_strength: payload.signal_strength ?? payload.rssi ?? null,
    status: payload.status || payload.s || null,
    floor_name: payload.floor_name || null,
    description: place,
    on_time: payload.on_time || payload.ot || new Date().toISOString()
  };
}

mqttClient.on('message', async (topic, message) => {
  const messageString = message.toString('utf8');

  console.log('\n========== MQTT MESSAGE ==========');
  console.log('Topic:', topic);
  console.log('Message:', messageString);

  try {
    const payload = JSON.parse(messageString);
    const data = normalizeMqttPayload(topic, payload);

    if (data.topic_type === 'join') {
      const result = await gatewayService.saveJoin({ ...data, status: data.status || DB_STATUS.ACTIVE });
      const sendData = { ...data, ...result, status: result.status || DB_STATUS.ACTIVE, type: '등록', time: data.on_time };
      io.emit('heartbeat-update', sendData);
      console.log('MQTT 등록 신호 DB 저장 및 프론트 전송 완료');
    }

    if (data.topic_type === 'heartbeat') {
      const result = await gatewayService.saveHeartbeat({ ...data, status: data.status || DB_STATUS.ACTIVE });
      const sendData = { ...data, ...result, status: result.status || DB_STATUS.ACTIVE, type: '생존', time: data.on_time };
      io.emit('heartbeat-update', sendData);
      console.log('MQTT 생존 신호 DB 저장 및 프론트 전송 완료');
    }

    if (data.topic_type === 'alert') {
      if (data.status == 'suspect') {
        const result = await gatewayService.saveSuspicious({ ...data, status: DB_STATUS.SUSPECT });
        const sendData = { ...data, ...result, status: DB_STATUS.SUSPECT, type: '화재 의심', time: data.on_time };
        io.emit('suspicious-update', sendData);
        console.log('MQTT 화재 의심 신호 DB 저장 및 프론트 전송 완료');
      }
      else if (data.status == 'alert') {
        const result = await gatewayService.saveFire({ ...data, status: DB_STATUS.ALERT });
        const sendData = { ...data, ...result, status: DB_STATUS.ALERT, type: '화재', time: data.on_time };
        io.emit('fire-update', sendData);
        console.log('MQTT 화재 신호 DB 저장 및 프론트 전송 완료');
      }
    }
  } catch (err) {
    console.error('MQTT 메시지 처리 실패:', err.message);
  }

  console.log('==================================\n');
});

mqttClient.on('error', (err) => {
  console.error('MQTT 에러:', err.message);
});

mqttClient.on('reconnect', () => {
  console.log('MQTT 재연결 시도 중...');
});

mqttClient.on('close', () => {
  console.log('MQTT 연결 종료');
});

function normalizeSocketPayload(payload, type) {
  return {
    topic_type: type,
    gateway_id: payload.gateway_id || payload.gid || 'socket-test',
    device_id: payload.device_id || payload.sid,
    flame_val: payload.flame_val ?? payload.flame ?? payload.f ?? false,
    temp_val: payload.temp_val ?? payload.temperature ?? payload.t ?? null,
    battery_level: payload.battery_level ?? payload.bat_pct ?? payload.bp ?? null,
    signal_strength: payload.signal_strength ?? payload.rssi ?? null,
    status: payload.status || payload.s || null,
    floor_name: payload.floor_name || payload.floor || null,
    description: payload.description || payload.location || payload.title || payload.device_id || payload.sid,
    on_time: payload.on_time || payload.ot || payload.received_at || payload.detected_time || payload.fire_time || payload.time || new Date().toISOString()
  };
}

io.on('connection', (socket) => {
  console.log('소켓 연결 성공:', socket.id);

  socket.on('gateway-heartbeat', async (payload) => {
    try {
      const data = normalizeSocketPayload(payload || {}, 'heartbeat');
      const result = await gatewayService.saveHeartbeat({ ...data, status: data.status || DB_STATUS.ACTIVE });
      const sendData = { ...data, ...result, status: result.status || DB_STATUS.ACTIVE, type: '생존', time: data.on_time };
      io.emit('heartbeat-update', sendData);
    } catch (err) {
      console.error('Socket 생존 신호 처리 실패:', err.message);
      socket.emit('gateway-error', { message: err.message });
    }
  });

  socket.on('gateway-suspicious', async (payload) => {
    try {
      const data = normalizeSocketPayload(payload || {}, 'suspect');
      const result = await gatewayService.saveSuspicious({ ...data, status: DB_STATUS.SUSPECT });
      const sendData = { ...data, ...result, status: DB_STATUS.SUSPECT, type: '화재 의심', time: data.on_time };
      io.emit('suspicious-update', sendData);
    } catch (err) {
      console.error('Socket 화재 의심 신호 처리 실패:', err.message);
      socket.emit('gateway-error', { message: err.message });
    }
  });

  socket.on('gateway-fire', async (payload) => {
    try {
      const data = normalizeSocketPayload(payload || {}, 'alert');
      const result = await gatewayService.saveFire({ ...data, status: DB_STATUS.ALERT });
      const sendData = { ...data, ...result, status: DB_STATUS.ALERT, type: '화재', time: data.on_time };
      io.emit('fire-update', sendData);
    } catch (err) {
      console.error('Socket 화재 신호 처리 실패:', err.message);
      socket.emit('gateway-error', { message: err.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('소켓 연결 해제:', socket.id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`REST API + Socket + MQTT server start: http://localhost:${PORT}`);
  console.log(`MQTT Broker: ${MQTT_URL}`);
});
