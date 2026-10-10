// Gemini over plain REST (no SDK). Server only. JSON mode with a response schema.
import { env, geminiModel, requireEnv } from '../env';

export interface Usage { input: number; output: number }
export interface GeminiResult<T> { data: T; usage: Usage; model: string; raw: string }

type Part = { text: string };
type Content = { role: 'user' | 'model'; parts: Part[] };

async function call(body: Record<string, unknown>, model: string): Promise<{ text: string; usage: Usage }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': requireEnv('GEMINI_API_KEY') },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const j = await res.json();
      const cand = j.candidates?.[0];
      const text = (cand?.content?.parts ?? []).map((p: Part) => p.text ?? '').join('');
      if (!text) throw new Error(`Gemini returned no text (finishReason=${cand?.finishReason ?? 'unknown'})`);
      const u = j.usageMetadata ?? {};
      // Thinking tokens are billed as output.
      return { text, usage: { input: u.promptTokenCount ?? 0, output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) } };
    }
    lastErr = `${res.status} ${(await res.text()).slice(0, 300)}`;
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  throw new Error(`Gemini error: ${lastErr}`);
}

const thinkingCfg = (model: string) => (/2\.5-flash(?!-lite)/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {});

export async function generateJson<T>(opts: { system: string; user: string; schema: unknown; model?: string }): Promise<GeminiResult<T>> {
  const model = opts.model ?? geminiModel();
  const { text, usage } = await call(
    {
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: [{ text: opts.user }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: opts.schema, ...thinkingCfg(model) },
    },
    model,
  );
  let data: T;
  try { data = JSON.parse(text) as T; } catch { throw new Error('Gemini returned invalid JSON: ' + text.slice(0, 200)); }
  return { data, usage, model, raw: text };
}

export async function generateChat(opts: { system: string; messages: { role: 'user' | 'model'; text: string }[]; model?: string }): Promise<{ text: string; usage: Usage; model: string }> {
  const model = opts.model ?? geminiModel();
  const contents: Content[] = opts.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  const { text, usage } = await call(
    { systemInstruction: { parts: [{ text: opts.system }] }, contents, generationConfig: { temperature: 0.4, maxOutputTokens: 400, ...thinkingCfg(model) } },
    model,
  );
  return { text, usage, model };
}

export const geminiConfigured = (): boolean => !!env('GEMINI_API_KEY');
