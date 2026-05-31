CREATE DATABASE IF NOT EXISTS GenUx;
USE GenUx;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(100) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS behavior_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(100),
  session_id VARCHAR(100),
  event_type VARCHAR(50),
  component VARCHAR(100),
  timestamp BIGINT,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id, created_at),
  INDEX (session_id, timestamp)
);

CREATE TABLE IF NOT EXISTS behavior_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(100),
  session_id VARCHAR(100),
  time_window_start TIMESTAMP,
  time_window_end TIMESTAMP,
  click_count INT,
  scroll_count INT,
  blur_count INT,
  idle_count INT,
  form_interaction_count INT,
  session_duration INT,
  error_count INT,
  submit_success_rate DECIMAL(3,2),
  engagement_level VARCHAR(20),
  focus_status VARCHAR(20),
  activity_status VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id, time_window_start)
);

CREATE TABLE IF NOT EXISTS suggestions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(100),
  behavior_profile_id INT,
  suggestion_text VARCHAR(255),
  component_affected VARCHAR(100),
  change_type VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending',
  user_feedback VARCHAR(50),
  admin_review_notes TEXT,
  version INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP NULL,
  deployed_at TIMESTAMP NULL,
  INDEX (user_id, status),
  FOREIGN KEY (behavior_profile_id) REFERENCES behavior_profiles(id)
);

CREATE TABLE IF NOT EXISTS code_changes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  suggestion_id INT,
  file_path VARCHAR(255),
  component VARCHAR(100),
  change_description TEXT,
  old_value VARCHAR(255),
  new_value VARCHAR(255),
  approved BOOLEAN DEFAULT FALSE,
  deployed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (suggestion_id) REFERENCES suggestions(id)
);

CREATE TABLE IF NOT EXISTS decision_tree_models (
  id INT AUTO_INCREMENT PRIMARY KEY,
  model_name VARCHAR(100),
  model_data LONGTEXT,
  training_date TIMESTAMP,
  samples_used INT,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suggestion_feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(100),
  suggestion_id INT,
  feedback VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (suggestion_id) REFERENCES suggestions(id)
);
