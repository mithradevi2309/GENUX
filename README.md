# GENUX: User Behavior Drift Detection & Adaptive UI

Student research project for detecting user behavior changes and suggesting UI improvements.

## System Architecture

```
User Dashboard → Track Behavior → MySQL Storage
                                      ↓
Admin Dashboard ← Review Suggestions ← Decision Tree (8 conditions)
```

## Complete Data Flow

1. **User Session**: User interacts with dashboard (clicks, scrolls, forms, etc.)
2. **Event Tracking**: Frontend sends events to backend
3. **Database Storage**: Events stored in `behavior_events` table
4. **Admin Triggers Analysis**: Admin clicks "Analyze Behavior" (last 1 hour)
5. **Profile Calculation**: Backend aggregates events into `behavior_profiles`
6. **Decision Tree Classification**: 8 conditions evaluate behavior
7. **Suggestion Generation**: If issue detected, create suggestion
8. **User Notification**: Popup appears on user dashboard
9. **User Approval**: User accepts or rejects suggestion
10. **Admin Review**: Admin sees pending suggestions in admin dashboard
11. **Admin Approval**: Admin approves code changes for deployment
12. **Feedback Loop**: User/admin feedback used to retrain model

## Decision Tree: 8 Conditions

1. **Distracted/Inactive**: blur_count > 5 OR idle_count > 5
2. **Form Frustration**: form_interactions > 5 AND submit_success_rate < 0.5
3. **High Error Rate**: error_count > 2 AND submit_success_rate < 0.6
4. **Poor Discoverability**: scroll_count > 20 AND click_count < 10
5. **Low Engagement**: session_duration < 300 AND click_count < 20
6. **Form Abandonment**: form_interactions > 3 AND submit_success_rate < 0.3
7. **Feature Underutilization**: click_count > 30 AND scroll_count < 5
8. **Normal Engagement**: click_count > 50 AND submit_success_rate > 0.7 AND blur_count < 3

## Database Schema

Run `schema.sql` in MySQL to create all tables:
- `users`: User profiles
- `behavior_events`: Raw event logs
- `behavior_profiles`: Aggregated 1-hour behavior snapshots
- `suggestions`: Generated suggestions and their approval status
- `code_changes`: Proposed code changes
- `decision_tree_models`: Trained model storage
- `suggestion_feedback`: User feedback for model retraining

## Setup

### 1. Create MySQL Database

```sql
mysql> source schema.sql
```

### 2. Update Database Credentials

Edit `server.js` line ~10:
```javascript
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "YOUR_PASSWORD",
  database: "GenUx",
});
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start Server

```bash
npm start
```

Server runs on:
- **User Dashboard**: http://localhost:3000
- **Admin Dashboard**: http://localhost:3000/admin/

## Usage

### As a User

1. Open http://localhost:3000
2. Fill feedback form, search queries, ratings
3. Click "Analyze My Behavior Now" to trigger analysis
4. See suggestion popup
5. Accept or reject suggestion
6. Feedback is stored

### As an Admin

1. Click "Switch to Admin" button in user dashboard OR
2. Open http://localhost:3000/admin/ directly
3. See statistics: behavior profiles, avg clicks, unique users
4. See pending suggestions from users
5. Click "Review" to see suggestion details and code changes
6. Approve or reject
7. Train model when enough data collected
8. Export data as CSV

## API Endpoints

**User Events**
- `POST /api/events`: Store raw user event
- `POST /api/analyze-behavior`: Trigger 1-hour behavior analysis (returns suggestion)
- `POST /api/suggestion-feedback`: User approves/rejects suggestion

**Admin**
- `GET /api/admin/analytics`: Get summary stats
- `GET /api/admin/pending-suggestions`: Get all pending suggestions
- `POST /api/admin/approve-suggestion`: Approve suggestion for deployment
- `GET /api/admin/export-csv`: Export behavior profiles as CSV
- `POST /api/admin/train-model`: Train decision tree on all profiles

## Testing Workflow

1. **Interact with user dashboard**:
   - Fill multiple feedback entries
   - Click buttons, scroll, interact with forms
   - This generates ~50+ events per session

2. **Trigger analysis**:
   - Click "Analyze My Behavior Now"
   - System evaluates behavior against 8 conditions
   - If issue detected, suggestion popup appears

3. **Approve suggestion**:
   - User clicks "Apply This Change"
   - Event stored in database

4. **Review in admin panel**:
   - Switch to Admin
   - See suggestion in "Pending Suggestions" table
   - Click "Review"
   - See proposed code changes
   - Click "Approve & Deploy"

5. **Train model**:
   - After collecting 2+ behavior profiles
   - Click "Train Decision Tree"
   - Model trains on collected data

6. **Export data**:
   - Click "Export to CSV"
   - Download `behavior_data.csv` for research

## File Structure

```
/workspaces/GENUX/
├── server.js               # Express backend + all API endpoints
├── decisionEngine.js       # 8-condition decision tree logic
├── database.js             # MySQL connection (deprecated - now in server.js)
├── schema.sql              # Complete database schema
├── package.json            # Dependencies
├── public/index.html       # User dashboard
├── admin/index.html        # Admin dashboard
└── README.md               # This file
```

## Key Features Implemented

✅ Real-time event tracking (12+ event types)
✅ MySQL database integration
✅ On-demand behavior analysis (1-hour windows)
✅ 8-condition decision tree
✅ Suggestion generation & approval workflow
✅ Admin review & code change tracking
✅ Role-switching (user ↔ admin)
✅ CSV export for research
✅ User feedback collection
✅ Model training infrastructure

## Next Steps (Not in MVP)

- [ ] CI/CD pipeline for code deployment
- [ ] A/B testing framework
- [ ] Dynamic UI changes based on approved suggestions
- [ ] Multi-user behavior cohort analysis
- [ ] Real-time model retraining
- [ ] Advanced analytics dashboard

## Notes

- **Time Window**: Only last 1 hour of behavior analyzed per session
- **Decision Tree**: Rule-based logic (not ML model required for MVP)
- **Deployment**: Currently simulated - in production would create PR
- **Scalability**: Using file-based model storage (easy to upgrade to MLflow)

## Troubleshooting

**"DB connection failed"**
- Check MySQL is running: `sudo service mysql status`
- Verify credentials in server.js
- Check database exists: `mysql -u root -p GenUx -e "SHOW TABLES;"`

**No events showing**
- Check browser console for JavaScript errors
- Verify `/api/events` endpoint is receiving POST requests
- Query database: `SELECT COUNT(*) FROM behavior_events;`

**Suggestions not appearing**
- Need at least 5+ events in 1-hour window
- Check decision tree conditions match behavior
- Admin must not have all decisions filtered

---

**Status**: 60% complete (events → storage → analysis working; deployment & retraining next)
