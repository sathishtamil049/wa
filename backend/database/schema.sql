-- ════════════════════════════════════════════════════════════════════════
--  MilkPro WhatsApp Sender — MySQL / MariaDB (XAMPP) schema + sample data
--  Import via phpMyAdmin → your server → "Import" tab → choose this file
--  (or the "SQL" tab → paste → Go). Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS milkpro
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE milkpro;

-- ── Existing Milk Producers Management System tables (adapt names to yours) ──

CREATE TABLE IF NOT EXISTS members (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  member_code  VARCHAR(20)  NOT NULL UNIQUE,
  name         VARCHAR(100) NOT NULL,
  phone        VARCHAR(15)  NOT NULL,          -- 10-digit local number
  status       ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS milk_entries (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  member_id    INT UNSIGNED NOT NULL,
  entry_date   DATE         NOT NULL,
  shift        ENUM('AM','PM') NOT NULL,
  milk_ltr     DECIMAL(8,2) NOT NULL DEFAULT 0,
  fat          DECIMAL(4,1) NOT NULL DEFAULT 0,
  snf          DECIMAL(4,1) NOT NULL DEFAULT 0,
  rate_per_ltr DECIMAL(8,2) NOT NULL DEFAULT 0,
  amount       DECIMAL(10,2) NOT NULL DEFAULT 0,   -- milk_ltr * rate_per_ltr
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_date_shift (entry_date, shift),
  CONSTRAINT fk_entries_member FOREIGN KEY (member_id) REFERENCES members(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS advances (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  member_id    INT UNSIGNED NOT NULL,
  amount       DECIMAL(10,2) NOT NULL DEFAULT 0,
  advance_date DATE NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_member_date (member_id, advance_date),
  CONSTRAINT fk_advances_member FOREIGN KEY (member_id) REFERENCES members(id)
) ENGINE=InnoDB;

-- ── WhatsApp message tracking (this module's own table) ─────────────────

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  producer_id   INT UNSIGNED NOT NULL,
  collection_id INT UNSIGNED NOT NULL,          -- milk_entries.id
  phone         VARCHAR(20)  NOT NULL,
  message       TEXT         NOT NULL,          -- snapshot sent to WhatsApp
  status        ENUM('pending','opened','sent','failed','skipped') NOT NULL DEFAULT 'pending',
  opened_at     DATETIME NULL,
  sent_at       DATETIME NULL,
  failed_at     DATETIME NULL,
  error_message VARCHAR(255) NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_collection (collection_id),     -- prevents duplicates per entry
  KEY idx_producer (producer_id),
  KEY idx_status (status),
  CONSTRAINT fk_wa_producer  FOREIGN KEY (producer_id)   REFERENCES members(id),
  CONSTRAINT fk_wa_entry     FOREIGN KEY (collection_id) REFERENCES milk_entries(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(64) PRIMARY KEY,
  v TEXT NOT NULL
) ENGINE=InnoDB;

-- ── Default message template ────────────────────────────────────────────

INSERT INTO settings (k, v) VALUES ('message_template',
'Hello {producer_name},\n\nToday''s Milk Collection\n\nDate: {date}\nShift: {shift}\nMilk: {milk_ltr} Ltr\nFAT: {fat}\nSNF: {snf}\nRate: ₹{rate_per_ltr}/Ltr\n\nMilk Amount: ₹{milk_amount}\nAdvance Deduction: ₹{advance_deduction}\nNet Payable: ₹{net_payable}\n\nThank you.\nMilk Producers Management System')
ON DUPLICATE KEY UPDATE k = k;  -- keep user's edits on re-import

-- ── Sample data (phones are fictitious — replace with real producer numbers) ─

INSERT IGNORE INTO members (id, member_code, name, phone) VALUES
  (1, 'MP-001', 'Ravi Kumar',      '9812045671'),
  (2, 'MP-002', 'Suresh Patel',    '9825512340'),
  (3, 'MP-003', 'Mahesh Verma',    '9765098221'),
  (4, 'MP-004', 'Anita Deshmukh',  '9890311457'),
  (5, 'MP-005', 'Rajesh Singh',    '9415023986'),
  (6, 'MP-006', 'Vinod Yadav',     '9970456123'),
  (7, 'MP-007', 'Santosh Jadhav',  '9860712349'),
  (8, 'MP-008', 'Prakash Reddy',   '9008534671');

-- Today's morning shift (CURDATE() so the dashboard shows data immediately)
INSERT IGNORE INTO milk_entries
  (id, member_id, entry_date, shift, milk_ltr, fat, snf, rate_per_ltr, amount) VALUES
  (1, 1, CURDATE(), 'AM', 24.5, 4.6, 8.6, 42.50, 1041.25),
  (2, 2, CURDATE(), 'AM', 18.0, 4.2, 8.4, 39.75,  715.50),
  (3, 3, CURDATE(), 'AM', 32.0, 5.0, 8.9, 46.00, 1472.00),
  (4, 4, CURDATE(), 'AM', 12.5, 3.8, 8.2, 36.25,  453.13),
  (5, 5, CURDATE(), 'AM', 27.0, 4.4, 8.5, 41.00, 1107.00),
  (6, 6, CURDATE(), 'AM', 15.5, 4.0, 8.3, 38.00,  589.00),
  (7, 7, CURDATE(), 'AM', 21.0, 4.7, 8.7, 43.50,  913.50),
  (8, 8, CURDATE(), 'AM',  9.0, 3.5, 8.0, 33.50,  301.50);

-- Today's advances (deductions)
INSERT IGNORE INTO advances (id, member_id, amount, advance_date) VALUES
  (1, 1, 200.00, CURDATE()),
  (2, 3, 350.00, CURDATE()),
  (3, 5, 150.00, CURDATE());
