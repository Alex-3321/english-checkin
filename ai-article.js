/* 阅读文章生成：调用智谱文本模型，失败时回退内置文章库 */
const LIB = require('./article-library');

const PROMPT = `你是一位英语学习内容编辑，为大学生编写每日精读短文。
请生成一篇英文短文，主题从以下方向随机选一个（不要重复）：时间管理、睡眠科学、语言学习、气候变化、人工智能、运动精神、失败的价值、习惯养成、专注力、好奇心、城市与自然、音乐与大脑。

要求：
1. 英文正文 5 个自然段，每段 2-3 句，总词数 180-240，难度为大学英语四级。
2. 每个自然段都要有对应中文翻译；英文按句子拆分成数组，中文与英文句数一一对应。
3. 结尾给出一句中文总结（30 字左右），点出文章主旨。
4. 标题要中英结合：title_en 为英文标题，title_cn 为中文标题。
5. 只输出 JSON，不要任何解释、不要 Markdown 代码块。

JSON 结构：
{"title_en":"...","title_cn":"...","level":"四级","intro_cn":"一句话中文导读","paragraphs":[{"en":["sentence1","sentence2"],"zh":["句1中文","句2中文"]}],"summary_cn":"中文总结","topic":"sleep"}`;

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

function normalize(o) {
  if (!o || !Array.isArray(o.paragraphs) || !o.paragraphs.length) throw new Error('结构不完整');
  const paragraphs = o.paragraphs.map((p) => ({
    en: Array.isArray(p.en) ? p.en.map(String) : [String(p.en || '')],
    zh: Array.isArray(p.zh) ? p.zh.map(String) : [String(p.zh || '')],
  })).filter((p) => p.en.join('').trim());
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

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.8,
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
    console.error('[article] AI 生成失败，回退内置库:', e.message);
    const art = LIB.pick();
    art.source = '内置文章库';
    art.degraded = true;
    return art;
  }
}

module.exports = { generateArticle };
