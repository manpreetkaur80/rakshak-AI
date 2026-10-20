/**
 * AI Service — wraps Gemini API + rule-based fallback classifier
 */

const VALID_TYPES = ["fire", "flood", "medical", "accident", "industrial", "structural", "other"];
const VALID_SEVERITIES = ["low", "medium", "high", "critical"];
const VALID_PRIORITIES = ["P1", "P2", "P3", "P4"];

// ---------------------------------------------------------------------------
// Rule-based fallback classifier
// ---------------------------------------------------------------------------

const FIRE_KEYWORDS = ["fire", "smoke", "burning", "flames", "blaze", "ablaze", "inferno", "arson"];
const FLOOD_KEYWORDS = ["flood", "flooding", "water level", "overflow", "waterlogging", "submerged", "drowning", "inundated"];
const MEDICAL_KEYWORDS = ["ambulance", "injured", "unconscious", "bleeding", "medical", "heart attack", "stroke", "seizure", "collapsed", "overdose", "breathe", "chest pain"];
const ACCIDENT_KEYWORDS = ["crash", "collision", "vehicle accident", "road accident", "car accident", "bike accident", "truck accident", "hit and run", "overturned", "skid"];
const INDUSTRIAL_KEYWORDS = ["chemical", "factory", "gas leak", "industrial", "toxic gas", "plant explosion", "hazmat", "chemical spill"];
const STRUCTURAL_KEYWORDS = ["building collapsed", "collapse", "collapsed building", "structural damage", "wall collapsed", "ceiling collapsed", "foundation"];

const CRITICAL_KEYWORDS = ["explosion", "trapped", "collapse", "multiple casualties", "people trapped", "spreading fire", "mass casualty", "people trapped", "cannot escape", "stuck inside"];
const HIGH_KEYWORDS = ["major fire", "serious injury", "heavy flooding", "gas leak", "multiple injuries", "dangerous", "out of control"];
const MEDIUM_KEYWORDS = ["minor accident", "localized flooding", "small fire", "single injury"];

function ruleBasedClassify(description) {
  const text = description.toLowerCase();

  // Determine type
  let type = "other";
  if (FIRE_KEYWORDS.some((k) => text.includes(k))) type = "fire";
  else if (FLOOD_KEYWORDS.some((k) => text.includes(k))) type = "flood";
  else if (MEDICAL_KEYWORDS.some((k) => text.includes(k))) type = "medical";
  else if (ACCIDENT_KEYWORDS.some((k) => text.includes(k))) type = "accident";
  else if (INDUSTRIAL_KEYWORDS.some((k) => text.includes(k))) type = "industrial";
  else if (STRUCTURAL_KEYWORDS.some((k) => text.includes(k))) type = "structural";

  // Determine severity
  let severity = "medium";
  if (CRITICAL_KEYWORDS.some((k) => text.includes(k))) severity = "critical";
  else if (HIGH_KEYWORDS.some((k) => text.includes(k))) severity = "high";
  else if (MEDIUM_KEYWORDS.some((k) => text.includes(k))) severity = "medium";
  else if (type !== "other") severity = "medium";
  else severity = "low";

  // Map severity to priority
  const priorityMap = { critical: "P1", high: "P2", medium: "P3", low: "P4" };
  const priority = priorityMap[severity];

  // Build recommended actions based on type
  const actionsMap = {
    fire: ["Dispatch fire response team", "Check for trapped civilians", "Request medical support", "Establish traffic/crowd control"],
    flood: ["Dispatch rescue team", "Alert downstream areas", "Establish evacuation routes", "Request medical support"],
    medical: ["Dispatch ambulance", "Notify nearest hospital", "Secure scene for responders"],
    accident: ["Dispatch ambulance and police", "Secure accident scene", "Control traffic flow", "Check for fuel leaks"],
    industrial: ["Dispatch hazmat team", "Evacuate nearby area", "Notify industrial safety authority", "Request medical support"],
    structural: ["Dispatch rescue team", "Evacuate immediate area", "Check for trapped civilians", "Secure perimeter"],
    other: ["Review the incident details", "Verify the reported location", "Dispatch nearest responder"],
  };

  const summaryMap = {
    fire: "A fire incident has been reported. Immediate response may be required.",
    flood: "A flooding incident has been reported. Evacuation and rescue may be required.",
    medical: "A medical emergency has been reported. Medical response required.",
    accident: "A vehicle accident has been reported. Emergency response required.",
    industrial: "An industrial/chemical incident has been reported. Specialized response required.",
    structural: "A structural incident has been reported. Rescue and evacuation may be required.",
    other: "An emergency has been reported. Operator review required.",
  };

  return {
    type,
    severity,
    priority,
    confidence: type === "other" ? 0.45 : 0.72,
    summary: summaryMap[type] || "Emergency report requires operator review.",
    recommendedActions: actionsMap[type] || actionsMap.other,
    provider: "rules",
    isFallback: true,
    classifiedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateAIOutput(result) {
  if (!result || typeof result !== "object") return false;
  if (!VALID_TYPES.includes(result.type)) return false;
  if (!VALID_SEVERITIES.includes(result.severity)) return false;
  if (!VALID_PRIORITIES.includes(result.priority)) return false;
  const conf = parseFloat(result.confidence);
  if (isNaN(conf) || conf < 0 || conf > 1) return false;
  if (typeof result.summary !== "string" || !result.summary) return false;
  if (!Array.isArray(result.recommendedActions)) return false;
  return true;
}

function normalizeAIOutput(result) {
  return {
    type: (result.type || "other").toLowerCase(),
    severity: (result.severity || "medium").toLowerCase(),
    priority: (result.priority || "P3").toUpperCase(),
    confidence: Math.min(1, Math.max(0, parseFloat(result.confidence) || 0.5)),
    summary: (result.summary || "").trim(),
    recommendedActions: Array.isArray(result.recommendedActions)
      ? result.recommendedActions.map((a) => String(a).trim())
      : [],
    provider: result.provider || "gemini",
    isFallback: result.isFallback || false,
    classifiedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Gemini classification
// ---------------------------------------------------------------------------

async function geminiClassify(description, typeHint = "") {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `You are an emergency operations classification assistant.

Analyze the provided emergency report and return ONLY valid JSON with no markdown, no code blocks, no explanation.

Allowed type values: fire, flood, medical, accident, industrial, structural, other
Allowed severity values: low, medium, high, critical
Allowed priority values: P1, P2, P3, P4

Rules:
1. Use only information provided in the report.
2. Do not invent casualties, locations, resources, or actions already completed.
3. Critical means immediate or potentially life-threatening danger.
4. High means significant emergency requiring rapid response.
5. Medium means a localized emergency with limited immediate danger.
6. Low means a minor or limited incident.
7. Priority maps from severity: critical=P1, high=P2, medium=P3, low=P4
8. Confidence must be a number between 0.0 and 1.0.
9. Summary must be 1-2 sentences, factual, concise.
10. Recommended actions are advisory suggestions only.
11. Never claim emergency services were contacted or dispatched.
12. Never claim resources were dispatched.
${typeHint ? `13. Citizen-selected category hint: ${typeHint}` : ""}

Return EXACTLY this JSON structure:
{
  "type": "...",
  "severity": "...",
  "priority": "...",
  "confidence": 0.0,
  "summary": "...",
  "recommendedActions": []
}

Emergency report:
${description}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const result = await model.generateContent(prompt);
    clearTimeout(timeout);
    const text = result.response.text().trim();

    // Strip markdown code fences if present
    const jsonStr = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(jsonStr);
    return parsed;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Main classify function
// ---------------------------------------------------------------------------

async function classify(description, typeHint = "") {
  // Try Gemini first
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const raw = await geminiClassify(description, typeHint);
      const normalized = normalizeAIOutput({ ...raw, provider: "gemini", isFallback: false });
      if (validateAIOutput(normalized)) {
        return normalized;
      }
      console.warn("Gemini output failed validation, using fallback");
    } catch (err) {
      console.warn("Gemini classification failed:", err.message, "— using rule fallback");
    }
  } else {
    console.log("No GEMINI_API_KEY, using rule-based classifier");
  }

  // Rule-based fallback
  return ruleBasedClassify(description);
}

module.exports = { classify, ruleBasedClassify, validateAIOutput, normalizeAIOutput };
