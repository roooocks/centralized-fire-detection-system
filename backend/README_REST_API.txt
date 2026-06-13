G1B4 REST API 서버

실행 방법
1. server 폴더로 이동
2. npm install
3. npm start

상태 5가지
1. 미수신
2. 생존
3. 정상
4. 화재의심
5. 화재

기능별 API

[감지기 관리]
GET    /api/sensors
GET    /api/sensors/:deviceId
POST   /api/sensors
PUT    /api/sensors/:deviceId
PATCH  /api/sensors/:deviceId
DELETE /api/sensors/:deviceId

[화재 기록 관리]
GET    /api/fire-records
GET    /api/fire-records/:id
POST   /api/fire-records
PUT    /api/fire-records/:id
PATCH  /api/fire-records/:id
DELETE /api/fire-records/:id

[게이트웨이 데이터 수신]
POST /api/gateway/heartbeat
POST /api/gateway/fire

테스트 예시

1. 생존 신호 저장
POST http://localhost:3000/api/gateway/heartbeat

{
  "device_id": "ABC123",
  "battery_level": 87,
  "signal_strength": -70,
  "received_at": "2026-05-06 18:30:00"
}

2. 화재 데이터 저장
POST http://localhost:3000/api/gateway/fire

{
  "device_id": "ABC123",
  "flame_val": 95,
  "gas_val": 40,
  "temp_val": 70,
  "detected_at": "2026-05-06 18:36:22"
}

3. 감지기 일부 수정
PATCH http://localhost:3000/api/sensors/ABC123

{
  "status": "생존"
}

주의
현재 버전은 메모리 저장 방식입니다.
서버를 끄면 데이터가 초기화됩니다.
DB 연결은 나중에 service 파일 내부 저장 부분만 DB 쿼리로 바꾸면 됩니다.
