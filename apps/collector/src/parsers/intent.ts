export function classifyIntent(text: string): string {
  const t = text.slice(0, 2000).trim();
  if (
    t.length < 40 &&
    /^(sure|yes|yep|yeah|ok(ay)?|go|do it|continue|more|next|ship it|proceed|right|correct|good|perfect|ya|yup)\.?!?$/i.test(t)
  )
    return "approval";
  if (/\b(fix|bug|error|broken|crash|fail|wrong|issue|not working|doesn'?t work)\b/i.test(t)) return "bugfix";
  if (/\b(refactor|clean ?up|simplify|rename|extract|reorganize|consolidat|swap|replace|delete|remove|dedupe)\b/i.test(t))
    return "refactor";
  if (/\b(add|build|create|implement|new|make|wire|setup|integrate|connect)\b/i.test(t)) return "feature";
  if (/\b(how|what|why|explain|show me|where is|tell me|can you|should i|check|verify|inspect|look at|understand)\b/i.test(t))
    return "exploration";
  return "other";
}

export const TEACHER_RE =
  /\b(no|wrong|that'?s not|actually|instead|don'?t|undo|revert|not like that|nope)\b/i;
export const FRUSTRATION_RE = /\b(fuck|shit|wtf|damn|ugh)\b|!{2,}|\b[A-Z]{4,}\b/;
