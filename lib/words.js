/* 词库加载器
 * 1–80：原四级核心词（ID 不可变，数据库 user_words.word_id 依赖）
 * 81+：CET-4/6、考研、托福、雅思、GMAT、GRE、Oxford3000 合并去重
 * 数据来源：https://github.com/RealKai42/qwerty-learner 的公开词表
 */
const BASE = require('./words-base.json');
const EXTRA = require('./words-cet6.json');

const ALL = [...BASE, ...EXTRA].map((x, i) => ({
  id: i + 1,
  w: x.w,
  phonetic: x.phonetic || '',
  pos: x.pos || '',
  zh: x.zh || '',
  phrase: x.phrase || '',
  phrase_zh: x.phrase_zh || '',
  ex: x.ex || '',
  ex2: x.ex2 || '',
}));

module.exports = ALL;
