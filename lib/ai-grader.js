'use strict';
/* AI 阅卷：双轨制 Prompt + 多家视觉模型适配 + Mock 模式
 * 配置（.env）：
 *   AI_PROVIDER = mock | zhipu | qwen     默认 mock
 *   AI_API_KEY  = 你的 Key
 *   AI_MODEL    = 默认 glm-4.6v-flash（失败自动回退 glm-4v-flash）
 *   AI_BASE_URL = 自定义网关（可选）
 *   AI_TIMEOUT_MS = 超时毫秒，默认 20000
 */

const crypto = require('node:crypto');

const PROVIDERS = {
  zhipu: { url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4.6v-flash', dataUri: false },
  qwen:  { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-vl-plus', dataUri: true },
};

const LEVELS = ['A', 'B', 'C', 'INVALID'];
const POINTS = { A: 30, B: 25, C: 23 };

const PROMPT = `你是英语打卡系统的AI阅卷老师。请判断用户上传的图片属于以下哪种情况，并严格返回JSON：

- 如果是百词斩/扇贝等APP截图：检查截图中的日期是否为今天/昨天。如果不是，返回{"level":"INVALID","comment":"截图日期不是今天，请上传今日学习截图"}。如果是今天，根据背词数量评级：>50个为A，20-50个为B，<20个为C。
- 如果是手写笔记：字迹清晰丰富为A，书本批注少量为B，模糊/封面为C。
- 如果与英语学习无关（风景/自拍/表情包），返回{"level":"INVALID","comment":"请上传真实的英语学习照片"}。

返回格式：{"level":"A/B/C/INVALID","comment":"评语"}
只输出 JSON，不要 markdown 代码块，不要额外解释。`;

function md5(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

/* Mock：按图片 md5 首字符决定等级，便于测试三种结果 */
function mockGrade(buffer) {
  const h = md5(buffer);
  const c = h[0];
  if ('0123'.includes(c)) return { level: 'A', comment: '页面内容丰富，背词量超过 50，评级 A。' };
  if ('4567'.includes(c)) return { level: 'B', comment: '完成基础学习任务，评级 B。' };
  if ('89ab'.includes(c)) return { level: 'C', comment: '学习记录偏少，评级 C。' };
  return { level: 'INVALID', comment: '未识别到有效的英语学习内容。' };
}

function extractJSON(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    return obj;
  } catch { return null; }
}

function normalize(obj) {
  const level = String(obj && obj.level || '').toUpperCase().trim();
  const comment = String(obj && obj.comment || '').slice(0, 120).trim();
  if (!LEVELS.includes(level)) return null;
  return { level, comment: comment || 'AI 已完成评定。' };
}

async function gradeImage(buffer, mime = 'image/jpeg') {
  const provider = (process.env.AI_PROVIDER || 'mock').toLowerCase();
  const apiKey = process.env.ZHIPU_API_KEY || process.env.AI_API_KEY || '';
  if (provider === 'mock' || !apiKey) return { ...mockGrade(buffer), provider: 'mock' };

  const conf = PROVIDERS[provider] || PROVIDERS.zhipu;
  const model = process.env.AI_MODEL || conf.model;
  const url = process.env.AI_BASE_URL || conf.url;
  const timeout = Number(process.env.AI_TIMEOUT_MS || 10000);
  const b64 = buffer.toString('base64');
  const dataUrl = `data:${mime};base64,${b64}`;

  /* 主模型 + 兜底模型：429/5xx 时自动切换 */
  const models = provider === 'zhipu' ? [model, 'glm-4v-flash'] : [model];
  let lastErr = null;

  for (const m of models) {
    const body = {
      model: m,
      temperature: 0.2,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: conf.dataUri ? dataUrl : b64 } },
        ],
      }],
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`AI HTTP ${res.status} ${text.slice(0, 120)}`);
      }
      const data = await res.json();
      const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      const parsed = normalize(extractJSON(text));
      if (!parsed) throw new Error('AI 返回格式无法解析');
      return { ...parsed, provider, model: m };
    } catch (e) {
      lastErr = e;
      const retryable = /HTTP (429|5\d\d)/.test(e.message) || /timeout|aborted/i.test(e.message);
      if (!retryable || m === models[models.length - 1]) throw e;
      console.warn(`[ai] 模型 ${m} 不可用（${e.message.slice(0, 60)}），切换到 ${models[models.indexOf(m) + 1]}`);
    }
  }
  throw lastErr || new Error('AI 调用失败');
  return { ...parsed, provider };
}

module.exports = { gradeImage, md5, POINTS, LEVELS, PROMPT, mockGrade };
