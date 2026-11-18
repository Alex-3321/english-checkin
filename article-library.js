/* 内置备用文章库（AI 不可用时使用） */
const ARTICLES = [
  {
    title_en: 'The Quiet Power of Habit',
    title_cn: '习惯的静默力量',
    level: '四级',
    intro_cn: '为什么每天进步一点点，一年后会判若两人？',
    summary_cn: '习惯的力量来自复利：微小的行动重复足够久，会变成身份的一部分。',
    topic: 'habit',
    paragraphs: [
      { en: ['Most people believe that big changes require big actions.', 'In fact, the opposite is often true.'],
        zh: ['大多数人相信，巨大的改变需要巨大的行动。', '事实上，情况往往相反。'] },
      { en: ['A habit is a small choice that you repeat until it becomes automatic.', 'Brushing your teeth feels effortless because you have done it thousands of times.'],
        zh: ['习惯是一个微小的选择，你不断重复，直到它变成自动行为。', '刷牙感觉毫不费力，因为你已经做过几千次了。'] },
      { en: ['The same principle works for learning English.', 'Ten minutes of reading every day will beat three hours once a month.'],
        zh: ['同样的道理适用于学英语。', '每天读十分钟，胜过一个月读三小时。'] },
      { en: ['The secret is not motivation but consistency.', 'You do not need to feel inspired; you only need to show up.'],
        zh: ['秘诀不是动力，而是坚持。', '你不需要感到振奋，你只需要出现。'] },
      { en: ['Start small, stay steady, and let time do the heavy lifting.', 'A year from now, you will thank the person who began today.'],
        zh: ['从小处开始，保持稳定，让时间完成繁重的工作。', '一年之后，你会感谢今天开始的那个自己。'] },
    ],
  },
  {
    title_en: 'Why We Forget What We Learn',
    title_cn: '为什么学过就忘',
    level: '四级',
    intro_cn: '记忆不是仓库，而是一条需要反复走的路。',
    summary_cn: '遗忘是正常的，间隔复习才能把短期记忆变成长期记忆。',
    topic: 'memory',
    paragraphs: [
      { en: ['You read a page, close the book, and forget everything by evening.', 'This is not a personal failure; it is how memory works.'],
        zh: ['你读完一页，合上书，到了晚上就全忘了。', '这不是你个人的失败，而是记忆的运作方式。'] },
      { en: ['The brain is designed to forget information it does not use.', 'Forgetting keeps the mind efficient.'],
        zh: ['大脑天生会忘掉不使用的信息。', '遗忘让头脑保持高效。'] },
      { en: ['Reviewing at the right moment is the key.', 'If you revisit an idea just before you would forget it, the memory becomes stronger.'],
        zh: ['在正确的时机复习才是关键。', '如果你在快要忘记之前重看一遍，记忆就会更牢固。'] },
      { en: ['This is why spaced repetition beats cramming.', 'Short reviews spread over days cost less time and last longer.'],
        zh: ['这就是间隔重复胜过临时抱佛脚的原因。', '分散在几天里的短暂复习更省时，也更持久。'] },
      { en: ['Do not fear forgetting.', 'Treat it as a signal that a small review is due.'],
        zh: ['不要害怕遗忘。', '把它当作该做一次小复习的信号。'] },
    ],
  },
  {
    title_en: 'The City That Learned to Breathe',
    title_cn: '学会呼吸的城市',
    level: '四级',
    intro_cn: '一座城市如何把灰色天空重新变蓝。',
    summary_cn: '减少机动车、增加绿地与公共交通，让城市空气重新变好。',
    topic: 'environment',
    paragraphs: [
      { en: ['Twenty years ago, the sky above this city was almost always grey.', 'Residents wore masks on sunny days.'],
        zh: ['二十年前，这座城市的上空几乎总是灰色的。', '居民在晴天也要戴口罩。'] },
      { en: ['Then the government made a difficult decision.', 'It limited cars in the centre and built hundreds of kilometres of bus lanes.'],
        zh: ['后来，政府做出了一个艰难的决定。', '它在市中心限制汽车，并修建了数百公里的公交专用道。'] },
      { en: ['The change was painful at first.', 'Shops worried about losing customers, and drivers complained about delays.'],
        zh: ['一开始，变化是痛苦的。', '商家担心失去顾客，司机抱怨耽搁时间。'] },
      { en: ['But within five years, the air quality improved by almost half.', 'Children started playing outside again.'],
        zh: ['但五年之内，空气质量改善了将近一半。', '孩子们又开始在户外玩耍。'] },
      { en: ['Cities do not have to choose between growth and clean air.', 'With courage and patience, both are possible.'],
        zh: ['城市不必在发展与清洁空气之间二选一。', '只要有勇气和耐心，两者皆可实现。'] },
    ],
  },
  {
    title_en: 'What Music Does to Your Brain',
    title_cn: '音乐对大脑做了什么',
    level: '四级',
    intro_cn: '为什么一首歌能让你瞬间回到某个夏天。',
    summary_cn: '音乐同时激活大脑多个区域，能把情绪和记忆紧密连接起来。',
    topic: 'music',
    paragraphs: [
      { en: ['A single song can bring back a whole summer.', 'This is not imagination; it is biology.'],
        zh: ['一首歌就能带回一整个夏天。', '这不是想象，而是生理反应。'] },
      { en: ['When you hear music, many areas of the brain work at once.', 'Rhythm, melody and memory are processed together.'],
        zh: ['当你听音乐时，大脑的许多区域同时工作。', '节奏、旋律和记忆被一起处理。'] },
      { en: ['That is why music can comfort us when words fail.', 'It reaches emotions directly, without translation.'],
        zh: ['这就是言语无力时音乐能安慰我们的原因。', '它无需翻译，直接抵达情绪。'] },
      { en: ['Studies also show that learning an instrument improves attention.', 'Musicians practice listening as much as playing.'],
        zh: ['研究还表明，学习乐器能提升注意力。', '音乐家练习倾听的时间不亚于练习演奏。'] },
      { en: ['So the next time a song moves you, remember: your brain is dancing too.', 'Music is one of the oldest gifts we share.'],
        zh: ['所以下次一首歌打动你时，请记住：你的大脑也在起舞。', '音乐是我们共同拥有的最古老的礼物之一。'] },
    ],
  },
  {
    title_en: 'Learning to Fail Better',
    title_cn: '学会更好地失败',
    level: '四级',
    intro_cn: '失败不是终点，而是数据的来源。',
    summary_cn: '把失败当作反馈，持续调整方法，才能真正进步。',
    topic: 'failure',
    paragraphs: [
      { en: ['Nobody enjoys failing.', 'But the people who improve fastest are often the ones who fail most often.'],
        zh: ['没有人喜欢失败。', '但进步最快的人，往往也是失败最多的人。'] },
      { en: ['The difference is what they do next.', 'Instead of hiding the mistake, they study it.'],
        zh: ['差别在于他们接下来做什么。', '他们不会掩盖错误，而是研究错误。'] },
      { en: ['A failed exam is information: it shows where understanding broke down.', 'A rejected plan tells you what the world actually needs.'],
        zh: ['一次考砸的考试是信息：它显示出理解在哪里断了。', '一个被否决的方案，告诉你世界真正需要什么。'] },
      { en: ['This mindset turns failure from a verdict into a tool.', 'It also makes trying again much less frightening.'],
        zh: ['这种心态把失败从判决变成了工具。', '它也让再次尝试变得不那么可怕。'] },
      { en: ['Success is not the absence of failure.', 'It is the result of failing better, one attempt at a time.'],
        zh: ['成功不是没有失败。', '成功是一次比一次更好地失败所累积的结果。'] },
    ],
  },
];

function pick(seedTopic) {
  if (seedTopic) {
    const hit = ARTICLES.find((a) => a.topic === seedTopic);
    if (hit) return JSON.parse(JSON.stringify(hit));
  }
  const a = ARTICLES[Math.floor(Math.random() * ARTICLES.length)];
  return JSON.parse(JSON.stringify(a));
}

module.exports = { ARTICLES, pick };
