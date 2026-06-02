// RALD Notify — Template Engine — LILCKY STUDIO LIMITED
// Supports: {{variable}}, {{variable|default}}, localization-ready

export interface TemplateContext {
  [key: string]: string | number | boolean | null | undefined;
}

export interface RenderResult {
  subject?: string;
  body: string;
  html?: string;
  preview?: string;
}

/**
 * Render a template string with variable substitution.
 * Syntax: {{variable}} or {{variable|fallback}}
 */
export function renderTemplate(template: string, context: TemplateContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, expr) => {
    const [key, fallback] = expr.trim().split("|").map((s: string) => s.trim());
    const value = context[key];
    if (value === null || value === undefined || value === "") {
      return fallback ?? "";
    }
    return String(value);
  });
}

export function renderNotification(
  subject: string | null,
  bodyText: string,
  bodyHtml: string | null,
  context: TemplateContext
): RenderResult {
  return {
    subject: subject ? renderTemplate(subject, context) : undefined,
    body: renderTemplate(bodyText, context),
    html: bodyHtml ? renderTemplate(bodyHtml, context) : undefined,
    preview: renderTemplate(bodyText, context).slice(0, 140),
  };
}

export function extractVariables(template: string): string[] {
  const matches = template.match(/\{\{([^}|]+)(\|[^}]*)?\}\}/g) ?? [];
  return [...new Set(matches.map(m => m.replace(/\{\{([^}|]+).*\}\}/, "$1").trim()))];
}

export function validateTemplate(subject: string | null, body: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const testCtx: TemplateContext = {};
  try { renderTemplate(body, testCtx); } catch { errors.push("Body template syntax error"); }
  if (subject) {
    try { renderTemplate(subject, testCtx); } catch { errors.push("Subject template syntax error"); }
  }
  return { valid: errors.length === 0, errors };
}
