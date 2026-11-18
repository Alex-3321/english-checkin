/* 段位系统：图标生成 + 段位计算（前后端同源配置） */
(function () {
  var C = { x: 100, y: 100 };

  function pt(a, r) { return [C.x + r * Math.cos(a * Math.PI / 180), C.y + r * Math.sin(a * Math.PI / 180)]; }
  function poly(p) { return p.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' '); }
  function nGon(n, r, start) {
    start = start === undefined ? -90 : start;
    var a = [];
    for (var i = 0; i < n; i++) a.push(pt(start + i * 360 / n, r));
    return a;
  }
  function scale(pts, s) { return pts.map(function (p) { return [C.x + (p[0] - C.x) * s, C.y + (p[1] - C.y) * s]; }); }
  function hex2rgb(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function rgb2hex(a) { return '#' + a.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); }).join(''); }
  function mix(h, t, amt) { var a = hex2rgb(h), b = hex2rgb(t); return rgb2hex([a[0] + (b[0] - a[0]) * amt, a[1] + (b[1] - a[1]) * amt, a[2] + (b[2] - a[2]) * amt]); }

  var SHAPES = {
    tri: nGon(3, 92, 90),
    diamond: nGon(4, 92),
    pent: [[38, 20], [162, 20], [162, 118], [100, 188], [38, 118]],
    hex: nGon(6, 92),
    oct: nGon(8, 92, -90 + 22.5),
    hept: nGon(7, 92),
    star4: [[100, 6], [140, 60], [194, 100], [140, 140], [100, 194], [60, 140], [6, 100], [60, 60]],
    rad: [[100, 4], [158, 100], [100, 196], [42, 100]]
  };

  var RANKS = [
    { key: 'nascent',      en: 'Nascent',      cn: '微光初现', base: 0,    shape: 'circle',  col: '#6E7278', core: 'star' },
    { key: 'ascendant',    en: 'Ascendant',    cn: '渐入佳境', base: 200,  shape: 'tri',     col: '#8C6239', core: 'stairs' },
    { key: 'virtuoso',     en: 'Virtuoso',     cn: '游刃有余', base: 700,  shape: 'diamond', col: '#C9CED6', core: 'feather' },
    { key: 'paragon',      en: 'Paragon',      cn: '卓尔不群', base: 1400, shape: 'pent',    col: '#D9A227', core: 'gem' },
    { key: 'erudite',      en: 'Erudite',      cn: '博文约礼', base: 2100, shape: 'hex',     col: '#2E8C8C', core: 'book' },
    { key: 'steadfast',    en: 'Steadfast',    cn: '跬步千里', base: 2700, shape: 'oct',     col: '#B06BC4', core: 'nested' },
    { key: 'sublime',      en: 'Sublime',      cn: '高山仰止', base: 3200, shape: 'hept',    col: '#2E9E5B', core: 'peaks' },
    { key: 'transcendent', en: 'Transcendent', cn: '超然物外', base: 3500, shape: 'star4',   col: '#B0303C', core: 'inf' },
    { key: 'zenith',       en: 'Zenith',       cn: '十年磨剑', base: 3800, shape: 'rad',     col: '#D4AF37', core: 'crown' }
  ];

  function coreSVG(k, id) {
    var l = 'url(#' + id + 'l)', d = 'url(#' + id + 'd)';
    var defs = '<defs><linearGradient id="' + id + 'l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D8DEE8"/></linearGradient>' +
      '<linearGradient id="' + id + 'd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B9C2D0"/><stop offset="1" stop-color="#7C8797"/></linearGradient></defs>';
    var out = (function () {
    switch (k) {
      case 'star': /* 放大四角星 */
        return `<path d="M100 66 L109 90 L133 100 L109 110 L100 134 L91 110 L67 100 L91 90 Z" fill="${l}"/>`;
      case 'stairs': /* 缩小并居中 */
        return `<g transform="translate(100 100) scale(.82) translate(-100 -100)">
          <rect x="80" y="112" width="40" height="7" fill="${l}" rx="1"/>
          <rect x="85" y="101" width="30" height="7" fill="${l}" rx="1"/>
          <rect x="90" y="90" width="20" height="7" fill="${l}" rx="1"/>
          <polygon points="100,74 108,88 92,88" fill="#FFFFFF"/></g>`;
      case 'feather':
        return `<g transform="rotate(18 100 100)">
          <path d="M100 72 C116 88 120 104 118 114 C116 126 108 132 100 132 C92 132 84 126 82 114 C80 104 84 88 100 72 Z" fill="${l}"/>
          <path d="M100 80 C110 94 112 106 110 116" stroke="#8A93A3" stroke-width="1.6" fill="none" opacity=".55"/>
          <path d="M84 118 L114 88" stroke="#FFFFFF" stroke-width="1.2" opacity=".5"/></g>`;
      case 'gem':
        return `<polygon points="100,74 126,100 100,126 74,100" fill="${l}"/>
          <polygon points="100,74 126,100 100,100" fill="#FFFFFF" opacity=".7"/>
          <polygon points="100,126 74,100 100,100" fill="${d}" opacity=".95"/>
          <polygon points="100,88 114,100 100,112 86,100" fill="#FFFFFF" opacity=".4"/>
          <path d="M100 74 L100 126 M74 100 L126 100" stroke="#7C8797" stroke-width="1" opacity=".45"/>`;
      case 'book': /* 整体上移 */
        return `<g transform="translate(0 -8)">
          <path d="M100 96 L68 104 L68 132 L100 124 Z" fill="${l}"/>
          <path d="M100 96 L132 104 L132 132 L100 124 Z" fill="${l}" opacity=".85"/>
          <path d="M100 96 L100 124" stroke="#7C8797" stroke-width="2"/>
          <path d="M74 110 L94 105 M74 118 L94 113 M74 126 L94 121" stroke="#7C8797" stroke-width="1.2" opacity=".55"/>
          <path d="M106 105 L126 110 M106 113 L126 118 M106 121 L126 126" stroke="#7C8797" stroke-width="1.2" opacity=".55"/></g>`;
      case 'nested':
        return `<polygon points="100,72 132,100 100,130 68,100" fill="none" stroke="${l}" stroke-width="4"/>
          <polygon points="100,86 116,100 100,116 84,100" fill="${l}"/>`;
      case 'peaks':
        return `<polygon points="104,72 128,126 80,126" fill="${l}"/>
          <polygon points="72,126 92,90 112,126" fill="${d}" opacity=".92"/>
          <path d="M92 90 L92 126" stroke="#ffffff" stroke-width="1" opacity=".35"/>`;
      case 'inf': /* 丝带感：渐变描边 + 两端渐尖 */
        return `<path d="M100 100 C100 82 76 82 76 100 C76 118 100 118 100 100 C100 82 124 82 124 100 C124 118 100 118 100 100 Z"
            fill="none" stroke="url(#${id}g)" stroke-width="7" stroke-linecap="round"/>
          <polygon points="76,100 68,94 68,106" fill="${l}" opacity=".9"/>
          <polygon points="124,100 132,94 132,106" fill="${l}" opacity=".9"/>
          <circle cx="100" cy="100" r="3.2" fill="#FFFFFF" opacity=".85"/>`;
      case 'crown':
        return `<polygon points="78,70 83,52 91,62 100,46 109,62 117,52 122,70" fill="${l}"/>
          <rect x="78" y="70" width="44" height="6" fill="${l}"/>
          <circle cx="100" cy="54" r="2.6" fill="#FFF6D0"/>
          <path d="M70 82 Q100 96 130 82 L130 90 Q100 104 70 90 Z" fill="${l}"/>
          <rect x="95" y="90" width="10" height="14" fill="${d}"/>
          <polygon points="100,104 108,112 100,120 92,112" fill="#FFF3C4"/>
          <polygon points="100,184 114,126 100,118 86,126" fill="${l}"/>
          <polygon points="100,184 114,126 100,126" fill="#FFFFFF" opacity=".6"/>
          <polygon points="100,184 86,126 100,126" fill="#8A6C18" opacity=".6"/>
          <path d="M100 128 L100 172" stroke="#7A5A0E" stroke-width="1.4" opacity=".65"/>
          <polygon points="100,184 105,172 95,172" fill="#FFFFFF" opacity=".95"/>`;
    }
    return '';
    })();
    return defs + out;
  }

  var seq = 0;

  /** 生成段位 SVG 字符串；size 为像素边长，opts.dim 置灰 */
  function rankSVG(key, size, opts) {
    opts = opts || {};
    var rank = null;
    for (var i = 0; i < RANKS.length; i++) if (RANKS[i].key === key) rank = RANKS[i];
    if (!rank) return '';
    var p = 'rk' + (++seq);
    var base = rank.col;
    var light = mix(base, '#ffffff', .42);
    var dark = mix(base, '#000000', .5);
    var metal1 = mix(base, '#000000', .72);
    var metal2 = mix(base, '#ffffff', .18);
    function stops(a, b, c) {
      return `<stop offset="0" stop-color="${a}"/><stop offset=".38" stop-color="${b}"/><stop offset=".62" stop-color="${b}"/><stop offset="1" stop-color="${c}"/>`;
    }
    var body = '';
    if (rank.shape === 'circle') {
      body = `<circle cx="100" cy="100" r="93" fill="url(#${p}m)"/>
        <circle cx="100" cy="100" r="93" fill="none" stroke="${metal2}" stroke-width=".9" opacity=".65"/>
        <circle cx="100" cy="100" r="84" fill="url(#${p}c)"/>
        <circle cx="100" cy="100" r="84" fill="none" stroke="${metal2}" stroke-width=".8" opacity=".55"/>
        <circle cx="100" cy="100" r="70" fill="${metal1}"/>
        <circle cx="100" cy="100" r="63" fill="url(#${p}c)" opacity=".92"/>
        <circle cx="100" cy="100" r="54" fill="none" stroke="${metal2}" stroke-width="1" opacity=".5"/>`;
    } else {
      var outer = scale(SHAPES[rank.shape], 1);
      body = `<polygon points="${poly(outer)}" fill="url(#${p}m)"/>
        <polygon points="${poly(outer)}" fill="none" stroke="${metal2}" stroke-width=".9" opacity=".7"/>
        <polygon points="${poly(scale(SHAPES[rank.shape], .90))}" fill="url(#${p}c)" stroke="${light}" stroke-width=".8" stroke-opacity=".55"/>
        <polygon points="${poly(scale(SHAPES[rank.shape], .74))}" fill="${metal1}"/>
        <polygon points="${poly(scale(SHAPES[rank.shape], .66))}" fill="url(#${p}c)" opacity=".95"/>
        <polygon points="${poly(scale(SHAPES[rank.shape], .60))}" fill="none" stroke="${light}" stroke-width=".8" stroke-opacity=".45"/>`;
    }
    var dimStyle = opts.dim ? 'filter:grayscale(.85);opacity:.38;' : '';
    var title = opts.title ? `<title>${opts.title}</title>` : '';
    return `<svg width="${size}" height="${size}" viewBox="0 0 200 200" style="${dimStyle}" aria-label="${rank.en} ${rank.cn}">${title}
      <defs>
        <linearGradient id="${p}m" x1="0" y1="0" x2="1" y2="1">${stops(mix(base, '#000', .8), mix(base, '#fff', .12), mix(base, '#000', .6))}</linearGradient>
        <linearGradient id="${p}c" x1="0" y1="0" x2="0" y2="1">${stops(light, base, dark)}</linearGradient>
        <linearGradient id="${p}g" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="${mix(base, '#ffffff', .55)}"/><stop offset=".5" stop-color="#FFFFFF"/><stop offset="1" stop-color="${mix(base, '#ffffff', .55)}"/>
        </linearGradient>
      </defs>${body}${coreSVG(rank.core, p)}</svg>`;
  }

  /** 根据积分计算段位信息 */
  function rankOf(score) {
    score = Number(score) || 0;
    var idx = 0;
    for (var i = 0; i < RANKS.length; i++) if (score >= RANKS[i].base) idx = i;
    var cur = RANKS[idx];
    var nxt = RANKS[idx + 1] || null;
    return {
      key: cur.key, en: cur.en, cn: cur.cn, base: cur.base, index: idx,
      next: nxt ? { key: nxt.key, en: nxt.en, cn: nxt.cn, base: nxt.base } : null,
      need: nxt ? Math.max(0, nxt.base - score) : 0,
      progress: nxt ? Math.max(0, Math.min(1, (score - cur.base) / (nxt.base - cur.base))) : 1,
      isMax: !nxt
    };
  }

  window.RankSystem = { RANKS: RANKS, svg: rankSVG, of: rankOf };
})();
