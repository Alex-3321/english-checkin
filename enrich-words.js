/* 为词库补充常用短语与第二个例句 */
const fs = require('fs');
const WORDS = require('/opt/english-checkin/lib/words.js');

async function call(prompt) {
  const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ZHIPU_API_KEY}` },
    body: JSON.stringify({
      model: process.env.AI_TEXT_MODEL || 'glm-4-flash',
      temperature: 0.4,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(60000),
  });
  const d = await res.json();
  return d.choices?.[0]?.message?.content || '';
}

(async () => {
  const out = {};
  for (let i = 0; i < WORDS.length; i += 10) {
    const chunk = WORDS.slice(i, i + 10);
    const prompt = `为下列英语单词各写一条常用搭配（短语，2-4 个词）和一个新的英文例句（12 词以内，自然、四级难度），并用中文写出短语意思。
只输出 JSON：{"items":[{"id":1,"phrase":"abandon a plan","phrase_zh":"放弃计划","ex2":"They abandoned the plan after the storm."}]}
单词：${JSON.stringify(chunk.map((w) => ({ id: w.id, w: w.w, zh: w.zh })))}`;
    let ok = false;
    for (let t = 0; t < 3 && !ok; t++) {
      try {
        const txt = await call(prompt);
        const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
        const obj = JSON.parse(txt.slice(a, b + 1));
        for (const it of obj.items || []) {
          if (it.id) out[it.id] = { phrase: it.phrase || '', phrase_zh: it.phrase_zh || '', ex2: it.ex2 || '' };
        }
        ok = true;
      } catch (e) { await new Promise((r) => setTimeout(r, 1200)); }
    }
    console.log('批', i / 10 + 1, ok ? 'ok' : 'fail', Object.keys(out).length);
    fs.writeFileSync('/opt/english-checkin/lib/words-extra.json', JSON.stringify(out, null, 1));
  }
  console.log('完成', Object.keys(out).length);
})();
