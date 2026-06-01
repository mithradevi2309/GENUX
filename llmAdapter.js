import fetch from 'node-fetch';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral';

/**
 * Generate dynamic suggestions using Ollama Mistral model
 * @param {Object} behavior - User behavior data
 * @param {Object} classification - Classification result from decision tree
 * @param {Array} userInputs - Recent user inputs/feedback
 * @returns {Promise<Object>} Suggestion object with text and reasoning
 */
export async function generateDynamicSuggestion(behavior, classification, userInputs = []) {
  try {
    const prompt = buildSuggestionPrompt(behavior, classification, userInputs);
    const response = await generateLLMResponse(prompt);
    
    return {
      text: response.trim(),
      generated_by: 'mistral',
      timestamp: new Date().toISOString(),
      reasoning: extractReasoningFromPrompt(prompt, response),
      confidence: classifyConfidence(response)
    };
  } catch (error) {
    console.error('LLM suggestion failed:', error.message);
    return null;
  }
}

/**
 * Generate UI code modifications based on behavior patterns
 * @param {Object} behavior - User behavior metrics
 * @param {Array} suggestions - Behavioral suggestions
 * @returns {Promise<Object>} Generated code changes
 */
export async function generateUICodeChanges(behavior, suggestions) {
  try {
    const prompt = buildUICodePrompt(behavior, suggestions);
    const response = await generateLLMResponse(prompt);
    
    return parseCodeGeneration(response);
  } catch (error) {
    console.error('UI code generation failed:', error.message);
    return null;
  }
}

/**
 * Stream LLM responses for real-time suggestion display
 */
export async function* streamLLMSuggestion(behavior, classification, userInputs = []) {
  const prompt = buildSuggestionPrompt(behavior, classification, userInputs);
  
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: true,
        temperature: 0.7,
        top_p: 0.9
      })
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      for (let i = 0; i < lines.length - 1; i++) {
        try {
          const data = JSON.parse(lines[i]);
          if (data.response) yield data.response;
        } catch (e) {
          // Skip malformed JSON
        }
      }
      buffer = lines[lines.length - 1];
    }
  } catch (error) {
    console.error('Streaming failed:', error.message);
  }
}

/**
 * Generate response from Ollama
 */
async function generateLLMResponse(prompt) {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        temperature: 0.7,
        top_p: 0.9
      })
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
    
    const data = await response.json();
    return data.response || '';
  } catch (error) {
    console.error('LLM generation error:', error);
    return null;
  }
}

/**
 * Build dynamic prompt for suggestion generation
 */
function buildSuggestionPrompt(behavior, classification, userInputs) {
  const recentInputsSummary = userInputs.slice(-3)
    .map(u => `- ${u.input_type}: "${u.search_query || u.feedback_text || u.discoverability_rating}/5}"`)
    .join('\n');

  return `You are a UX optimization expert. Analyze this user behavior and provide ONE specific, actionable suggestion.

USER BEHAVIOR METRICS:
- Clicks: ${behavior.click_count || 0}
- Scrolls: ${behavior.scroll_count || 0}
- Blur/Inactive: ${behavior.blur_count || 0}
- Idle time: ${behavior.idle_count} seconds
- Form interactions: ${behavior.form_interaction_count || 0}
- Errors encountered: ${behavior.error_count || 0}
- Form success rate: ${(behavior.submit_success_rate || 0).toFixed(2)}

BEHAVIOR CLASSIFICATION: ${classification?.class || 'Normal'}
TRIGGERING CONDITIONS: ${classification?.reason || 'Standard'}

RECENT USER FEEDBACK:
${recentInputsSummary || 'No recent feedback'}

GENERATE A SPECIFIC SUGGESTION (max 1 sentence):
- If behavior shows high errors: suggest improving form validation or error messages
- If behavior shows low engagement: suggest highlighting key features or simplifying navigation
- If behavior shows distraction: suggest reducing visual clutter or notifications
- If behavior shows form frustration: suggest breaking forms into steps or adding help text
- Otherwise: suggest a personalized engagement improvement based on the metrics above

Respond with ONLY the suggestion text, no preamble.`;
}

/**
 * Build prompt for UI code generation
 */
function buildUICodePrompt(behavior, suggestions) {
  return `You are a frontend developer. Generate HTML/CSS/JS modifications for the user dashboard based on these behavior patterns:

BEHAVIOR PATTERNS:
${suggestions.map(s => `- ${s}`).join('\n')}

CONSTRAINTS:
- Only modify public/index.html, related CSS, and frontend JS
- Keep changes minimal and focused
- Use modern CSS (flexbox/grid)
- Maintain accessibility
- Do not modify backend APIs or admin dashboard

Generate code changes as a JSON object with:
{
  "file": "public/index.html",
  "changes": [
    {"type": "add|modify|remove", "element": "selector", "change": "description", "code": "HTML/CSS/JS"}
  ]
}

Respond with ONLY the JSON, no markdown or explanation.`;
}

/**
 * Parse generated code from LLM response
 */
function parseCodeGeneration(response) {
  try {
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      file_path: parsed.file || 'public/index.html',
      component: 'dashboard',
      changes: parsed.changes || [],
      generated_at: new Date().toISOString(),
      llm_generated: true
    };
  } catch (error) {
    console.error('Code parsing failed:', error);
    return null;
  }
}

/**
 * Extract reasoning from generation process
 */
function extractReasoningFromPrompt(prompt, response) {
  const metrics = {
    high_errors: prompt.includes('error_count') && prompt.includes('4'),
    high_blur: prompt.includes('blur_count') && prompt.includes('5'),
    low_engagement: prompt.includes('click_count') && prompt.includes('10'),
  };
  
  return Object.entries(metrics)
    .filter(([_, v]) => v)
    .map(([k, _]) => k.replace(/_/g, ' '))
    .join(', ') || 'Behavior analysis';
}

/**
 * Classify confidence level of suggestion
 */
function classifyConfidence(response) {
  if (!response) return 0.5;
  
  // Longer responses often indicate more considered suggestions
  const lengthScore = Math.min(response.length / 100, 1);
  
  // Presence of specific metrics and actions increases confidence
  const hasMetrics = /\b(click|scroll|error|form|navigation)\b/i.test(response);
  const hasAction = /\b(simplify|improve|add|enable|reduce)\b/i.test(response);
  
  return Math.round((lengthScore + (hasMetrics ? 0.2 : 0) + (hasAction ? 0.2 : 0)) * 100) / 100;
}

/**
 * Check if Ollama is available
 */
export async function checkOllamaAvailability() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { timeout: 2000 });
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Get available models from Ollama
 */
export async function getAvailableModels() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    const data = await response.json();
    return data.models || [];
  } catch (error) {
    console.error('Failed to fetch models:', error);
    return [];
  }
}

export default {
  generateDynamicSuggestion,
  generateUICodeChanges,
  streamLLMSuggestion,
  checkOllamaAvailability,
  getAvailableModels
};
