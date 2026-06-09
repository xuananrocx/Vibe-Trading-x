import i18next from "i18next";

export function localizeToolName(tool: string, fallback?: string): string {
  const t = i18next.t;
  const key = `tools.${tool}`;
  const translated = t(key);
  if (translated !== key) return translated;
  if (fallback !== undefined) return fallback;
  return tool;
}
