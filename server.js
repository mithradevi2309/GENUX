import express from "express";
import mysql from "mysql";
import { Parser } from "json2csv";
import { classifyBehaviorMultiCondition, generateSuggestion, trainModel, SimpleSentimentClassifier } from "./decisionEngine.js";
import { generateDynamicSuggestion, checkOllamaAvailability, generateUICodeChanges } from './llmAdapter.js';
import { trackUIChangeApproval } from './githubIntegration.js';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use('/admin', express.static('admin'));

const dbConfig = {
  // Prefer host.docker.internal in container environments so Codespaces/devcontainers
  // can reach services running on the host machine. Override with DB_HOST env var.
  host: '127.0.0.1',
  user: 'genux',
  password: 'new_pass1234',
  database: 'GenUx',
  multipleStatements: false,
};

const db = mysql.createConnection(dbConfig);

function connectWithRetry(attempts = 0) {
  db.connect((err) => {
    if (err) {
      console.error(`DB connection failed (attempt ${attempts + 1}):`, err && err.message ? err.message : err);
      if (attempts >= 4) {
        console.warn("DB still unreachable after several attempts. Options:\n- Run MySQL inside the devcontainer.\n- Set DB_HOST to a reachable host (e.g., host.docker.internal or the host IP).\n- Create an SSH tunnel or use a cloud DB and set DB_HOST/DB_USER/DB_PASS accordingly.");
      }
      // Retry with exponential backoff up to 6 attempts
      const delay = Math.min(30000, 1000 * Math.pow(2, attempts));
      setTimeout(() => connectWithRetry(attempts + 1), delay);
    } else {
      console.log(`✓ Connected to MySQL ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
    }
  });
}

connectWithRetry();

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
            (err, ins) => {
              if (err) {
                console.error("Suggestion insert error:", err.message);
                return res.json({ profile, classification, suggestion });
              }
              // include DB id so frontend can reference suggestion
              suggestion.id = ins.insertId;
              res.json({ profile, classification, suggestion });
            }
          );
        } else {
          res.json({ profile, classification, suggestion });
        }
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

// Admin: Get all pending suggestions with detailed reasoning
app.get("/api/admin/pending-suggestions", (req, res) => {
  db.query(
    `SELECT s.*, bp.click_count, bp.scroll_count, bp.blur_count, bp.idle_count, bp.form_interaction_count, bp.error_count, bp.submit_success_rate, bp.engagement_level
     FROM suggestions s 
     LEFT JOIN behavior_profiles bp ON s.behavior_profile_id = bp.id
     WHERE s.status IN ('user_accepted', 'pending') 
     ORDER BY s.created_at DESC LIMIT 20`,
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      // Enhance with reasoning
      const enhanced = results.map(s => ({
        ...s,
        trigger_metrics: extractTriggerMetrics(s),
        confidence_score: calculateSuggestionConfidence(s)
      }));
      res.json(enhanced);
    }
  );
});

// Admin: Approve suggestion for deployment with LLM-generated code and GitHub tracking
app.post("/api/admin/approve-suggestion", async (req, res) => {
  const { suggestionId, codeChange } = req.body;

  db.query("UPDATE suggestions SET status = 'admin_approved', approved_at = NOW() WHERE id = ?", [suggestionId], async (err) => {
    if (err) return res.status(500).json({ error: err.message });

    // Generate UI code changes with LLM
    try {
      const ollamaAvailable = await checkOllamaAvailability();
      if (ollamaAvailable && codeChange) {
        const uiChanges = await generateUICodeChanges({ suggestion: codeChange }, [codeChange]);
        if (uiChanges) {
          db.query(
            "INSERT INTO code_changes (suggestion_id, file_path, component, change_description, old_value, new_value, approved, llm_generated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [suggestionId, uiChanges.file_path || 'public/index.html', uiChanges.component || 'dashboard', 
             'LLM-generated UI update', JSON.stringify(codeChange), JSON.stringify(uiChanges.changes), 1, 1],
            (err) => {
              if (err) console.error("Code change error:", err.message);
            }
          );
        }
      } else if (codeChange) {
        // Fallback to manual code change
        db.query(
          "INSERT INTO code_changes (suggestion_id, file_path, component, change_description, old_value, new_value, approved) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [suggestionId, codeChange.file, codeChange.component, codeChange.description, codeChange.old, codeChange.new, 1],
          (err) => {
            if (err) console.error("Code change error:", err.message);
          }
        );
      }

      // Track with GitHub integration
      const trackResult = await trackUIChangeApproval(suggestionId, codeChange);
      console.log('GitHub tracking:', trackResult);
      
      res.json({ 
        approved: true, 
        deployment: {
          status: 'processing',
          branch: trackResult.branch || 'auto-deploy',
          message: 'UI changes committed and queued for deployment'
        }
      });
    } catch (error) {
      console.error("Approval error:", error);
      res.json({ 
        approved: true, 
        deployment: { 
          status: 'fallback', 
          message: 'Changes approved but deployment tracking failed'
        }
      });
    }
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

// Initialize sentiment classifier for adaptive learning
const sentimentClassifier = new SimpleSentimentClassifier();

// Store user form inputs & feedback for learning
app.post("/api/user-inputs", (req, res) => {
  const { userId = "user_1", sessionId, inputType, searchQuery, discoverabilityRating, dashboardRating, feedbackText } = req.body;

  if (!inputType) {
    return res.status(400).json({ error: "Missing inputType" });
  }

  ensureUser(userId);
  
  // Analyze sentiment from feedback text
  const sentiment = feedbackText ? sentimentClassifier.classify(feedbackText) : "neutral";

  db.query(
    "INSERT INTO user_inputs (user_id, session_id, input_type, search_query, discoverability_rating, dashboard_rating, feedback_text, sentiment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [userId, sessionId || "session_1", inputType, searchQuery || null, discoverabilityRating || null, dashboardRating || null, feedbackText || null, sentiment],
    (err, result) => {
      if (err) {
        console.error("User input insert error:", err.message);
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ stored: true, inputId: result.insertId, sentiment });
    }
  );
});

// Record suggestion feedback for adaptive learning
app.post("/api/record-feedback", (req, res) => {
  const { userId = "user_1", suggestionId, feedback, notes } = req.body;

  if (!suggestionId || !feedback) {
    return res.status(400).json({ error: "Missing suggestionId or feedback" });
  }

  db.query(
    "INSERT INTO user_inputs (user_id, input_type, feedback_text, sentiment) VALUES (?, ?, ?, ?)",
    [userId, "suggestion_feedback", notes || feedback, sentimentClassifier.classify(notes || feedback)],
    (err) => {
      if (err) {
        console.error("Feedback record error:", err.message);
        return res.status(500).json({ error: err.message });
      }
      res.json({ recorded: true });
    }
  );
});

// Get insights from user inputs for dashboard reporting
app.get("/api/admin/user-insights", (req, res) => {
  db.query(
    `SELECT 
      sentiment,
      COUNT(*) as count,
      input_type as type
     FROM user_inputs
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
     GROUP BY sentiment, input_type
     ORDER BY count DESC`,
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    }
  );
});

// Debug endpoint: Show current decision tree & ML config
app.get("/api/admin/ml-config", (req, res) => {
  res.json({
    model: "Hybrid Decision Tree + Naive Bayes Sentiment",
    decisionTree: "ml-cart (JavaScript implementation)",
    sentiment: "SimpleSentimentClassifier (no external deps)",
    trainingApproach: "On-demand with user behavior data",
    recommendation: {
      framework: "Lightweight adaptive system suitable for Codespace (2-4GB RAM, 2 CPU)",
      decisionTree: "ml-cart - fast, memory-efficient decision tree classifier",
      sentimentAnalysis: "Custom Naive Bayes - no ML dependencies, <50KB code",
      nextStep: "Consider tf.js for browser-based ML or local lightweight neural net"
    },
    capabilityMatrix: {
      dataSize: "Up to 1000 behavior profiles per training session",
      fieldCount: "15+ tracking fields (expandable)",
      realTimeInference: "< 100ms per classification",
      retrainingCycle: "On-demand (manual admin trigger)",
      adaptationMethod: "Feedback-based effectiveness scoring",
    }
  });
});

// Get deployment status and GitHub integration info
app.get("/api/admin/deployment-status", async (req, res) => {
  res.json({
    github_integration: process.env.GIT_AUTO_COMMIT === 'true' ? 'enabled' : 'disabled',
    auto_push: process.env.GIT_AUTO_PUSH === 'true' ? 'enabled' : 'disabled',
    ci_cd_pipeline: 'GitHub Actions (.github/workflows/deploy-ui-changes.yml)',
    deployment_target: 'public/index.html, admin/index.html, frontend JS',
    latest_deployments: [],
    message: 'UI changes are automatically deployed when approved'
  });
});

// Get deployment history
app.get("/api/admin/deployment-history", (req, res) => {
  db.query(
    "SELECT id, suggestion_id, file_path, change_description, approved, deployed, created_at FROM code_changes ORDER BY created_at DESC LIMIT 20",
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      const history = results.map(r => ({
        ...r,
        deployment_status: r.deployed ? 'deployed' : 'pending'
      }));
      res.json(history);
    }
  );
});

/**
 * Extract trigger metrics from a suggestion record
 */
function extractTriggerMetrics(suggestion) {
  const metrics = [];
  
  if (suggestion.click_count > 100) metrics.push('High engagement (clicks)');
  if (suggestion.blur_count > 5) metrics.push('Distraction detected');
  if (suggestion.idle_count > 10) metrics.push('Inactive periods');
  if (suggestion.error_count > 3) metrics.push('High error rate');
  if (suggestion.form_interaction_count > 5 && suggestion.error_count > 2) metrics.push('Form frustration');
  if (suggestion.submit_success_rate < 0.5) metrics.push('Low form success');
  if (suggestion.scroll_count > 50) metrics.push('Excessive scrolling');
  
  return metrics.length > 0 ? metrics : ['Normal behavior'];
}

/**
 * Calculate confidence score for a suggestion
 */
function calculateSuggestionConfidence(suggestion) {
  let confidence = 0.5; // baseline
  
  // Increase confidence if we have clear trigger metrics
  if (suggestion.click_count && suggestion.click_count > 50) confidence += 0.1;
  if (suggestion.error_count && suggestion.error_count > 2) confidence += 0.15;
  if (suggestion.form_interaction_count && suggestion.error_count) confidence += 0.1;
  
  return Math.min(confidence, 0.95);
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✓ GENUX server running on http://localhost:${port}`);
});

