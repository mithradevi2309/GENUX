export function buildBehaviorProfile(events) {
  if (!events || !events.length) {
    return { features: {}, issues: [], summary: "No events available." };
  }

  const counts = {};
  const components = new Set();
  const pageViews = new Set();
  let first = events[0].timestamp;
  let last = events[0].timestamp;

  events.forEach((event) => {
    counts[event.event] = (counts[event.event] || 0) + 1;
    if (event.component) components.add(event.component);
    if (event.event === "page_view" && event.page) pageViews.add(event.page);
    first = Math.min(first, event.timestamp);
    last = Math.max(last, event.timestamp);
  });

  const durationSeconds = Math.max((last - first) / 1000, 1);
  const submitClicks = events.filter((e) => e.event === "submit").length;
  const failedSubmit = events.filter((e) => e.event === "form_submit_failed").length;
  const successSubmit = events.filter((e) => e.event === "form_submit_success").length;
  const repeatedSubmit = events.filter((event, index) => {
    if (event.event !== "submit") return false;
    return events.some(
      (previous) =>
        previous !== event &&
        previous.event === "submit" &&
        previous.component === event.component &&
        event.timestamp - previous.timestamp < 10000
    );
  }).length;

  const blurCount = counts.blur || 0;
  const idleCount = counts.idle || 0;
  const inputCount = counts.input || 0;

  const features = {
    durationSeconds,
    totalEvents: events.length,
    eventRatePerSecond: +(events.length / durationSeconds).toFixed(2),
    uniqueComponents: components.size,
    pageViews: pageViews.size,
    clickCount: counts.click || 0,
    scrollCount: counts.scroll || 0,
    hoverCount: counts.hover || 0,
    focusCount: counts.focus || 0,
    blurCount,
    inputCount,
    submitClicks,
    failedSubmit,
    successSubmit,
    repeatedSubmit,
    idleCount,
  };

  // Interpretation logic
  const blurStatus = interpretBlur(blurCount);
  const idleStatus = interpretIdle(idleCount);
  const engagementStatus = interpretEngagement(
    features.clickCount,
    features.scrollCount,
    durationSeconds
  );

  const issues = [];
  if (failedSubmit > 0 || repeatedSubmit > 1) {
    issues.push("form_submission_issue");
  }
  if (features.scrollCount > 10 && features.clickCount < 4) {
    issues.push("discoverability_issue");
  }
  if (features.hoverCount > 5 && features.clickCount < 3) {
    issues.push("interaction_confusion");
  }
  if (blurStatus === "Distracted") {
    issues.push("user_distracted");
  }
  if (idleStatus === "Inactive") {
    issues.push("user_inactive");
  }

  const summary = [];
  if (issues.length === 0) {
    summary.push("Behavior looks normal for this session.");
  }
  if (blurStatus === "Distracted") {
    summary.push("User appears distracted (frequent tab switches).");
  }
  if (idleStatus === "Inactive") {
    summary.push("User showing low activity (idle periods detected).");
  }

  return { features, issues, summary, blurStatus, idleStatus, engagementStatus };
}

function interpretBlur(blurCount) {
  if (blurCount <= 2) return "Focused";
  if (blurCount <= 5) return "Moderate";
  return "Distracted";
}

function interpretIdle(idleCount) {
  if (idleCount <= 2) return "Active";
  if (idleCount <= 5) return "Passive";
  return "Inactive";
}

function interpretEngagement(clicks, scrolls, duration) {
  const rate = (clicks + scrolls) / Math.max(duration, 1);
  if (rate > 5) return "HighlyEngaged";
  if (rate > 1) return "Engaged";
  return "LowEngagement";
}

export function suggestImprovements(profile) {
  const suggestions = [];
  if (profile.issues.includes("form_submission_issue")) {
    suggestions.push({
      component: "feedback_form",
      action: "highlight_submit_feedback",
      details: "Show success or error guidance after submit and disable repeated clicks.",
    });
  }
  if (profile.issues.includes("user_distracted")) {
    suggestions.push({
      component: "dashboard",
      action: "focus_mode",
      details: "Consider enabling focus mode to reduce distractions.",
    });
  }
  if (profile.issues.includes("user_inactive")) {
    suggestions.push({
      component: "dashboard",
      action: "engagement_prompt",
      details: "You seem inactive. Need help navigating?",
    });
  }
  if (suggestions.length === 0) {
    suggestions.push({
      component: "dashboard",
      action: "continue_monitoring",
      details: "Behavior looks good. Continuing to monitor.",
    });
  }
  return suggestions;
}

