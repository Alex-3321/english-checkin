/* 阅读文章生成：调用智谱文本模型，失败时回退内置文章库 */
const LIB = require('./article-library');

const PROMPT = `You are an English reading editor for Chinese college students.
Write ONE English article (5 paragraphs, 180-240 words, CEFR B2 level) on a random topic from: time management, sleep science, language learning, climate, AI, sportsmanship, failure, habits, focus, curiosity, cities and nature, music and the brain.
For each paragraph provide the English text and its Chinese translation. Add a one-sentence Chinese summary.

Return ONLY a JSON object, no markdown, no explanation:
{"title_en":"English title","title_cn":"中文标题","level":"四级","intro_cn":"一句话中文导读","paragraphs":[{"en":"English paragraph text.","zh":"该段中文翻译。"}],"summary_cn":"中文总结"}`;

function key() {
  return process.env.ZHIPU_API_KEY || process.env.AI_API_KEY || '';
}

function parseJSON(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}

function splitEn(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z"'])/)
    .map((x) => x.trim())
    .filter(Boolean);
}
function splitZh(text) {
  return String(text || '')
    .replace(/\s+/g, '')
    .split(/(?<=[。！？；])/)
    .map((x) => x.trim())
    .filter(Boolean);
}
function align(en, zh) {
  const e = splitEn(en), z = splitZh(zh);
  if (!e.length) return { en: [], zh: [] };
  if (e.length === z.length) return { en: e, zh: z };
  return { en: e, zh: [String(zh || '').trim() || e.join(' ')] };
}

function normalize(o) {
  if (!o || !Array.isArray(o.paragraphs) || !o.paragraphs.length) throw new Error('结构不完整');
  const paragraphs = o.paragraphs.map((p) => align(p.en, p.zh)).filter((p) => p.en.length);
  if (!paragraphs.length) throw new Error('正文为空');
  return {
    title_en: String(o.title_en || 'Daily Reading').slice(0, 120),
    title_cn: String(o.title_cn || '每日阅读').slice(0, 60),
    level: String(o.level || '四级').slice(0, 12),
    intro_cn: String(o.intro_cn || '').slice(0, 120),
    summary_cn: String(o.summary_cn || '').slice(0, 200),
    topic: String(o.topic || 'reading').slice(0, 30),
    paragraphs,
  };
}

async function generateArticle() {
  const apiKey = key();
  const provider = (process.env.AI_PROVIDER || 'mock').toLowerCase();
  if (provider === 'mock' || !apiKey) return LIB.pick();

  const url = process.env.AI_TEXT_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  const model = process.env.AI_TEXT_MODEL || 'glm-4-flash';
  const timeout = Number(process.env.AI_TEXT_TIMEOUT_MS || 25000);

  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.8,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: PROMPT }],
      }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    const art = normalize(parseJSON(text));
    art.source = 'AI 生成';
    return art;
  } catch (e) {
    lastErr = e;
    console.error(`[article] AI 生成失败（第 ${attempt + 1} 次）:`, e.message);
  }
  }
  const art = LIB.pick();
  art.source = '内置文章库';
  art.degraded = true;
  return art;
}

module.exports = { generateArticle };
