/* 阅读文章库：公版小说节选 + 原创科普短文（共 30 篇，每篇 ≥120 词） */
const CLASSICS = require('./reading-classics');
const CLASSICS2 = require('./reading-classics2');
const SCIENCE = require('./reading-science');

const EXP = Object.assign({},
  require('./reading-classics-expand'),
  require('./reading-classics2-expand'),
  require('./reading-science-expand'));

const ARTICLES = CLASSICS.concat(CLASSICS2, SCIENCE).map((a) => {
  const more = EXP[a.id] || [];
  const paragraphs = more.length ? a.paragraphs.concat(more) : a.paragraphs;
  const words = paragraphs.flatMap((p) => p.en).join(' ').split(/\s+/).filter(Boolean).length;
  return { ...a, paragraphs, words };
});

function byId(id) { return ARTICLES.find((a) => a.id === Number(id)) || null; }

module.exports = { ARTICLES, byId };
