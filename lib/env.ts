export const env = (k: string): string => process.env[k] ?? '';
export const envBool = (k: string, dflt = false): boolean => {
  const v = (process.env[k] ?? '').toLowerCase();
  return v === '' ? dflt : ['1', 'true', 'yes', 'on'].includes(v);
};
export const requireEnv = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing environment variable ${k}`);
  return v;
};
export const appBase = (): string => (env('APP_BASE_URL') || 'http://localhost:3000').replace(/\/$/, '');
export const geminiModel = (): string => env('GEMINI_MODEL') || 'gemini-3.8-flash';
