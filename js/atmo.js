// Atmosfere animate dietro le schermate della TV (canvas leggero, 30 fotogrammi al secondo).
import { isSafeMode } from './safe.js';
export const ATMOS = [
  ['none', 'Nessuna'],
  ['auto', 'Automatica (dal gioco)'],
  ['pioggia', '🌧️ Pioggia sul vetro (gialli, investigativi)'],
  ['candele', '🕯️ Candele (fantasy, medievali)'],
  ['neon', '🌆 Neon (fantascienza)'],
  ['stelle', '✨ Cielo stellato (notte, spazio)'],
  ['festa', '🎉 Festa (party game)'],
  ['nebbia', '🌫️ Nebbia (horror, mistero)'],
  ['palco', '🎲 Palcoscenico (dadi, segnalini e carte foil)']
];

/** Atmosfera adatta a un gioco, dalle sue categorie e dal nome. */
export function atmoForGame(item) {
  const text = [...(Array.isArray(item?.tags) ? item.tags : Object.values(item?.tags || {})), item?.name || '', item?.mode || ''].join(' ').toLowerCase();
  const has = (...w) => w.some((x) => text.includes(x));
  if (has('horror', 'zombi', 'paura', 'cthulhu', 'lupi', 'lupus', 'werewolf', 'mistero', 'nemesis')) return 'nebbia';
  if (has('giallo', 'investiga', 'deduzione', 'detective', 'sherlock', 'cluedo', 'crimine', 'noir', 'spia')) return 'pioggia';
  if (has('fantasy', 'medioev', 'medieval', 'drago', 'magia', 'castell', 'cavalier', 'carcassonne', 'dungeon')) return 'candele';
  if (has('fantascienza', 'sci-fi', 'scifi', 'cyber', 'robot', 'futur', 'mars', 'marte', 'galaxy')) return 'neon';
  if (has('spazio', 'stell', 'astr', 'cosmo', 'notte', 'cielo')) return 'stelle';
  if (has('party', 'festa', 'parole', 'bluff', 'squadre', 'disegn', 'mimo', 'codenames', 'dixit', 'just one')) return 'festa';
  return 'none';
}

const rand = (a, b) => a + Math.random() * (b - a);
const SCENES_EXTRA = {};

// ---------------------------------------------------------------------------
// Palcoscenico: dadi a 20 facce, segnalini, meeple e carte olografiche sfocate
// che galleggiano lente, polvere luminosa e due fari da studio televisivo.
// Le sagome sfocate si disegnano una volta sola (sprite) e poi si spostano soltanto.
// ---------------------------------------------------------------------------

const NEON = ['#FF8A3D', '#FF3DCB', '#FFD34D', '#3DF5E0', '#9B7BFF'];

function d20Path(c, r) {
  const hex = Array.from({ length: 6 }, (_, i) => [Math.cos(Math.PI / 6 + i * Math.PI / 3) * r, Math.sin(Math.PI / 6 + i * Math.PI / 3) * r]);
  c.beginPath();
  hex.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  // Triangolo centrale e spigoli verso i vertici
  const tri = [[0, -r * 0.55], [r * 0.48, r * 0.28], [-r * 0.48, r * 0.28]];
  c.moveTo(...tri[0]); c.lineTo(...tri[1]); c.lineTo(...tri[2]); c.closePath();
  [[0, 5], [0, 4], [1, 0], [1, 1], [2, 2], [2, 3]].forEach(([t, h]) => { c.moveTo(...tri[t]); c.lineTo(...hex[h]); });
}

function meeplePath(c, r) {
  c.beginPath();
  c.arc(0, -r * 0.55, r * 0.3, 0, Math.PI * 2);
  c.moveTo(-r * 0.22, -r * 0.3);
  c.quadraticCurveTo(-r * 0.95, -r * 0.35, -r * 0.9, -r * 0.05);
  c.quadraticCurveTo(-r * 0.6, r * 0.05, -r * 0.35, r * 0.05);
  c.lineTo(-r * 0.7, r * 0.85);
  c.lineTo(-r * 0.15, r * 0.85);
  c.lineTo(0, r * 0.45);
  c.lineTo(r * 0.15, r * 0.85);
  c.lineTo(r * 0.7, r * 0.85);
  c.lineTo(r * 0.35, r * 0.05);
  c.quadraticCurveTo(r * 0.6, r * 0.05, r * 0.9, -r * 0.05);
  c.quadraticCurveTo(r * 0.95, -r * 0.35, r * 0.22, -r * 0.3);
  c.closePath();
}

function makeSprite(kind, r, color, blur) {
  const pad = blur * 3 + 6;
  const sz = Math.ceil(r * 2 + pad * 2);
  const cv = document.createElement('canvas');
  cv.width = sz; cv.height = sz;
  const c = cv.getContext('2d');
  if (!c) return null;
  c.translate(sz / 2, sz / 2);
  if (blur && 'filter' in c) c.filter = `blur(${blur}px)`;
  c.lineJoin = 'round';
  if (kind === 'd20') {
    d20Path(c, r);
    c.fillStyle = `${color}33`; c.fill();
    c.strokeStyle = color; c.lineWidth = Math.max(1.5, r * 0.07); c.stroke();
  } else if (kind === 'meeple') {
    meeplePath(c, r);
    c.fillStyle = `${color}66`; c.fill();
    c.strokeStyle = color; c.lineWidth = Math.max(1.5, r * 0.06); c.stroke();
  } else if (kind === 'token') {
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2);
    c.fillStyle = `${color}40`; c.fill();
    c.lineWidth = r * 0.14; c.strokeStyle = color; c.stroke();
    c.beginPath(); c.arc(0, 0, r * 0.55, 0, Math.PI * 2); c.lineWidth = r * 0.06; c.stroke();
  } else if (kind === 'card') {
    const w = r * 1.3, h = r * 1.8, rr = r * 0.16;
    c.beginPath();
    c.moveTo(-w / 2 + rr, -h / 2); c.arcTo(w / 2, -h / 2, w / 2, h / 2, rr); c.arcTo(w / 2, h / 2, -w / 2, h / 2, rr);
    c.arcTo(-w / 2, h / 2, -w / 2, -h / 2, rr); c.arcTo(-w / 2, -h / 2, w / 2, -h / 2, rr); c.closePath();
    // Olografia foil: arcobaleno in diagonale
    const g = c.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    ['#FF3DCB', '#FFD34D', '#3DF5E0', '#9B7BFF', '#FF8A3D'].forEach((col, i) => g.addColorStop(i / 4, `${col}88`));
    c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(255, 255, 255, 0.55)'; c.lineWidth = Math.max(1.5, r * 0.05); c.stroke();
    c.beginPath(); c.arc(0, 0, r * 0.32, 0, Math.PI * 2); c.strokeStyle = 'rgba(255, 255, 255, 0.4)'; c.stroke();
  }
  return cv;
}

SCENES_EXTRA.palco = {
  init(w, h) {
    const unit = Math.min(w, h);
    const kinds = ['d20', 'd20', 'meeple', 'token', 'card', 'card', 'd20', 'token', 'meeple', 'card', 'd20', 'token', 'card', 'meeple'];
    const things = kinds.map((kind, i) => {
      const depth = i / kinds.length; // 0 = lontano, 1 = vicino (più grande e più sfocato)
      const r = unit * (0.025 + depth * 0.06) * rand(0.85, 1.15);
      const blur = Math.round(1 + depth * depth * 14);
      return {
        img: makeSprite(kind, r, NEON[i % NEON.length], blur), kind,
        x: rand(0, w), y: rand(0, h), vx: rand(-0.12, 0.12) * (0.5 + depth), vy: rand(-0.22, -0.06) * (0.5 + depth),
        rot: rand(0, 6.3), vr: rand(-0.004, 0.004), a: 0.22 + (1 - depth) * 0.3, ph: rand(0, 6.3)
      };
    });
    const dust = Array.from({ length: 70 }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(0.6, 2.2), v: rand(0.05, 0.35), ph: rand(0, 6.3), c: NEON[Math.floor(rand(0, NEON.length))] }));
    return { things, dust };
  },
  draw(c, w, h, s, night, t) {
    // Due fari che si muovono piano dall'alto
    [[0.22, '255, 61, 203', 0], [0.78, '61, 245, 224', 2.2]].forEach(([x0, rgb, ph]) => {
      const ang = Math.sin(t * 0.00025 + ph) * 0.35;
      const x = w * x0, len = h * 1.25, half = w * 0.16;
      c.save();
      c.translate(x, -h * 0.05);
      c.rotate(ang);
      const g = c.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, `rgba(${rgb}, 0.16)`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      c.fillStyle = g;
      c.beginPath(); c.moveTo(-w * 0.012, 0); c.lineTo(w * 0.012, 0); c.lineTo(half, len); c.lineTo(-half, len); c.closePath(); c.fill();
      c.restore();
    });
    for (const o of s.things) {
      if (!o.img) continue;
      o.x += o.vx + Math.sin(t * 0.0006 + o.ph) * 0.15;
      o.y += o.vy;
      o.rot += o.vr;
      const half = o.img.width / 2;
      if (o.y < -half) { o.y = h + half; o.x = rand(0, w); }
      if (o.x < -half) o.x = w + half;
      if (o.x > w + half) o.x = -half;
      c.save();
      c.globalAlpha = o.kind === 'card' ? o.a * (0.75 + 0.25 * Math.sin(t * 0.002 + o.ph)) : o.a;
      c.translate(o.x, o.y);
      c.rotate(o.rot);
      if (o.kind === 'card') c.scale(Math.cos(t * 0.0005 + o.ph), 1); // la carta gira su sé stessa
      c.drawImage(o.img, -half, -half);
      c.restore();
    }
    c.globalAlpha = 1;
    for (const d of s.dust) {
      const a = 0.25 + 0.6 * Math.max(0, Math.sin(t * 0.002 + d.ph));
      c.globalAlpha = a;
      c.fillStyle = d.c;
      c.beginPath(); c.arc(d.x + Math.sin(t * 0.0008 + d.ph) * 10, d.y, d.r, 0, Math.PI * 2); c.fill();
      d.y -= d.v;
      if (d.y < -5) { d.y = h + 5; d.x = rand(0, w); }
    }
    c.globalAlpha = 1;
  }
};

const SCENES = {
  pioggia: {
    init(w, h) {
      return { drops: Array.from({ length: 110 }, () => ({ x: rand(0, w), y: rand(-h, h), l: rand(14, 34), v: rand(9, 17) })), beads: Array.from({ length: 34 }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(2, 6), v: rand(0, 0.6) })) };
    },
    draw(c, w, h, s, night) {
      c.fillStyle = night ? 'rgba(40, 70, 120, 0.10)' : 'rgba(70, 110, 160, 0.07)';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = night ? 'rgba(190, 215, 255, 0.28)' : 'rgba(40, 70, 120, 0.22)';
      c.lineWidth = 1.4;
      c.beginPath();
      for (const d of s.drops) {
        c.moveTo(d.x, d.y);
        c.lineTo(d.x - d.l * 0.18, d.y + d.l);
        d.y += d.v; d.x -= d.v * 0.18;
        if (d.y > h) { d.y = rand(-60, -10); d.x = rand(0, w + 80); }
      }
      c.stroke();
      for (const b of s.beads) {
        c.fillStyle = night ? 'rgba(200, 225, 255, 0.22)' : 'rgba(40, 70, 120, 0.16)';
        c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.fill();
        c.fillStyle = night ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.6)';
        c.beginPath(); c.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.35, 0, Math.PI * 2); c.fill();
        b.y += b.v; if (Math.random() < 0.004) b.v = rand(0.5, 2.5);
        if (b.y > h + 10) { b.y = rand(-20, h * 0.5); b.x = rand(0, w); b.v = rand(0, 0.4); }
      }
    }
  },
  candele: {
    init(w, h) {
      return {
        flames: [[0.06, 0.95], [0.16, 0.99], [0.84, 0.97], [0.94, 0.93], [0.5, 1.04]].map(([x, y]) => ({ x: x * w, y: y * h, f: rand(0, 6) })),
        embers: Array.from({ length: 40 }, () => ({ x: rand(0, w), y: rand(0, h), v: rand(0.3, 1.1), r: rand(1, 2.6), p: rand(0, 6) }))
      };
    },
    draw(c, w, h, s, night, t) {
      for (const f of s.flames) {
        const flick = 0.8 + 0.2 * Math.sin(t * 0.009 + f.f) + 0.08 * Math.sin(t * 0.031 + f.f * 2);
        const r = Math.min(w, h) * 0.42 * flick;
        const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
        g.addColorStop(0, night ? 'rgba(255, 170, 70, 0.30)' : 'rgba(255, 150, 40, 0.26)');
        g.addColorStop(0.5, night ? 'rgba(255, 120, 40, 0.10)' : 'rgba(255, 140, 40, 0.07)');
        g.addColorStop(1, 'rgba(255, 120, 40, 0)');
        c.fillStyle = g;
        c.fillRect(f.x - r, f.y - r, r * 2, r * 2);
      }
      for (const e of s.embers) {
        const a = 0.35 + 0.35 * Math.sin(t * 0.004 + e.p);
        c.fillStyle = `rgba(255, ${140 + Math.round(60 * a)}, 60, ${(night ? 0.9 : 0.7) * a})`;
        c.beginPath(); c.arc(e.x + Math.sin(t * 0.002 + e.p) * 12, e.y, e.r, 0, Math.PI * 2); c.fill();
        e.y -= e.v;
        if (e.y < -10) { e.y = h + rand(0, 40); e.x = rand(0, w); }
      }
    }
  },
  neon: {
    init() { return {}; },
    draw(c, w, h, s, night, t) {
      const horizon = h * 0.66;
      const sun = c.createLinearGradient(0, horizon - h * 0.28, 0, horizon);
      sun.addColorStop(0, night ? 'rgba(255, 90, 170, 0.35)' : 'rgba(255, 90, 170, 0.20)');
      sun.addColorStop(1, night ? 'rgba(255, 200, 60, 0.30)' : 'rgba(255, 180, 60, 0.18)');
      c.fillStyle = sun;
      c.beginPath(); c.arc(w / 2, horizon, h * 0.26, Math.PI, 0); c.fill();
      c.fillStyle = night ? 'rgba(21, 17, 43, 1)' : 'rgba(255, 244, 222, 1)';
      for (let i = 0; i < 6; i++) c.fillRect(w / 2 - h * 0.27, horizon - (i + 1) * h * 0.035, h * 0.54, 3 + i * 0.8);
      c.strokeStyle = night ? 'rgba(46, 196, 182, 0.55)' : 'rgba(123, 92, 250, 0.32)';
      c.lineWidth = 1.5;
      c.shadowColor = night ? 'rgba(46, 196, 182, 0.9)' : 'rgba(123, 92, 250, 0.4)';
      c.shadowBlur = night ? 8 : 3;
      c.beginPath();
      const off = (t * 0.04) % 40;
      for (let i = 0; i < 16; i++) {
        const z = (i * 40 + off) / 640;
        const y = horizon + Math.pow(z, 1.8) * (h - horizon) * 1.6;
        if (y > h) continue;
        c.moveTo(0, y); c.lineTo(w, y);
      }
      for (let i = -14; i <= 14; i++) {
        c.moveTo(w / 2 + i * 26, horizon);
        c.lineTo(w / 2 + i * w * 0.16, h);
      }
      c.stroke();
      c.shadowBlur = 0;
    }
  },
  stelle: {
    init(w, h) {
      return { stars: Array.from({ length: 160 }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(0.6, 2.2), p: rand(0, 6), sp: rand(0.001, 0.004) })), shoot: null };
    },
    draw(c, w, h, s, night, t) {
      for (const st of s.stars) {
        const a = 0.25 + 0.6 * (0.5 + 0.5 * Math.sin(t * st.sp + st.p));
        c.fillStyle = night ? `rgba(255, 250, 230, ${a})` : `rgba(31, 26, 61, ${a * 0.7})`;
        c.beginPath(); c.arc(st.x, st.y, st.r, 0, Math.PI * 2); c.fill();
      }
      if (!s.shoot && Math.random() < 0.004) s.shoot = { x: rand(w * 0.2, w), y: rand(0, h * 0.4), life: 1 };
      if (s.shoot) {
        const sh = s.shoot;
        c.strokeStyle = night ? `rgba(255, 255, 255, ${sh.life})` : `rgba(123, 92, 250, ${sh.life * 0.6})`;
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(sh.x, sh.y); c.lineTo(sh.x + 90, sh.y - 40); c.stroke();
        sh.x -= 14; sh.y += 6; sh.life -= 0.025;
        if (sh.life <= 0) s.shoot = null;
      }
    }
  },
  festa: {
    init(w, h) {
      const cols = ['255, 90, 78', '255, 201, 60', '46, 196, 182', '123, 92, 250', '255, 143, 177', '77, 150, 255'];
      return {
        bokeh: Array.from({ length: 26 }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(30, 110), vx: rand(-0.3, 0.3), vy: rand(-0.4, -0.1), c: cols[Math.floor(rand(0, cols.length))] })),
        bits: Array.from({ length: 50 }, () => ({ x: rand(0, w), y: rand(-h, h), v: rand(0.6, 1.6), a: rand(0, 6), c: cols[Math.floor(rand(0, cols.length))] }))
      };
    },
    draw(c, w, h, s, night, t) {
      for (const b of s.bokeh) {
        const g = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, `rgba(${b.c}, ${night ? 0.22 : 0.14})`);
        g.addColorStop(1, `rgba(${b.c}, 0)`);
        c.fillStyle = g;
        c.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
        b.x += b.vx; b.y += b.vy;
        if (b.y < -b.r) { b.y = h + b.r; b.x = rand(0, w); }
      }
      for (const p of s.bits) {
        c.save();
        c.translate(p.x + Math.sin(t * 0.002 + p.a) * 20, p.y);
        c.rotate(t * 0.003 + p.a);
        c.fillStyle = `rgba(${p.c}, ${night ? 0.7 : 0.55})`;
        c.fillRect(-4, -2, 8, 4);
        c.restore();
        p.y += p.v;
        if (p.y > h + 10) { p.y = -10; p.x = rand(0, w); }
      }
    }
  },
  nebbia: {
    init(w, h) {
      return { puffs: Array.from({ length: 18 }, () => ({ x: rand(-w * 0.2, w), y: rand(h * 0.35, h * 1.05), r: rand(140, 320), v: rand(0.15, 0.5) })) };
    },
    draw(c, w, h, s, night, t) {
      const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      v.addColorStop(0, 'rgba(0, 0, 0, 0)');
      v.addColorStop(1, night ? 'rgba(0, 0, 0, 0.45)' : 'rgba(31, 26, 61, 0.16)');
      c.fillStyle = v;
      c.fillRect(0, 0, w, h);
      for (const p of s.puffs) {
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, night ? 'rgba(200, 200, 220, 0.10)' : 'rgba(120, 115, 150, 0.15)');
        g.addColorStop(1, 'rgba(200, 200, 220, 0)');
        c.fillStyle = g;
        c.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
        p.x += p.v;
        if (p.x - p.r > w) p.x = -p.r;
      }
      if (Math.random() < 0.0015) s.flash = 1;
      if (s.flash) { c.fillStyle = `rgba(255, 255, 255, ${s.flash * (night ? 0.12 : 0.18)})`; c.fillRect(0, 0, w, h); s.flash = s.flash > 0.05 ? s.flash * 0.8 : 0; }
    }
  }
};

Object.assign(SCENES, SCENES_EXTRA);

export const Atmo = {
  scene: 'none',
  canvas: null,
  raf: null,
  last: 0,

  /** Mostra l'atmosfera indicata ('none' per toglierla). */
  set(name) {
    const sc = SCENES[name] && !isSafeMode() ? name : 'none';
    if (sc === this.scene) return;
    this.scene = sc;
    if (sc === 'none') { this.teardown(); return; }
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'atmo';
      this.canvas.setAttribute('aria-hidden', 'true');
      document.body.prepend(this.canvas);
      this.onResize = () => this.resize();
      window.addEventListener('resize', this.onResize);
    }
    this.canvas.dataset.scene = sc;
    document.documentElement.classList.add('has-atmo');
    this.resize();
    if (!this.raf) this.loop(0);
  },

  resize() {
    if (!this.canvas) return;
    const w = Math.round(window.innerWidth), h = Math.round(window.innerHeight);
    this.canvas.width = w;
    this.canvas.height = h;
    this.state = SCENES[this.scene]?.init(w, h) || {};
  },

  still() {
    return document.documentElement.classList.contains('save-power') || document.documentElement.classList.contains('a11y-motion') || document.documentElement.classList.contains('lite') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  },

  loop(t) {
    this.raf = requestAnimationFrame((x) => this.loop(x));
    if (document.hidden || t - this.last < 33) return;
    if (this.still() && this.drawnStill === this.scene) return;
    this.last = t;
    const c = this.canvas?.getContext('2d');
    const sc = SCENES[this.scene];
    if (!c || !sc) return;
    const w = this.canvas.width, h = this.canvas.height;
    c.clearRect(0, 0, w, h);
    sc.draw(c, w, h, this.state, document.documentElement.dataset.theme === 'night', t);
    this.drawnStill = this.still() ? this.scene : null;
  },

  teardown() {
    cancelAnimationFrame(this.raf);
    this.raf = null;
    this.drawnStill = null;
    window.removeEventListener('resize', this.onResize);
    this.canvas?.remove();
    this.canvas = null;
    document.documentElement.classList.remove('has-atmo');
  }
};
