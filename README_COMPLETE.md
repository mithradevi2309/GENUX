# GENUX - Adaptive UX Optimization Platform

## Overview

GENUX is an intelligent user experience optimization system that leverages:
- **Local AI/ML** using Ollama Mistral 7B for dynamic suggestion generation
- **Behavior Analytics** with decision tree classification
- **Automated Deployment** via GitHub and CI/CD pipelines
- **Real-time Adaptation** based on user feedback

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Dashboard                          │
│              (public/index.html)                            │
│   ├─ Behavior Tracking (clicks, scrolls, blur, idle)      │
│   ├─ Form Submission with Feedback                         │
│   └─ Dynamic Suggestion Display (LLM-generated)            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Behavior Analytics Engine                      │
│                  (server.js)                                │
│   ├─ Event Collection & Storage (behavior_events)          │
│   ├─ Profile Generation (behavior_profiles)                │
│   ├─ Decision Tree Classification (ml-cart)                │
│   └─ User Input/Feedback Analysis                          │
└────┬─────────────────────────────────────────────┬──────────┘
     │                                              │
     ▼                                              ▼
┌──────────────────────────┐            ┌────────────────────┐
│   Local LLM (Ollama)     │            │  Admin Dashboard   │
│   ├─ Mistral 7B          │            │  (admin/index.html)│
│   ├─ Suggestion Gen      │            │                    │
│   └─ UI Code Generation  │            │ ├─ Decision Tree   │
└──────────────────────────┘            │ ├─ Rules Learned   │
                                        │ ├─ Suggestions     │
                                        │ └─ Deployments     │
                                        └────────┬───────────┘
                                                 │
                                                 ▼
                                    ┌─────────────────────────┐
                                    │   GitHub Integration    │
                                    │  ├─ Version Control     │
                                    │  ├─ Commit History      │
                                    │  └─ Release Tracking    │
                                    └────────┬────────────────┘
                                             │
                                             ▼
                                    ┌─────────────────────────┐
                                    │    CI/CD Pipeline       │
                                    │ (GitHub Actions)        │
                                    │  ├─ Validation          │
                                    │  ├─ Testing             │
                                    │  └─ Auto-Deployment     │
                                    └─────────────────────────┘
```

## Installation & Setup

### 1. Install Ollama (Local LLM Runtime)

```bash
# Ollama is already installed in the dev container
ollama serve &
ollama pull mistral
```

### 2. Initialize Database

```bash
mysql -h 127.0.0.1 -u genux -pnew_pass1234 GenUx < schema.sql
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the Server

```bash
NODE_ENV=development PORT=3000 DB_HOST=127.0.0.1 DB_USER=genux DB_PASS=new_pass1234 DB_NAME=GenUx node server.js
```

### 5. Access the System

- **User Dashboard**: http://localhost:3000/
- **Admin Dashboard**: http://localhost:3000/admin/

## Features & Capabilities

### User Dashboard (public/index.html)

**Behavior Tracking:**
- Monitors: clicks, scrolls, blur (distraction), idle time, form interactions, errors
- Real-time event collection
- Session profiling

**Interaction:**
- Provides AI-generated suggestions based on behavior
- Allows user feedback (acceptance/rejection)
- Captures user inputs (search queries, ratings, feedback text)
- Displays adaptive messages (not static)

### Admin Dashboard (admin/index.html)

**Monitoring & Analytics:**
- Behavior profile statistics
- User engagement metrics
- Decision tree visualization
- Learned rules display (7 hardcoded rules currently)

**Suggestion Management:**
- View all pending suggestions with trigger metrics
- See confidence scores and reasoning
- Review suggested UI changes
- Approve for deployment

**Model Training:**
- Train decision tree on collected behavior data
- View training stats (samples, algorithm, features, date range)
- Monitor model performance

**Deployment:**
- Track code changes and their status
- View deployment history
- GitHub integration status
- CI/CD pipeline information

### AI/LLM Integration (ollama/mistral)

**Dynamic Suggestion Generation:**
- Analyzes behavior metrics and classification
- Generates personalized suggestions
- Considers user feedback history
- Provides reasoning for suggestions

**UI Code Generation:**
- Generates HTML/CSS/JS modifications
- Scoped to frontend only (public/index.html)
- Preserves admin dashboard integrity
- JSON-formatted change specifications

### Decision Tree ML System

**Features Tracked (7 total):**
1. `click_count` - User clicks
2. `scroll_count` - Scroll events
3. `blur_count` - Window blur/distraction
4. `idle_count` - Idle periods
5. `form_interaction_count` - Form interactions
6. `error_count` - Errors encountered
7. `submit_success_rate` - Form success rate

**Classification Output:**
- Engagement level (Normal, Distracted, Inactive, etc.)
- Triggered conditions
- Confidence score
- Recommended actions

### GitHub & CI/CD Integration

**Automatic Workflows:**
1. Admin approves UI suggestion
2. LLM generates UI code changes
3. Code committed to feature branch
4. GitHub Actions validates changes
5. CI/CD pipeline tests the code
6. Automatic deployment to production
7. Release tag created

**GitHub Actions Workflow:**
- Location: `.github/workflows/deploy-ui-changes.yml`
- Triggers: Push to main, PR creation
- Steps:
  - JavaScript syntax validation
  - HTML/CSS validation
  - Linting (if configured)
  - Deployment artifact preparation
  - Production deployment
  - Release tracking

## API Endpoints

### User APIs

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/events` | Record behavior event |
| POST | `/api/analyze-behavior` | Analyze and generate suggestion |
| POST | `/api/user-inputs` | Store user input/feedback |
| POST | `/api/record-feedback` | Record suggestion feedback |
| GET | `/api/suggestions/:userId` | Get pending suggestions |
| POST | `/api/suggestion-feedback` | Accept/reject suggestion |

### Admin APIs

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/admin/pending-suggestions` | Get suggestions with metrics |
| GET | `/api/admin/analytics` | Get behavior analytics |
| GET | `/api/admin/decision-tree` | Get model info and features |
| POST | `/api/admin/train-model` | Train decision tree |
| GET | `/api/admin/code-changes` | Get approved code changes |
| POST | `/api/admin/approve-suggestion` | Approve suggestion for deployment |
| GET | `/api/admin/deployment-status` | Get GitHub & CI/CD status |
| GET | `/api/admin/deployment-history` | Get deployment history |
| GET | `/api/admin/export-csv` | Export behavior data as CSV |

## Configuration

### Environment Variables

```bash
# Database
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=genux
DB_PASS=new_pass1234
DB_NAME=GenUx

# Ollama (Local LLM)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=mistral

# GitHub Integration
GIT_AUTO_COMMIT=false  # Enable automatic commits
GIT_AUTO_PUSH=false    # Enable automatic pushes
GIT_USER=genux-automation
GIT_EMAIL=automation@genux.local

# Server
PORT=3000
NODE_ENV=development
```

## Data Models

### behavior_events
- Tracks individual user actions
- Fields: user_id, session_id, event_type, component, timestamp, metadata

### behavior_profiles
- Aggregated behavior data per time window
- Fields: click_count, scroll_count, blur_count, idle_count, error_count, etc.

### suggestions
- AI-generated and stored suggestions
- Fields: user_id, suggestion_text, component, status, confidence, reason

### code_changes
- Tracked UI modifications
- Fields: suggestion_id, file_path, change_description, approved, deployed, llm_generated

### user_inputs
- User feedback and search queries
- Fields: user_id, input_type, search_query, ratings, feedback_text, sentiment

## Usage Flow

### 1. User Activity Collection

```javascript
// User browser sends behavior events
POST /api/events {
  event: "click",
  component: "button",
  userId: "user_1",
  sessionId: "session_123"
}
```

### 2. Behavior Analysis

```javascript
// Analyze accumulated behavior
POST /api/analyze-behavior {
  userId: "user_1"
}

// Returns: classification, suggestion, confidence score
```

### 3. Admin Review

```
1. Admin logs in to /admin/
2. Views pending suggestions with trigger metrics
3. Clicks "Review" on interesting suggestion
4. Sees:
   - Why suggestion was generated (trigger metrics)
   - Confidence score
   - Recommended UI changes
   - Decision path
5. Clicks "Approve & Deploy"
```

### 4. Automated Deployment

```
1. System commits changes to feature branch
2. GitHub Actions validates code
3. CI/CD pipeline runs tests
4. Code deployed to production
5. User dashboard updates with new UI
```

### 5. User Feedback

```
1. User sees updated UI
2. Provides feedback (accept/reject suggestion)
3. Feedback stored for model refinement
4. System learns and improves
```

## Advanced Features

### Dynamic Message Generation

Instead of static messages like "We noticed you're switching tabs", the system generates context-aware messages:
- "Your engagement is high - try organizing your workflow"
- "We detected navigation patterns - consider bookmarking frequently used sections"
- "Form interactions suggest complexity - we simplified the checkout process"

### Trigger Metrics in Admin View

Suggestions show which metrics triggered the recommendation:
- "High engagement (clicks)"
- "Distraction detected"
- "Form frustration"
- "Low form success"
- "Excessive scrolling"

### Confidence Scoring

Each suggestion includes a confidence score (0-100%) based on:
- Clarity of trigger conditions
- Consistency with historical patterns
- User response to similar suggestions
- Model certainty

### GitHub Integration Status

View in admin dashboard:
- Integration enabled/disabled
- Auto-commit enabled/disabled
- Auto-push enabled/disabled
- CI/CD pipeline status
- Latest deployments

## Troubleshooting

### Ollama Not Starting

```bash
# Check status
ps aux | grep ollama

# Restart
pkill ollama
ollama serve &

# Pull model if needed
ollama pull mistral
```

### Database Connection Issues

```bash
# Verify MySQL is running
sudo service mysql status

# Test connection
mysql -h 127.0.0.1 -u genux -pnew_pass1234 GenUx
```

### No Suggestions Generated

- Check that behavior data is being collected (check behavior_events table)
- Train the model first (`POST /api/admin/train-model`)
- Ensure user has completed meaningful interactions
- Check server logs for LLM errors

### GitHub Integration Not Working

- Ensure git is initialized: `git init`
- Set up GitHub authentication (SSH keys or tokens)
- Enable auto-commit: `export GIT_AUTO_COMMIT=true`
- Check GitHub Actions workflows are enabled

## Performance & Limitations

### Current Constraints
- Max ~1000 behavior profiles per training session
- Decision tree max depth: 5
- Real-time inference: <100ms
- On-demand training (manual trigger)

### Scaling Recommendations
- For >10,000 users: Implement batch processing
- For >100MB data: Consider data archival strategy
- For real-time ML: Implement continuous training pipeline
- For multiple regions: Distribute DB and LLM instances

## Security Considerations

- Database credentials in .env (consider vault)
- API has no authentication (add JWT in production)
- Git commit messages are logged (sanitize sensitive data)
- User input is stored (implement data retention policies)
- LLM runs locally (no data sent to external services)

## Future Enhancements

1. **Real-time Model Training**: Continuous learning from user feedback
2. **A/B Testing**: Test UI variations before full deployment
3. **User Segmentation**: Different suggestions for different user types
4. **Advanced ML**: Neural networks for more complex patterns
5. **Multi-language Support**: Localized suggestions and UI
6. **Mobile Optimization**: Mobile-specific behavior tracking
7. **Privacy Mode**: User data anonymization options

## Conclusion

GENUX is a complete closed-loop adaptive UX optimization system that combines local AI, behavior analytics, and automated deployment. It enables continuous UI improvement based on real user interactions while maintaining transparency, version control, and operational oversight through GitHub and CI/CD integration.

For questions or issues, check the GitHub repository or review the admin dashboard for real-time system status.
