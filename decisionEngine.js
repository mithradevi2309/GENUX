




















import { DecisionTreeClassifier } from "ml-cart";
import fs from "fs";

const modelPath = "model.json";

export function preprocessBehavior(behavior) {
  const clickScore = behavior.click_count > 100 ? 3 : behavior.click_count > 50 ? 2 : 1;
  const scrollScore = behavior.scroll_count > 50 ? 3 : behavior.scroll_count > 20 ? 2 : 1;
  const blurScore = behavior.blur_count > 5 ? 3 : behavior.blur_count > 2 ? 2 : 1;
  const idleScore = behavior.idle_count > 5 ? 3 : behavior.idle_count > 2 ? 2 : 1;
  const formScore = behavior.form_interaction_count > 5 ? 3 : behavior.form_interaction_count > 2 ? 2 : 1;
  const errorScore = behavior.error_count > 2 ? 3 : behavior.error_count > 0 ? 2 : 1;
  const durationScore = behavior.session_duration > 600 ? 3 : behavior.session_duration > 300 ? 2 : 1;
  const submitScore = behavior.submit_success_rate > 0.8 ? 1 : 2;

  return [clickScore, scrollScore, blurScore, idleScore, formScore, errorScore, durationScore, submitScore];
}

export function classifyBehaviorMultiCondition(behavior) {
  const conditions = evaluateConditions(behavior);

  // 7-8 Decision Conditions
  if (conditions.distracted || conditions.inactive) {
    return { class: "AtRisk", reason: "user_distracted_inactive" };
  }
  if (conditions.formFrustration) {
    return { class: "AtRisk", reason: "form_frustration" };
  }
  if (conditions.highErrorRate) {
    return { class: "AtRisk", reason: "high_error_rate" };
  }
  if (conditions.poorDiscoverability) {
    return { class: "LowEngagement", reason: "poor_discoverability" };
  }
  if (conditions.lowEngagement) {
    return { class: "LowEngagement", reason: "low_engagement_bounce" };
  }
  if (conditions.formAbandonment) {
    return { class: "LowEngagement", reason: "form_abandonment" };
  }
  if (conditions.featureUnderutilization) {
    return { class: "Normal", reason: "feature_underutilized" };
  }
  if (conditions.normalEngagement) {
    return { class: "Engaged", reason: "normal_behavior" };
  }

  return { class: "Normal", reason: "default" };
}

function evaluateConditions(behavior) {
  return {
    // Condition 1: User distracted or inactive
    distracted: behavior.blur_count > 5,
    inactive: behavior.idle_count > 5,

    // Condition 2: Form frustration (repeated attempts, errors)
    formFrustration:
      behavior.form_interaction_count > 0 && behavior.submit_success_rate < 0.5 && behavior.form_interaction_count > 5,

    // Condition 3: High error rate
    highErrorRate: behavior.error_count > 2 && behavior.submit_success_rate < 0.6,

    // Condition 4: Poor discoverability (scrolling but not clicking)
    poorDiscoverability: behavior.scroll_count > 20 && behavior.click_count < 10,

    // Condition 5: Low engagement (short session, few interactions)
    lowEngagement: behavior.session_duration < 300 && behavior.click_count < 20,

    // Condition 6: Form abandonment (focus on form, then blur without submit)
    formAbandonment: behavior.form_interaction_count > 3 && behavior.submit_success_rate < 0.3,

    // Condition 7: Feature underutilization (few unique components used)
    featureUnderutilization: behavior.click_count > 30 && behavior.scroll_count < 5,

    // Condition 8: Normal engagement
    normalEngagement: behavior.click_count > 50 && behavior.submit_success_rate > 0.7 && behavior.blur_count < 3,
  };
}

export function generateSuggestion(classificationResult, behavior) {
  const suggestions = {
    user_distracted_inactive: {
      text: "We noticed frequent tab switching (blur_count: " + behavior.blur_count + "). Try enabling a focus mode that minimizes distractions and hides off-topic sections.",
      actionDetails: {
        uiComponent: "Focus Mode Toggle",
        location: "Top navbar",
        change: "Add collapsible focus mode that hides non-essential UI and highlights primary actions",
      },
      component: "dashboard",
      action: "enable_focus_mode",
    },
    form_frustration: {
      text: "Form interactions are high (" + behavior.form_interaction_count + ") with low success (" + Math.round(behavior.submit_success_rate * 100) + "%). Let's break the form into smaller steps and add inline validation.",
      actionDetails: {
        uiComponent: "Form Layout",
        location: "Form container",
        change: "Split multi-section forms into step-by-step wizard; show real-time validation errors beneath each field",
      },
      component: "form",
      action: "simplify_form",
    },
    high_error_rate: {
      text: "Error frequency is high (" + behavior.error_count + " errors). We should add clearer error messages and suggest corrections.",
      actionDetails: {
        uiComponent: "Error Messages",
        location: "Form fields",
        change: "Replace generic error text with specific hints (e.g., 'Email must include @domain.com') and highlight affected fields in red",
      },
      component: "form",
      action: "improve_validation",
    },
    poor_discoverability: {
      text: "You scrolled a lot (" + behavior.scroll_count + ") but clicked rarely (" + behavior.click_count + "). Key features may be hard to find.",
      actionDetails: {
        uiComponent: "Search Bar & Navigation",
        location: "Header/sidebar",
        change: "Promote search bar to header, add a quick action menu with top 5 features, and use visual hierarchy to emphasize clickable sections",
      },
      component: "search_bar",
      action: "increase_visibility",
    },
    low_engagement_bounce: {
      text: "Short session (" + Math.round(behavior.session_duration / 60) + " sec). A guided tour or help panel could improve exploration.",
      actionDetails: {
        uiComponent: "Onboarding Overlay",
        location: "Full screen initially",
        change: "Add a dismissible step-by-step tour on first visit, or a floating help widget with contextual tips per section",
      },
      component: "dashboard",
      action: "show_tour",
    },
    form_abandonment: {
      text: "You started a form (" + behavior.form_interaction_count + " interactions) but didn't submit. Was something unclear?",
      actionDetails: {
        uiComponent: "Form Submission Incentive",
        location: "Bottom of form",
        change: "Add a progress bar showing how many fields remain, a 'Save Draft' button, and remove optional-field clutter",
      },
      component: "form",
      action: "clarify_form",
    },
    feature_underutilized: {
      text: "Focused usage but limited feature exploration. You used " + behavior.click_count + " interactions across few areas.",
      actionDetails: {
        uiComponent: "Feature Discovery Panel",
        location: "Sidebar or collapsible menu",
        change: "Show a 'You might like' recommendations panel with icons and brief descriptions of unused features",
      },
      component: "dashboard",
      action: "suggest_features",
    },
    default: {
      text: "Your usage looks good! Keep going.",
      actionDetails: {
        uiComponent: "None",
        location: "N/A",
        change: "No change needed.",
      },
      component: "dashboard",
      action: "none",
    },
  };

  return suggestions[classificationResult.reason] || suggestions.default;
}

export function trainModel(behaviors) {
  const data = behaviors.map(preprocessBehavior);
  const labels = behaviors.map((b) => classifyBehaviorMultiCondition(b).class);

  if (data.length < 2) {
    return null;
  }

  try {
    const clf = new DecisionTreeClassifier();
    clf.train(data, labels);
    fs.writeFileSync(modelPath, JSON.stringify(clf, null, 2));
    return clf;
  } catch (error) {
    console.error("Training error:", error.message);
    return null;
  }
}

export function predictBehavior(behavior) {
  return classifyBehaviorMultiCondition(behavior);
}

/**
 * Simple Lightweight Naive Bayes for Sentiment Analysis
 * Perfect for Codespace RAM/CPU constraints - no external ML deps needed
 * Classifies user feedback text into sentiment categories for adaptive suggestions
 */
export class SimpleSentimentClassifier {
  constructor() {
    // Pre-trained simple word scores (positive, negative, neutral)
    this.vocabulary = {
      positive: [
        "excellent", "great", "good", "love", "easy", "simple", "clear", "helpful",
        "improved", "better", "amazing", "awesome", "wonderful", "perfect", "liked"
      ],
      negative: [
        "bad", "poor", "difficult", "hard", "confusing", "error", "failed", "broken",
        "slow", "frustrating", "annoying", "hate", "awful", "terrible", "worst"
      ],
      neutral: [
        "ok", "fine", "average", "normal", "regular", "standard", "typical", "moderate"
      ],
    };
  }

  classify(text) {
    if (!text) return "neutral";
    
    const words = text.toLowerCase().split(/\s+/);
    let positiveScore = 0;
    let negativeScore = 0;
    let neutralScore = 0;

    words.forEach(word => {
      if (this.vocabulary.positive.some(v => word.includes(v))) positiveScore++;
      if (this.vocabulary.negative.some(v => word.includes(v))) negativeScore++;
      if (this.vocabulary.neutral.some(v => word.includes(v))) neutralScore++;
    });

    if (positiveScore > negativeScore && positiveScore > neutralScore) return "positive";
    if (negativeScore > positiveScore && negativeScore > neutralScore) return "negative";
    return "neutral";
  }
}

/**
 * Adaptive Learning: Track suggestion effectiveness and adjust future suggestions
 * Lightweight adaptation mechanism for continuously improving UI recommendations
 */
export function recordSuggestionFeedback(suggestionId, userFeedback, userSentiment) {
  // This will be used to train the model on what suggestions actually helped
  // Stored in DB via /api/record-feedback endpoint for later analysis
  return {
    suggestionId,
    feedback: userFeedback,
    sentiment: userSentiment,
    timestamp: Date.now(),
  };
}

/**
 * Calculate adaptive suggestion score based on historical feedback
 * Tracks which UI changes worked best for similar behavior patterns
 */
export function getAdaptiveSuggestion(classificationResult, behavior, historicalFeedback = []) {
  let baseSuggestion = generateSuggestion(classificationResult, behavior);
  
  // If we have historical data, boost confidence for suggestions that worked well
  if (historicalFeedback && historicalFeedback.length > 0) {
    const similarFeedback = historicalFeedback.filter(
      fb => fb.reason === classificationResult.reason && fb.feedback === "accepted"
    );
    
    if (similarFeedback.length >= 2) {
      baseSuggestion.confidence = 0.9;
      baseSuggestion.adaptive = true;
    }
  }
  
  return baseSuggestion;
}

