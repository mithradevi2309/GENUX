




















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
      text: "We noticed you're switching tabs frequently. Try focus mode?",
      component: "dashboard",
      action: "enable_focus_mode",
    },
    form_frustration: {
      text: "Form interactions seem difficult. Should we simplify the form layout?",
      component: "form",
      action: "simplify_form",
    },
    high_error_rate: {
      text: "Errors appearing often. We can add better validation feedback.",
      component: "form",
      action: "improve_validation",
    },
    poor_discoverability: {
      text: "You're scrolling a lot. Should we make search or key features more visible?",
      component: "search_bar",
      action: "increase_visibility",
    },
    low_engagement_bounce: {
      text: "Quick visit. Need a guided tour or help with navigation?",
      component: "dashboard",
      action: "show_tour",
    },
    form_abandonment: {
      text: "You started filling a form but didn't submit. Any issues we can fix?",
      component: "form",
      action: "clarify_form",
    },
    feature_underutilized: {
      text: "You're focused but using few features. Want to explore more?",
      component: "dashboard",
      action: "suggest_features",
    },
    default: {
      text: "Your usage looks good! Keep going.",
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

