/* 阅读文章库：60 篇，三个难度各 20 篇
 * 初级：科普短文（本站编写）
 * 中级：公版小说节选（较易读）
 * 高级：公版小说节选（句式复杂） */
const NOV1 = require('./reading-science');
const NOV2 = require('./reading-science2');
const MID1 = require('./reading-classics');
const MID2 = require('./reading-classics3');
const ADV1 = require('./reading-classics2');
const ADV2 = require('./reading-classics4');

const LONG = Object.assign({}, require('./reading-long'), require('./long-beginner'));

const EXP = Object.assign({},
  require('./reading-science-expand'),
  require('./reading-science2-expand'),
  require('./reading-classics-expand'),
  require('./reading-classics3-expand'),
  require('./reading-classics2-expand'),
  require('./reading-classics4-expand'));

function build(list, difficulty) {
  return list.map((a) => {
    const long = LONG[a.id];
    const more = EXP[a.id] || [];
    const paragraphs = long ? long.paragraphs : (more.length ? a.paragraphs.concat(more) : a.paragraphs);
    const words = paragraphs.flatMap((p) => p.en).join(' ').split(/\s+/).filter(Boolean).length;
    return { ...a, difficulty, paragraphs, words, summary_cn: (long && long.summary_cn) || a.summary_cn };
  });
}

const ARTICLES = [].concat(
  build(NOV1, '初级'),
  build(NOV2, '初级'),
  build(MID1, '中级'),
  build(MID2, '中级'),
  build(ADV1, '高级'),
  build(ADV2, '高级')
);

/* 优先使用构建脚本抓取并翻译的长文数据（reading-data.json） */
let DATA = null;
try { DATA = require('./reading-data.json'); } catch (e) { DATA = null; }

const FINAL = (Array.isArray(DATA) && DATA.length >= 12)
  ? DATA.map((a) => {
      const niceTitle = (a.key || '').split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return {
        ...a,
        title_en: /^chapter/i.test(a.title_en || '') ? niceTitle : a.title_en,
        words: a.words || a.paragraphs.flatMap((p) => p.en).join(' ').split(/\s+/).filter(Boolean).length,
      };
    })
  : ARTICLES;

function byId(id) { return FINAL.find((a) => a.id === Number(id)) || null; }
function byDifficulty(d) { return FINAL.filter((a) => a.difficulty === d); }

module.exports = { ARTICLES: FINAL, byId, byDifficulty };
