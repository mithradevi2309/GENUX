import express from "express";
import mysql from "mysql";
import { Parser } from "json2csv";
import { classifyBehaviorMultiCondition, generateSuggestion, trainModel } from "./decisionEngine.js";

const app = express();
app.use(express.json());
app.use(express.static("public"));

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "new_pass1234",
  database: "GenUx",
});

db.connect((err) => {
  if (err) {
    console.error("DB connection failed:", err.message);
    setTimeout(() => db.connect(), 5000);
  } else {
    console.log("✓ Connected to MySQL GenUx");
  }
});

// Ensure user exists
function ensureUser(userId) {
  db.query("INSERT IGNORE INTO users (user_id) VALUES (?)", [userId]);
}

// Store raw events
app.post("/api/events", (req, res) => {
  const { event, component, timestamp, sessionId, userId = "user_1", metadata = {} } = req.body;

  if (!event || !timestamp || !sessionId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  ensureUser(userId);
  db.query(
    "INSERT INTO behavior_events (user_id, session_id, event_type, component, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?)",
    [userId, sessionId, event, component, timestamp, JSON.stringify(metadata)],
    (err) => {
      if (err) {
        console.error("Event insert error:", err.message);
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ received: true });
    }
  );
});

// On-demand: Analyze behavior for last 1 hour
app.post("/api/analyze-behavior", (req, res) => {
  const { userId = "user_1", sessionId } = req.body;

  const query = `
    SELECT event_type, component, COUNT(*) as count
    FROM behavior_events
    WHERE user_id = ? ${sessionId ? "AND session_id = ?" : ""}
    AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
    GROUP BY event_type, component
  `;

  const params = sessionId ? [userId, sessionId] : [userId];

  db.query(query, params, (err, events) => {
    if (err) return res.status(500).json({ error: err.message });

    // Calculate behavior profile
    const profile = calculateProfile(events);

    // Classify and suggest
    const classification = classifyBehaviorMultiCondition(profile);
    const suggestion = generateSuggestion(classification, profile);

    // Store profile
    db.query(
      `INSERT INTO behavior_profiles 
       (user_id, session_id, time_window_start, time_window_end, click_count, scroll_count, blur_count, 
        idle_count, form_interaction_count, session_duration, error_count, submit_success_rate, 
        engagement_level, focus_status, activity_status)
       VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 HOUR), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        sessionId || "session_1",
        profile.click_count,
        profile.scroll_count,
        profile.blur_count,
        profile.idle_count,
        profile.form_interaction_count,
        profile.session_duration,
        profile.error_count,
        profile.submit_success_rate,
        classification.class,
        profile.focus_status,
        profile.activity_status,
      ],
      (err, result) => {
        if (err) console.error("Profile insert error:", err.message);

        // Store suggestion if not "none"
        if (suggestion.action !== "none" && result?.insertId) {
          db.query(
            "INSERT INTO suggestions (user_id, behavior_profile_id, suggestion_text, component_affected, change_type) VALUES (?, ?, ?, ?, ?)",
            [userId, result.insertId, suggestion.text, suggestion.component, suggestion.action],
            (err) => {
              if (err) console.error("Suggestion insert error:", err.message);
            }
          );
        }

        res.json({ profile, classification, suggestion });
      }
    );
  });
});

function calculateProfile(events) {
  const eventMap = {};
  events.forEach((e) => {
    eventMap[e.event_type] = e.count;
  });

  const formInteractions = (eventMap.focus || 0) + (eventMap.input || 0);
  const failedSubmits = eventMap.form_submit_failed || 0;
  const successSubmits = eventMap.form_submit_success || 0;
  const totalSubmits = failedSubmits + successSubmits;

  return {
    click_count: eventMap.click || 0,
    scroll_count: eventMap.scroll || 0,
    blur_count: eventMap.blur || 0,
    idle_count: eventMap.idle || 0,
    form_interaction_count: formInteractions,
    session_duration: 3600,
    error_count: eventMap.form_submit_failed || 0,
    submit_success_rate: totalSubmits > 0 ? successSubmits / totalSubmits : 1,
    focus_status: (eventMap.blur || 0) > 5 ? "Distracted" : "Focused",
    activity_status: (eventMap.idle || 0) > 5 ? "Inactive" : "Active",
  };
}

// Get pending suggestions for user
app.get("/api/suggestions/:userId", (req, res) => {
  db.query("SELECT * FROM suggestions WHERE user_id = ? AND status = 'pending' LIMIT 1", [req.params.userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results[0] || null);
  });
});

// User approves/rejects suggestion
app.post("/api/suggestion-feedback", (req, res) => {
  const { suggestionId, userFeedback, userId } = req.body;

  db.query(
    "UPDATE suggestions SET user_feedback = ?, status = ? WHERE id = ? AND user_id = ?",
    [userFeedback, userFeedback === "accepted" ? "user_accepted" : "user_rejected", suggestionId, userId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: true });
    }
  );
});

// Admin: Get all pending suggestions
app.get("/api/admin/pending-suggestions", (req, res) => {
  db.query(
    "SELECT s.*, u.user_id FROM suggestions s JOIN users u ON s.user_id = u.user_id WHERE s.status IN ('user_accepted', 'pending') ORDER BY s.created_at DESC LIMIT 20",
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    }
  );
});

// Admin: Approve suggestion for deployment
app.post("/api/admin/approve-suggestion", (req, res) => {
  const { suggestionId, codeChange } = req.body;

  db.query("UPDATE suggestions SET status = 'admin_approved', approved_at = NOW() WHERE id = ?", [suggestionId], (err) => {
    if (err) return res.status(500).json({ error: err.message });

    if (codeChange) {
      db.query(
        "INSERT INTO code_changes (suggestion_id, file_path, component, change_description, old_value, new_value, approved) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [suggestionId, codeChange.file, codeChange.component, codeChange.description, codeChange.old, codeChange.new, true],
        (err) => {
          if (err) console.error("Code change error:", err.message);
        }
      );
    }

    res.json({ approved: true });
  });
});

// Admin: Export behavior data as CSV
app.get("/api/admin/export-csv", (req, res) => {
  db.query(
    "SELECT user_id, session_id, click_count, scroll_count, blur_count, idle_count, form_interaction_count, engagement_level FROM behavior_profiles ORDER BY created_at DESC LIMIT 100",
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });

      try {
        const parser = new Parser();
        const csv = parser.parse(results);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=behavior_data.csv");
        res.send(csv);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }
  );
});

// Admin: Train model
app.post("/api/admin/train-model", (req, res) => {
  db.query("SELECT * FROM behavior_profiles LIMIT 50", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    if (results.length < 2) {
      return res.json({ message: "Need at least 2 behavior profiles", samplesUsed: 0 });
    }

    const model = trainModel(results);
    res.json({ trained: !!model, samplesUsed: results.length });
  });
});

// Admin: Get analytics
app.get("/api/admin/analytics", (req, res) => {
  db.query(
    `SELECT 
      COUNT(*) as total_profiles,
      AVG(click_count) as avg_clicks,
      AVG(blur_count) as avg_blur,
      AVG(idle_count) as avg_idle,
      COUNT(DISTINCT user_id) as unique_users
     FROM behavior_profiles`,
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results[0]);
    }
  );
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✓ GENUX server running on http://localhost:${port}`);
});

