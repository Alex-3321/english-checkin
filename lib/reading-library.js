/* 阅读文章库：全部为公有领域文本（Aesop's Fables, Project Gutenberg）的改编版
 * 版权状态：Public Domain，可自由使用；每篇标注出处与许可。 */
const SOURCE = "Aesop's Fables · Project Gutenberg";
const LICENSE = 'Public Domain（公版）';

const BASE = [
  {
    id: 1, key: 'fox-grapes',
    title_en: 'The Fox and the Grapes',
    title_cn: '狐狸与葡萄',
    level: '初级', intro_cn: '吃不到的葡萄，为什么总是酸的？',
    paragraphs: [
      { en: ['One hot afternoon, a hungry fox was walking through a vineyard.', 'He looked up and saw some beautiful grapes hanging from a high branch.'],
        zh: ['一个炎热的下午，一只饥饿的狐狸走过葡萄园。', '他抬头看见高高的枝条上挂着一串漂亮的葡萄。'] },
      { en: ['The grapes looked sweet and full of juice.', 'The fox jumped again and again, but they were too high for him.', 'He tried running and jumping, but he still could not reach them.'],
        zh: ['那些葡萄看起来又甜又多汁。', '狐狸跳了一次又一次，但它们太高了。', '他试着跑起来再跳，仍然够不到。'] },
      { en: ['At last, the fox turned away and said, "Those grapes are probably sour anyway."', 'He walked off, pretending he did not care.'],
        zh: ['最后，狐狸转身走开，说：“那些葡萄反正大概是酸的。”', '他走开了，装作毫不在意。'] },
    ],
    summary_cn: '人们常常贬低自己得不到的东西，用“酸葡萄”安慰自己。',
  },
  {
    id: 2, key: 'tortoise-hare',
    title_en: 'The Tortoise and the Hare',
    title_cn: '龟兔赛跑',
    level: '初级', intro_cn: '跑得快就一定能赢吗？',
    paragraphs: [
      { en: ['A hare often laughed at a slow tortoise.', '"You are so slow," he said. "You could never win a race."'],
        zh: ['一只兔子常常嘲笑一只行动缓慢的乌龟。', '“你太慢了，”他说，“你永远赢不了比赛。”'] },
      { en: ['The tortoise answered quietly, "Let us race and see."', 'The race began, and the hare ran far ahead.', 'He was so sure of winning that he stopped to rest under a tree — and fell asleep.'],
        zh: ['乌龟平静地回答：“那就比一场吧。”', '比赛开始，兔子远远跑在前面。', '他太确信自己能赢，于是停下来在树下休息——结果睡着了。'] },
      { en: ['The tortoise kept walking, step by step.', 'He passed the sleeping hare and crossed the finish line first.', 'When the hare woke up, the race was already over.'],
        zh: ['乌龟一步一步地继续走着。', '他超过了熟睡的兔子，第一个冲过终点线。', '当兔子醒来时，比赛早已结束。'] },
    ],
    summary_cn: '缓慢而坚持，胜过天赋加懒惰。',
  },
  {
    id: 3, key: 'boy-wolf',
    title_en: 'The Boy Who Cried Wolf',
    title_cn: '狼来了',
    level: '初级', intro_cn: '说谎的代价，是没人再相信你。',
    paragraphs: [
      { en: ['A shepherd boy watched sheep on a hillside.', 'He was bored, so he shouted, "Wolf! Wolf!"', 'All the villagers ran up the hill to help him.'],
        zh: ['一个牧羊男孩在山坡上看羊。', '他觉得很无聊，就大喊：“狼来了！狼来了！”', '所有村民都跑上山来帮他。'] },
      { en: ['There was no wolf, and the boy laughed at them.', 'The next day he did the same thing again, and the villagers came again.', 'Again there was nothing.'],
        zh: ['根本没有狼，男孩嘲笑他们。', '第二天他又这么做，村民们又一次赶来。', '结果依然什么也没有。'] },
      { en: ['On the third day, a real wolf came.', 'The boy screamed for help, but nobody believed him.', 'The villagers stayed where they were, and the wolf took several sheep.'],
        zh: ['第三天，真的有一头狼来了。', '男孩大声呼救，但没有人相信他。', '村民们待在原地，狼叼走了几只羊。'] },
    ],
    summary_cn: '谎言会消耗信任，而信任一旦失去，就很难再找回。',
  },
  {
    id: 4, key: 'north-wind-sun',
    title_en: 'The North Wind and the Sun',
    title_cn: '北风与太阳',
    level: '初级', intro_cn: '温柔和强硬，哪个更有力量？',
    paragraphs: [
      { en: ['The North Wind and the Sun argued about who was stronger.', 'They saw a traveler in a warm coat and decided to test themselves on him.', 'Whoever could make him take off the coat would win.'],
        zh: ['北风和太阳争论谁更强大。', '他们看见一个穿着厚外套的旅人，决定在他身上比试一番。', '谁能让旅人脱下外套，谁就赢。'] },
      { en: ['The North Wind blew as hard as he could.', 'But the harder he blew, the tighter the traveler held his coat.', 'He pulled the coat around himself and kept walking.'],
        zh: ['北风拼命地吹。', '但他吹得越猛，旅人就把外套裹得越紧。', '旅人抓紧外套，继续往前走。'] },
      { en: ['Then the Sun came out and shone warmly.', 'Soon the traveler felt hot and took off his coat on his own.', 'The Sun had won without a single blow.'],
        zh: ['然后太阳出来了，温暖地照耀着。', '很快旅人觉得热，自己把外套脱了下来。', '太阳没有用一点力气就赢了。'] },
    ],
    summary_cn: '说服与温和，往往比强硬更有力量。',
  },
  {
    id: 5, key: 'lion-mouse',
    title_en: 'The Lion and the Mouse',
    title_cn: '狮子与老鼠',
    level: '初级', intro_cn: '小人物也可能有大用处。',
    paragraphs: [
      { en: ['A lion was sleeping when a little mouse ran across his nose.', 'The lion woke up and caught him.', 'The mouse begged, "Please let me go, and one day I will help you."'],
        zh: ['一只狮子正在睡觉，一只小老鼠从他鼻子上跑了过去。', '狮子醒了，抓住了他。', '老鼠恳求道：“请放了我，总有一天我会帮到你。”'] },
      { en: ['The lion laughed at the idea, but he let the mouse go.', 'A few days later, the lion was caught in a hunter\'s net.', 'He roared, but he could not break free.'],
        zh: ['狮子觉得这个想法很好笑，但还是放了他。', '几天后，狮子被猎人的网困住了。', '他大声吼叫，却挣不脱。'] },
      { en: ['The mouse heard him and ran to the net.', 'He bit through the ropes one by one until the lion was free.', '"You laughed at me," said the mouse, "but even a small friend can help."'],
        zh: ['老鼠听见了，跑到网边。', '他一根一根地咬断绳子，直到狮子脱身。', '“你曾笑我，”老鼠说，“但再小的朋友也能帮上忙。”'] },
    ],
    summary_cn: '不要轻视任何人，善意总会在意想不到的时候回来。',
  },
  {
    id: 6, key: 'crow-pitcher',
    title_en: 'The Crow and the Pitcher',
    title_cn: '乌鸦喝水',
    level: '初级', intro_cn: '口渴的乌鸦如何喝到瓶中水？',
    paragraphs: [
      { en: ['A thirsty crow found a pitcher with a little water at the bottom.', 'His beak could not reach the water.', 'He tried to push the pitcher over, but it was too heavy.'],
        zh: ['一只口渴的乌鸦发现一个瓶子里，底部有一点水。', '他的嘴够不到水。', '他想把瓶子推倒，但瓶子太重了。'] },
      { en: ['Then the crow had an idea.', 'He picked up small stones and dropped them into the pitcher one by one.', 'Slowly, the water rose higher.'],
        zh: ['这时乌鸦有了一个主意。', '他捡起小石子，一颗一颗地丢进瓶子里。', '水位慢慢升高了。'] },
      { en: ['At last the water reached the top, and the crow drank.', 'He had solved the problem not with strength, but with a little thought.'],
        zh: ['终于，水升到了瓶口，乌鸦喝到了水。', '他解决问题靠的不是力气，而是一点思考。'] },
    ],
    summary_cn: '遇到难题时，耐心和方法比蛮力更管用。',
  },
  {
    id: 7, key: 'ant-grasshopper',
    title_en: 'The Ant and the Grasshopper',
    title_cn: '蚂蚁与蚱蜢',
    level: '初级', intro_cn: '夏天唱歌，冬天挨饿。',
    paragraphs: [
      { en: ['It was summer, and a grasshopper was singing in the sun.', 'He saw ants working hard, carrying food to their nest.', '"Why work on such a lovely day?" he asked.'],
        zh: ['夏天到了，一只蚱蜢在阳光下唱歌。', '他看见蚂蚁们辛勤劳作，把食物搬回巢里。', '“这么好的天气为什么要干活？”他问。'] },
      { en: ['"We are saving food for winter," the ants said.', 'The grasshopper laughed and kept singing.', 'When winter came, he had nothing to eat and shivered in the cold.'],
        zh: ['“我们在为冬天储备食物，”蚂蚁们说。', '蚱蜢笑了笑，继续唱歌。', '冬天来了，他没有食物，在寒冷中发抖。'] },
      { en: ['He went to the ants and asked for help.', 'They shared a little food, but they also gave him advice.', '"Next summer, work a little before you sing."'],
        zh: ['他去找蚂蚁求助。', '蚂蚁们分给他一点食物，但也给了他一个建议。', '“下一个夏天，唱歌之前先做一点事吧。”'] },
    ],
    summary_cn: '今天的准备，就是明天的安全感。',
  },
  {
    id: 8, key: 'dog-reflection',
    title_en: 'The Dog and His Reflection',
    title_cn: '狗与倒影',
    level: '初级', intro_cn: '贪心让人失去拥有的东西。',
    paragraphs: [
      { en: ['A dog was crossing a bridge with a piece of meat in his mouth.', 'He looked down and saw another dog in the water.', 'That dog seemed to have a bigger piece of meat.'],
        zh: ['一只狗叼着一块肉过桥。', '他往下看，看见水里还有一只狗。', '那只狗似乎叼着更大的一块肉。'] },
      { en: ['He wanted that bigger piece, so he opened his mouth to bark.', 'The meat fell into the river and disappeared.', 'The other dog disappeared too.'],
        zh: ['他想要那块更大的肉，于是张嘴叫了一声。', '嘴里的肉掉进河里，不见了。', '那只狗也消失了。'] },
      { en: ['The dog stood on the bridge with nothing at all.', 'The other dog had only been his own reflection.'],
        zh: ['狗站在桥上，什么也没有了。', '另一只狗不过是自己的倒影。'] },
    ],
    summary_cn: '贪图得不到的东西，往往会失去手中已经拥有的。',
  },
  {
    id: 9, key: 'bundle-sticks',
    title_en: 'The Bundle of Sticks',
    title_cn: '一捆树枝',
    level: '初级', intro_cn: '为什么一捆树枝折不断？',
    paragraphs: [
      { en: ['An old farmer had three sons who argued all the time.', 'Before he died, he called them together and gave them a bundle of sticks.', '"Try to break it," he said.'],
        zh: ['一位老农有三个儿子，他们总是争吵不休。', '临终前，他把儿子们叫到一起，给他们一捆树枝。', '“试着把它折断，”他说。'] },
      { en: ['Each son tried, but the bundle was too strong.', 'Then the father untied it and gave each son one stick.', 'They broke the sticks easily.'],
        zh: ['每个儿子都试了，但整捆树枝太结实了。', '然后父亲解开绳子，给每人一根树枝。', '他们轻松就把树枝折断了。'] },
      { en: ['"Together you are strong," said the father.', '"But if you fight each other, you will break as easily as these sticks."'],
        zh: ['“团结在一起，你们就强大，”父亲说，', '“但如果彼此争斗，你们就会像这些树枝一样轻易被折断。”'] },
    ],
    summary_cn: '团结让人强大，分裂让人脆弱。',
  },
  {
    id: 10, key: 'golden-egg',
    title_en: 'The Goose That Laid the Golden Eggs',
    title_cn: '下金蛋的鹅',
    level: '初级', intro_cn: '急切求成，反而毁掉一切。',
    paragraphs: [
      { en: ['A farmer had a goose that laid one golden egg every day.', 'The eggs made him rich, but he wanted to be rich faster.', '"There must be a lot of gold inside the goose," he thought.'],
        zh: ['一个农夫有一只鹅，每天下一个金蛋。', '这些蛋让他富裕起来，但他想更快变富。', '“鹅肚子里一定有很多金子，”他想。'] },
      { en: ['So he killed the goose to get all the gold at once.', 'But inside, there was nothing special at all.', 'He had lost the goose and the golden eggs.'],
        zh: ['于是他把鹅杀了，想一次取走所有金子。', '但鹅的肚子里，什么特别的东西也没有。', '他失去了鹅，也失去了金蛋。'] },
      { en: ['Slow, steady gain had been the real treasure.', 'He had destroyed it with his own hands.'],
        zh: ['缓慢而稳定的收获，才是真正的财富。', '他却用自己的双手毁掉了它。'] },
    ],
    summary_cn: '耐心守护已有的价值，比急于求成更重要。',
  },
];

const EXTRA = require('./reading-extra');
const ARTICLES = BASE.concat(EXTRA);

function byId(id) {
  return ARTICLES.find((a) => a.id === Number(id)) || null;
}


module.exports = { ARTICLES, byId, SOURCE, LICENSE };
