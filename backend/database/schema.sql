-- ════════════════════════════════════════════════════════════════════════
--  MilkPro WhatsApp Sender — MySQL / MariaDB (XAMPP / cPanel) schema
--  Matches the live Milk Producers database structure:
--    • members.joined_on (DATE)
--    • milk_entries has NO amount column (amount = milk_ltr × rate_per_ltr)
--    • advances.note for remarks
--  Import via phpMyAdmin → server → "Import" tab → choose this file → Go.
--  Safe to re-run on an existing database.
-- ════════════════════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS milkpro
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE milkpro;

-- ── Existing Milk Producers Management System tables ─────────────────────

CREATE TABLE IF NOT EXISTS members (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  member_code  VARCHAR(20)  NOT NULL UNIQUE,
  name         VARCHAR(100) NOT NULL,
  phone        VARCHAR(15)  NOT NULL,          -- digits only, no country code
  village      VARCHAR(60)  NOT NULL DEFAULT '',
  status       ENUM('active','inactive') NOT NULL DEFAULT 'active',
  joined_on    DATE         NOT NULL,
  animal       ENUM('Buffalo','Cow','Mixed') NOT NULL DEFAULT 'Mixed'
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS milk_entries (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  member_id    INT UNSIGNED NOT NULL,
  entry_date   DATE         NOT NULL,
  shift        ENUM('AM','PM') NOT NULL,
  milk_ltr     DECIMAL(7,2) NOT NULL DEFAULT 0.00,
  fat          DECIMAL(4,2) NOT NULL DEFAULT 0.00,
  snf          DECIMAL(4,2) NOT NULL DEFAULT 0.00,
  rate_per_ltr DECIMAL(6,2) NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT current_timestamp(),
  KEY idx_date_shift (entry_date, shift),
  KEY idx_member (member_id),
  UNIQUE KEY uq_member_date_shift (member_id, entry_date, shift)
) ENGINE=InnoDB;
-- NOTE: no `amount` column — amount is always computed as milk_ltr × rate_per_ltr.

CREATE TABLE IF NOT EXISTS advances (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  member_id    INT UNSIGNED NOT NULL,
  amount       DECIMAL(9,2) NOT NULL,
  advance_date DATE         NOT NULL,
  note         VARCHAR(120) NOT NULL DEFAULT '',
  created_at   DATETIME     NOT NULL DEFAULT current_timestamp(),
  KEY idx_member_date (member_id, advance_date)
) ENGINE=InnoDB;

-- ── WhatsApp message tracking (this module's own table) ─────────────────

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  producer_id   INT UNSIGNED NOT NULL,
  collection_id INT UNSIGNED NOT NULL,          -- milk_entries.id
  phone         VARCHAR(20)  NOT NULL,
  message       TEXT         NOT NULL,          -- snapshot sent to WhatsApp
  status        ENUM('pending','opened','sent','failed','skipped') NOT NULL DEFAULT 'pending',
  opened_at     DATETIME NULL,
  sent_at       DATETIME NULL,
  failed_at     DATETIME NULL,
  error_message VARCHAR(255) NULL,
  created_at    DATETIME NOT NULL DEFAULT current_timestamp(),
  updated_at    DATETIME NOT NULL DEFAULT current_timestamp(),
  UNIQUE KEY uq_collection (collection_id),     -- one record per collection entry
  KEY idx_producer (producer_id),
  KEY idx_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(64) PRIMARY KEY,
  v TEXT NOT NULL
) ENGINE=InnoDB;

-- ── Default message template ────────────────────────────────────────────

INSERT INTO settings (k, v) VALUES ('message_template',
'Hello {producer_name},\n\nToday''s Milk Collection\n\nDate: {date}\nShift: {shift}\nMilk: {milk_ltr} Ltr\nFAT: {fat}\nSNF: {snf}\nRate: ₹{rate_per_ltr}/Ltr\n\nMilk Amount: ₹{milk_amount}\nAdvance Deduction: ₹{advance_deduction}\nNet Payable: ₹{net_payable}\n\nThank you.\nMilk Producers Management System')
ON DUPLICATE KEY UPDATE k = k;  -- keeps your edits on re-import

-- ── Sample data (phones are fictitious — replace with real producer numbers) ─

INSERT IGNORE INTO members (id, member_code, name, phone, village, joined_on, animal) VALUES
  (1, 'MP-001', 'Ravi Kumar',      '9812045671', 'Anand',    '2019-04-12', 'Buffalo'),
  (2, 'MP-002', 'Suresh Patel',    '9825512340', 'Karamsad', '2018-11-02', 'Cow'),
  (3, 'MP-003', 'Mahesh Verma',    '9765098221', 'Anand',    '2020-01-19', 'Buffalo'),
  (4, 'MP-004', 'Anita Deshmukh',  '9890311457', 'Bakrol',   '2017-06-30', 'Mixed'),
  (5, 'MP-005', 'Rajesh Singh',    '9415023986', 'Mogra',    '2021-02-08', 'Buffalo'),
  (6, 'MP-006', 'Vinod Yadav',     '9970456123', 'Anand',    '2019-09-23', 'Cow'),
  (7, 'MP-007', 'Santosh Jadhav',  '9860712349', 'Karamsad', '2016-12-05', 'Buffalo'),
  (8, 'MP-008', 'Prakash Reddy',   '9008534671', 'Bakrol',   '2020-07-14', 'Mixed');

-- Today's morning shift (CURDATE() so the dashboard shows data immediately)
INSERT IGNORE INTO milk_entries
  (id, member_id, entry_date, shift, milk_ltr, fat, snf, rate_per_ltr) VALUES
  (1, 1, CURDATE(), 'AM', 24.50, 4.60, 8.60, 42.50),
  (2, 2, CURDATE(), 'AM', 18.00, 4.20, 8.40, 39.75),
  (3, 3, CURDATE(), 'AM', 32.00, 5.00, 8.90, 46.00),
  (4, 4, CURDATE(), 'AM', 12.50, 3.80, 8.20, 36.25),
  (5, 5, CURDATE(), 'AM', 27.00, 4.40, 8.50, 41.00),
  (6, 6, CURDATE(), 'AM', 15.50, 4.00, 8.30, 38.00),
  (7, 7, CURDATE(), 'AM', 21.00, 4.70, 8.70, 43.50),
  (8, 8, CURDATE(), 'AM',  9.00, 3.50, 8.00, 33.50);

-- Today's advances (deductions)
INSERT IGNORE INTO advances (id, member_id, amount, advance_date, note) VALUES
  (1, 1, 200.00, CURDATE(), 'Feed purchase'),
  (2, 3, 350.00, CURDATE(), 'Veterinary'),
  (3, 5, 150.00, CURDATE(), '');
