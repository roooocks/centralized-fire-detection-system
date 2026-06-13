-- G1B4 화재 감지 시스템 DB 초기화/보정 스크립트
-- PostgreSQL에서 실행하세요.

CREATE TABLE users (
	id serial4 NOT NULL,
	"name" varchar(100) NOT NULL,
	user_id varchar(50) NOT NULL,
	"password" varchar(255) NOT NULL,
	created_at timestamp DEFAULT now() NULL,
	CONSTRAINT users_pkey PRIMARY KEY (id),
	CONSTRAINT users_user_id_key UNIQUE (user_id)
);


CREATE TABLE floor_table (
	id serial4 NOT NULL,
	"name" varchar(50) NOT NULL,
	order_index int4 NOT NULL,
	image text NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT floor_table_pkey PRIMARY KEY (id)
);


CREATE TABLE devices (
	device_id varchar(50) NOT NULL,
	status varchar(20) DEFAULT 'disconnect'::character varying NULL,
	last_ping timestamp NULL,
	description varchar(255) NULL,
	x float4 NULL,
	y float4 NULL,
	floor_id int4 NULL,
	CONSTRAINT chk_status_values CHECK (((status)::text = ANY ((ARRAY['disconnect'::character varying, 'active'::character varying, 'alert'::character varying, 'suspect'::character varying])::text[]))),
	CONSTRAINT devices_pkey PRIMARY KEY (device_id)
);
ALTER TABLE devices ADD CONSTRAINT fk_device_floor FOREIGN KEY (floor_id) REFERENCES floor_table(id) ON DELETE SET NULL;


CREATE TABLE heartbeat_logs (
	id serial4 NOT NULL,
	device_id varchar(50) NOT NULL,
	flame_val bool NULL,
	temp_val float4 NULL,
	battery_level float8 NULL,
	signal_strength float8 NULL,
	received_at timestamp DEFAULT now() NULL,
	CONSTRAINT heartbeat_logs_pkey PRIMARY KEY (id)
);
ALTER TABLE heartbeat_logs ADD CONSTRAINT fk_heartbeat_device FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE;


CREATE TABLE sensor_logs (
	id serial4 NOT NULL,
	device_id varchar(50) NOT NULL,
	flame_val bool NULL,
	temp_val float8 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	floor_name varchar(50) NULL,
	description varchar(255) NULL,
	CONSTRAINT sensor_logs_pkey PRIMARY KEY (id)
);

-- 기존 DB 보정
-- sensor_logs 실제 테이블에는 status, received_at 컬럼이 없으므로 백엔드도 해당 컬럼을 사용하지 않습니다.
ALTER TABLE floor_table ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE floor_table ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;

ALTER TABLE devices ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'disconnect';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_ping TIMESTAMP;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS description VARCHAR(200);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS x FLOAT DEFAULT 50;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS y FLOAT DEFAULT 50;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS floor_id INTEGER REFERENCES floor_table(id) ON DELETE SET NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE heartbeat_logs ADD COLUMN IF NOT EXISTS flame_val FLOAT;
ALTER TABLE heartbeat_logs ADD COLUMN IF NOT EXISTS temp_val FLOAT;
ALTER TABLE heartbeat_logs ADD COLUMN IF NOT EXISTS battery_level FLOAT;
ALTER TABLE heartbeat_logs ADD COLUMN IF NOT EXISTS signal_strength FLOAT;
ALTER TABLE heartbeat_logs ADD COLUMN IF NOT EXISTS received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE sensor_logs ADD COLUMN IF NOT EXISTS floor_name VARCHAR(100);
ALTER TABLE sensor_logs ADD COLUMN IF NOT EXISTS description VARCHAR(200);
ALTER TABLE sensor_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 한글 상태값이 남아 있으면 영문 상태값으로 변환
UPDATE devices SET status = 'disconnect' WHERE status IN ('미수신', '정상') OR status IS NULL;
UPDATE devices SET status = 'active' WHERE status = '생존';
UPDATE devices SET status = 'suspect' WHERE status IN ('화재 의심', '화재의심');
UPDATE devices SET status = 'alert' WHERE status = '화재';

-- 상태값 제약조건 재설정
ALTER TABLE devices DROP CONSTRAINT IF EXISTS chk_status_values;
ALTER TABLE devices ADD CONSTRAINT chk_status_values CHECK (status IN ('disconnect', 'active', 'suspect', 'alert'));

-- 기본 층 데이터
INSERT INTO floor_table (name, order_index)
VALUES ('1층', 1), ('2층', 2)
ON CONFLICT (name) DO NOTHING;

-- 테스트용 관리자 계정. 이미 있으면 무시.
INSERT INTO users (name, user_id, password)
VALUES ('관리자', 'admin', '1234')
ON CONFLICT (user_id) DO NOTHING;
