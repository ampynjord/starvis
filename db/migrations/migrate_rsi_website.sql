-- ─────────────────────────────────────────────────────────────────────────────
-- rsi_website DB migration
--
-- Creates the rsi_website database and migrates ship_matrix from starvis DB.
-- Run once against your MySQL instance:
--   mysql -u root -p < db/migrate_rsi_website.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS rsi_website
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE rsi_website;

-- ── ship_matrix (migrated from starvis.ship_matrix) ──────────────────────────

CREATE TABLE IF NOT EXISTS ship_matrix (
  id                  INT          NOT NULL,
  name                VARCHAR(255) NOT NULL,
  chassis_id          INT          DEFAULT NULL,
  manufacturer_code   VARCHAR(10)  DEFAULT NULL,
  manufacturer_name   VARCHAR(100) DEFAULT NULL,
  focus               VARCHAR(255) DEFAULT NULL,
  type                VARCHAR(50)  DEFAULT NULL,
  description         TEXT         DEFAULT NULL,
  production_status   VARCHAR(50)  DEFAULT NULL,
  production_note     TEXT         DEFAULT NULL,
  size                VARCHAR(20)  DEFAULT NULL,
  url                 VARCHAR(500) DEFAULT NULL,
  length              DECIMAL(10,2) DEFAULT NULL,
  beam                DECIMAL(10,2) DEFAULT NULL,
  height              DECIMAL(10,2) DEFAULT NULL,
  mass                INT          DEFAULT NULL,
  cargocapacity       INT          DEFAULT NULL,
  min_crew            INT          DEFAULT 1,
  max_crew            INT          DEFAULT 1,
  scm_speed           INT          DEFAULT NULL,
  afterburner_speed   INT          DEFAULT NULL,
  pitch_max           DECIMAL(10,2) DEFAULT NULL,
  yaw_max             DECIMAL(10,2) DEFAULT NULL,
  roll_max            DECIMAL(10,2) DEFAULT NULL,
  xaxis_acceleration  DECIMAL(10,4) DEFAULT NULL,
  yaxis_acceleration  DECIMAL(10,4) DEFAULT NULL,
  zaxis_acceleration  DECIMAL(10,4) DEFAULT NULL,
  media_source_url    TEXT          DEFAULT NULL,
  media_store_small   TEXT          DEFAULT NULL,
  media_store_large   TEXT          DEFAULT NULL,
  compiled            JSON          DEFAULT NULL,
  synced_at           DATETIME(0)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Copy existing data from starvis.ship_matrix
INSERT IGNORE INTO rsi_website.ship_matrix
SELECT * FROM starvis.ship_matrix;

-- ── galactapedia ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS galactapedia (
  id            VARCHAR(50)   NOT NULL,
  slug          VARCHAR(255)  NOT NULL,
  title         VARCHAR(500)  NOT NULL,
  content       LONGTEXT      DEFAULT NULL,
  excerpt       TEXT          DEFAULT NULL,
  categories    JSON          DEFAULT NULL,
  tags          JSON          DEFAULT NULL,
  thumbnail_url TEXT          DEFAULT NULL,
  rsi_url       TEXT          DEFAULT NULL,
  synced_at     DATETIME(0)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME(0)   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_galactapedia_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── starmap_locations ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS starmap_locations (
  id            INT           NOT NULL AUTO_INCREMENT,
  rsi_id        VARCHAR(50)   DEFAULT NULL,
  name          VARCHAR(255)  NOT NULL,
  type          VARCHAR(50)   DEFAULT NULL,
  system_code   VARCHAR(20)   DEFAULT NULL,
  system_name   VARCHAR(100)  DEFAULT NULL,
  parent_id     VARCHAR(50)   DEFAULT NULL,
  faction_name  VARCHAR(100)  DEFAULT NULL,
  affiliations  JSON          DEFAULT NULL,
  thumbnail     TEXT          DEFAULT NULL,
  description   TEXT          DEFAULT NULL,
  coordinates   JSON          DEFAULT NULL,
  jump_points   JSON          DEFAULT NULL,
  synced_at     DATETIME(0)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_starmap_rsi_id (rsi_id),
  KEY idx_starmap_system (system_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── comm_links ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comm_links (
  id            INT           NOT NULL AUTO_INCREMENT,
  rsi_id        VARCHAR(50)   DEFAULT NULL,
  slug          VARCHAR(500)  DEFAULT NULL,
  title         VARCHAR(500)  NOT NULL,
  content       LONGTEXT      DEFAULT NULL,
  excerpt       TEXT          DEFAULT NULL,
  category      VARCHAR(100)  DEFAULT NULL,
  thumbnail_url TEXT          DEFAULT NULL,
  rsi_url       TEXT          DEFAULT NULL,
  published_at  DATETIME(0)   DEFAULT NULL,
  synced_at     DATETIME(0)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_comm_link_rsi_id (rsi_id),
  UNIQUE KEY uq_comm_link_slug (slug),
  KEY idx_comm_link_category (category),
  KEY idx_comm_link_published (published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'rsi_website migration complete.' AS status;
