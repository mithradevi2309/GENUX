import mysql from "mysql";

const db = mysql.createConnection({
  host: "localhost",
  user: "genux",
  password: "new_pass1234",
  database: "GenUx"
});

db.connect((err) => {
  if (err) {
    console.error("DB connection failed:", err.message);
    setTimeout(() => db.connect(), 5000);
  } else {
    console.log("Connected to MySQL");
    initSchema();
  }
});

function initSchema() {
  const queries = [
    `CREATE TABLE IF NOT EXISTS user_behavior (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(50),
      session_id VARCHAR(100),
      click_count INT DEFAULT 0,
      scroll_count INT DEFAULT 0,
      hover_count INT DEFAULT 0,
      blur_count INT DEFAULT 0,
      idle_count INT DEFAULT 0,
      input_count INT DEFAULT 0,
      focus_count INT DEFAULT 0,
      submit_count INT DEFAULT 0,
      failed_submit INT DEFAULT 0,
      success_submit INT DEFAULT 0,
      session_duration INT,
      engagement_status VARCHAR(50),
      blur_status VARCHAR(50),
      idle_status VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS recommendations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(50),
      recommendation TEXT,
      component VARCHAR(100),
      action VARCHAR(100),
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  queries.forEach((query) => {
    db.query(query, (err) => {
      if (err && err.code !== "ER_TABLE_EXISTS_ERROR") {
        console.error("Schema error:", err.message);
      }
    });
  });
}

export default db;
