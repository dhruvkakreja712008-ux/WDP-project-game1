/* Game Zone - nine games, three categories, one leaderboard.
   Works with index.html + style.css (no libraries). Scores live in localStorage. */
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function load(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var K_SCORES = 'gz_scores', K_NAME = 'gz_name', K_SOUND = 'gz_sound';
  var MULT = { easy: 1, medium: 1.5, hard: 2 };

  var state = { sound: load(K_SOUND, true) !== false };

  /* ---------- sound ---------- */
  var ac = null;
  function beep(freq, dur, type) {
    if (!state.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.value = 0.06;
      o.connect(g); g.connect(ac.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.stop(ac.currentTime + dur);
    } catch (e) {}
  }
  var sfx = {
    good: function () { beep(660, 0.12); },
    bad: function () { beep(180, 0.2, 'square'); },
    end: function () { beep(330, 0.4, 'triangle'); },
    tick: function () { beep(440, 0.05); }
  };

  /* ---------- scores ---------- */
  function getScores() { return load(K_SCORES, []); }
  function bestFor(id) {
    return getScores().reduce(function (m, s) { return s.id === id ? Math.max(m, s.score) : m; }, 0);
  }
  function playerName() {
    var v = $('#playerName').value.trim();
    return v || 'Player';
  }

  /* ---------- categories ---------- */
  var CATS = {
    mind: { name: 'Mind Games', icon: '🧠', desc: 'Test your memory, knowledge and mental maths.' },
    action: { name: 'Action Arcade', icon: '⚡', desc: 'Fast reflexes, quick hands and sharp eyes.' },
    puzzle: { name: 'Puzzle Lab', icon: '🧩', desc: 'Think ahead, plan moves and solve it.' }
  };

  /* ---------- canvas helper ---------- */
  function canvasSetup(ctx) {
    var cv = document.createElement('canvas');
    cv.className = 'cv'; cv.width = 360; cv.height = 520;
    ctx.stage.appendChild(cv);
    var inp = { left: false, right: false, move: null };
    function toX(e) { var r = cv.getBoundingClientRect(); return (e.clientX - r.left) * 360 / r.width; }
    function pm(e) { if (inp.move) inp.move(toX(e)); }
    function kd(e) {
      var k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') { inp.left = true; e.preventDefault(); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { inp.right = true; e.preventDefault(); }
    }
    function ku(e) {
      var k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') inp.left = false;
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') inp.right = false;
    }
    cv.addEventListener('pointermove', pm);
    cv.addEventListener('pointerdown', pm);
    document.addEventListener('keydown', kd);
    document.addEventListener('keyup', ku);
    return {
      g: cv.getContext('2d'), W: 360, H: 520, inp: inp,
      dispose: function () {
        document.removeEventListener('keydown', kd);
        document.removeEventListener('keyup', ku);
      }
    };
  }

  /* ---------- GAMES ---------- */
  var GAMES = [];

  /* 1. Memory Match */
  GAMES.push({
    id: 'memory', cat: 'mind', title: 'Memory Match', flush: false,
    blurb: 'Flip cards and find all the matching pairs before time runs out.',
    how: 'Click two cards to flip them. Match a pair for 100 points. Clear the board for a time bonus and a fresh board.',
    time: { easy: 90, medium: 75, hard: 60 },
    info: { easy: '12 cards (6 pairs) · 90 seconds', medium: '16 cards (8 pairs) · 75 seconds', hard: '20 cards (10 pairs) · 60 seconds' },
    start: function (ctx) {
      var cfg = { easy: { cols: 4, pairs: 6 }, medium: { cols: 4, pairs: 8 }, hard: { cols: 5, pairs: 10 } }[ctx.diff];
      var syms = ['★', '◆', '●', '▲', '♥', '♠', '♣', '✿', '☀', '☾'];
      var status = el('div', 'status', 'Find the pairs!');
      var grid = el('div', 'mgrid');
      grid.style.gridTemplateColumns = 'repeat(' + cfg.cols + ', 1fr)';
      ctx.stage.appendChild(status);
      ctx.stage.appendChild(grid);
      var first = null, lock = false, matched = 0, timers = [];
      function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
      function build() {
        grid.innerHTML = ''; matched = 0; first = null; lock = false;
        var ids = [];
        for (var i = 0; i < cfg.pairs; i++) { ids.push(i); ids.push(i); }
        shuffle(ids).forEach(function (id) {
          var b = el('button', 'mcard'); b.type = 'button'; b.dataset.id = id;
          b.setAttribute('aria-label', 'Hidden card');
          b.innerHTML = '<span class="mi"><span class="mb"></span><span class="mf s' + (id % 4) + '">' + syms[id] + '</span></span>';
          b.addEventListener('click', function () { flip(b); });
          grid.appendChild(b);
        });
      }
      function flip(b) {
        if (ctx.over || lock || b.classList.contains('flipped') || b.classList.contains('matched')) return;
        b.classList.add('flipped'); sfx.tick();
        if (!first) { first = b; return; }
        var a = first; first = null;
        if (a.dataset.id === b.dataset.id) {
          a.classList.add('matched'); b.classList.add('matched');
          ctx.add(100); sfx.good(); matched++;
          if (matched === cfg.pairs) {
            var bonus = (ctx.left() || 0) * 3;
            ctx.add(bonus);
            status.textContent = 'Board cleared! +' + bonus + ' time bonus';
            lock = true;
            later(function () { status.textContent = 'New board!'; build(); }, 900);
          }
        } else {
          lock = true; sfx.bad();
          later(function () { a.classList.remove('flipped'); b.classList.remove('flipped'); lock = false; }, 700);
        }
      }
      build();
      return function () { timers.forEach(clearTimeout); };
    }
  });

  /* 2. Quick Quiz */
  var QUIZ = [
    ['What is the capital of Australia?', ['Canberra', 'Sydney', 'Melbourne', 'Perth'], 0],
    ['Which planet is known as the Red Planet?', ['Venus', 'Mars', 'Jupiter', 'Mercury'], 1],
    ['How many continents are there?', ['5', '6', '7', '8'], 2],
    ['Which is the largest ocean?', ['Atlantic', 'Indian', 'Arctic', 'Pacific'], 3],
    ['Who wrote Romeo and Juliet?', ['William Shakespeare', 'Charles Dickens', 'Mark Twain', 'Jane Austen'], 0],
    ['What is the chemical symbol for gold?', ['Ag', 'Au', 'Gd', 'Go'], 1],
    ['Which is the fastest land animal?', ['Lion', 'Horse', 'Cheetah', 'Leopard'], 2],
    ['What does HTML stand for?', ['HyperText Markup Language', 'High Tech Modern Language', 'HyperTool Multi Language', 'Home Text Markup Level'], 0],
    ['What is the smallest prime number?', ['0', '1', '3', '2'], 3],
    ['What is the hardest natural substance?', ['Gold', 'Iron', 'Diamond', 'Quartz'], 2],
    ['Which is the largest planet in our solar system?', ['Saturn', 'Jupiter', 'Neptune', 'Earth'], 1],
    ['What is the currency of Japan?', ['Won', 'Yuan', 'Yen', 'Ringgit'], 2],
    ['Which gas do plants absorb for photosynthesis?', ['Oxygen', 'Nitrogen', 'Hydrogen', 'Carbon dioxide'], 3],
    ['What is 5 in binary?', ['101', '110', '011', '100'], 0],
    ['Who painted the Mona Lisa?', ['Michelangelo', 'Leonardo da Vinci', 'Picasso', 'Van Gogh'], 1],
    ['What is the capital of India?', ['Mumbai', 'Kolkata', 'New Delhi', 'Chennai'], 2],
    ['What does CPU stand for?', ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Core Processing Unit'], 0],
    ['How many sides does a hexagon have?', ['5', '6', '7', '8'], 1],
    ['At what temperature (in °C) does water boil at sea level?', ['90', '80', '100', '120'], 2],
    ['Which organ pumps blood around the body?', ['Liver', 'Lungs', 'Kidney', 'Heart'], 3],
    ['Which language is used to style web pages?', ['CSS', 'SQL', 'PHP', 'Java'], 0],
    ['What is the square root of 144?', ['10', '12', '14', '16'], 1],
    ['What is the national animal of India?', ['Lion', 'Elephant', 'Tiger', 'Peacock'], 2],
    ['Who developed the theory of relativity?', ['Newton', 'Galileo', 'Tesla', 'Einstein'], 3]
  ];
  GAMES.push({
    id: 'quiz', cat: 'mind', title: 'Quick Quiz', flush: false,
    blurb: 'General knowledge questions against the clock.',
    how: 'Pick the right answer. Each correct answer scores 10 points. On Hard, a wrong answer costs 5 points.',
    time: { easy: 90, medium: 60, hard: 45 },
    info: { easy: '90 seconds · no penalty', medium: '60 seconds · no penalty', hard: '45 seconds · −5 for a wrong answer' },
    start: function (ctx) {
      var order = [], timers = [];
      var qt = el('div', 'qtext'), opts = el('div', 'opts'), status = el('div', 'status');
      status.style.marginTop = '12px';
      ctx.stage.appendChild(qt); ctx.stage.appendChild(opts); ctx.stage.appendChild(status);
      function next() {
        if (ctx.over) return;
        if (!order.length) order = shuffle(QUIZ.map(function (_, i) { return i; }));
        var q = QUIZ[order.pop()];
        var answers = shuffle(q[1].map(function (t, i) { return { t: t, ok: i === q[2] }; }));
        qt.textContent = q[0]; opts.innerHTML = ''; status.textContent = '';
        answers.forEach(function (a) {
          var b = el('button', 'opt', a.t); b.type = 'button';
          b.addEventListener('click', function () {
            if (ctx.over) return;
            $$('#stage .opt').forEach(function (x) { x.disabled = true; });
            if (a.ok) { b.classList.add('ok'); ctx.add(10); sfx.good(); status.textContent = 'Correct! +10'; }
            else {
              b.classList.add('bad'); sfx.bad();
              $$('#stage .opt').forEach(function (x) { if (x.textContent === q[1][q[2]]) x.classList.add('ok'); });
              if (ctx.diff === 'hard') { ctx.add(-5); status.textContent = 'Wrong! −5'; } else status.textContent = 'Wrong answer';
            }
            timers.push(setTimeout(next, 800));
          });
          opts.appendChild(b);
        });
      }
      next();
      return function () { timers.forEach(clearTimeout); };
    }
  });

  /* 3. Math Sprint */
  GAMES.push({
    id: 'math', cat: 'mind', title: 'Math Sprint', flush: false,
    blurb: 'Solve as many sums as you can in the time limit.',
    how: 'Type the answer and press Enter. Each correct answer scores 10 points.',
    time: { easy: 60, medium: 60, hard: 60 },
    info: { easy: 'Add and subtract up to 20', medium: 'Add, subtract and multiply (tables up to 12)', hard: 'Bigger numbers and tougher multiplication' },
    start: function (ctx) {
      var ans = 0, q = el('div', 'mathq'), form = el('form'), inp = el('input', 'field'), status = el('div', 'status');
      inp.type = 'text'; inp.inputMode = 'numeric'; inp.autocomplete = 'off'; inp.setAttribute('aria-label', 'Your answer');
      form.appendChild(inp);
      var row = el('div', 'row'), sub = el('button', 'btn small', 'Submit'); sub.type = 'submit'; row.appendChild(sub); form.appendChild(row);
      ctx.stage.appendChild(q); ctx.stage.appendChild(form); ctx.stage.appendChild(status);
      function gen() {
        var a, b, op, d = ctx.diff;
        if (d === 'easy') { a = rnd(1, 20); b = rnd(1, 20); op = Math.random() < 0.5 ? '+' : '-'; if (op === '-' && b > a) { var t = a; a = b; b = t; } }
        else if (d === 'medium') {
          var r = Math.random();
          if (r < 0.35) { op = '+'; a = rnd(10, 60); b = rnd(10, 60); }
          else if (r < 0.65) { op = '-'; a = rnd(30, 99); b = rnd(10, a); }
          else { op = '×'; a = rnd(2, 12); b = rnd(2, 12); }
        } else {
          var h = Math.random();
          if (h < 0.3) { op = '+'; a = rnd(100, 500); b = rnd(100, 500); }
          else if (h < 0.5) { op = '-'; a = rnd(200, 900); b = rnd(50, a); }
          else { op = '×'; a = rnd(6, 19); b = rnd(6, 15); }
        }
        ans = op === '+' ? a + b : op === '-' ? a - b : a * b;
        q.textContent = a + ' ' + op + ' ' + b + ' = ?';
        inp.value = ''; inp.focus();
      }
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (ctx.over || inp.value.trim() === '') return;
        if (parseInt(inp.value, 10) === ans) { ctx.add(10); sfx.good(); status.textContent = 'Correct! +10'; }
        else { sfx.bad(); status.textContent = 'Not quite: it was ' + ans; ctx.stage.classList.remove('shake'); void ctx.stage.offsetWidth; ctx.stage.classList.add('shake'); }
        gen();
      });
      gen();
      return function () {};
    }
  });

  /* 4. Speed Click */
  GAMES.push({
    id: 'speed', cat: 'action', title: 'Speed Click', flush: false,
    blurb: 'Hit the targets before they shrink away.',
    how: 'Click each target as soon as it appears. Every hit scores 10 points. Targets vanish faster on higher levels.',
    time: { easy: 30, medium: 30, hard: 30 },
    info: { easy: 'Big targets · 1.6 s each', medium: 'Medium targets · 1.2 s each', hard: 'Small targets · 0.85 s each' },
    start: function (ctx) {
      var cfg = { easy: { s: 72, life: 1600 }, medium: { s: 56, life: 1200 }, hard: { s: 42, life: 850 } }[ctx.diff];
      var hits = 0, misses = 0, timers = [], cur = null;
      var stats = el('div', 'stats');
      stats.innerHTML = 'Hits<b id="sH">0</b> Misses<b id="sM">0</b>';
      var arena = el('div', 'arena');
      ctx.stage.appendChild(stats); ctx.stage.appendChild(arena);
      function upd() { $('#sH').textContent = hits; $('#sM').textContent = misses; }
      function spawn() {
        if (ctx.over) return;
        var t = el('button', 'tgt'); t.type = 'button'; t.setAttribute('aria-label', 'Target');
        t.style.width = t.style.height = cfg.s + 'px';
        t.style.left = rnd(8, Math.max(9, arena.clientWidth - cfg.s - 8)) + 'px';
        t.style.top = rnd(8, Math.max(9, arena.clientHeight - cfg.s - 8)) + 'px';
        t.style.setProperty('--life', cfg.life + 'ms');
        arena.appendChild(t); cur = t;
        var expire = setTimeout(function () {
          if (cur !== t) return;
          t.remove(); misses++; upd(); sfx.bad(); spawn();
        }, cfg.life);
        timers.push(expire);
        t.addEventListener('click', function (e) {
          e.stopPropagation();
          if (t.classList.contains('hit') || ctx.over) return;
          clearTimeout(expire);
          t.classList.add('hit'); hits++; ctx.add(10); upd(); sfx.good();
          var f = el('span', 'fl', '+10'); f.style.left = t.style.left; f.style.top = t.style.top; arena.appendChild(f);
          timers.push(setTimeout(function () { f.remove(); }, 600));
          cur = null;
          timers.push(setTimeout(function () { t.remove(); spawn(); }, 120));
        });
      }
      spawn();
      return function () { timers.forEach(clearTimeout); };
    }
  });

  /* 5. Dodge Blocks (canvas) */
  GAMES.push({
    id: 'dodge', cat: 'action', title: 'Dodge Blocks', flush: true,
    blurb: 'Steer your ship and dodge the falling blocks.',
    how: 'Move with your mouse, finger or the arrow keys (or A / D). Each block you dodge scores 5 points. One hit ends the game.',
    time: null,
    info: { easy: 'Slow blocks, wide gaps', medium: 'Faster blocks', hard: 'Fast, dense blocks' },
    start: function (ctx) {
      var c = canvasSetup(ctx), g = c.g, W = c.W, H = c.H;
      var cfg = { easy: { gap: 760, sp: 2.4 }, medium: { gap: 540, sp: 3.2 }, hard: { gap: 400, sp: 4.2 } }[ctx.diff];
      var p = { x: W / 2, w: 42, h: 16, y: H - 34 };
      var blocks = [], acc = 0, elapsed = 0, last = performance.now(), raf = 0;
      c.inp.move = function (x) { p.x = x; };
      function frame(now) {
        if (ctx.over) return;
        var dt = Math.min(40, now - last); last = now;
        var k = dt / 16.67; elapsed += dt;
        if (c.inp.left) p.x -= 6 * k;
        if (c.inp.right) p.x += 6 * k;
        p.x = Math.max(p.w / 2, Math.min(W - p.w / 2, p.x));
        acc += dt;
        var gap = cfg.gap - Math.min(elapsed / 60, cfg.gap * 0.5);
        if (acc >= gap) {
          acc = 0;
          var w = rnd(24, 60);
          blocks.push({ x: rnd(0, W - w), y: -20, w: w, h: rnd(18, 30), v: cfg.sp * (1 + elapsed / 45000) * (0.85 + Math.random() * 0.4) });
        }
        g.fillStyle = '#05060b'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#ff4fa3';
        for (var i = blocks.length - 1; i >= 0; i--) {
          var b = blocks[i];
          b.y += b.v * k;
          g.fillRect(b.x, b.y, b.w, b.h);
          if (b.x < p.x + p.w / 2 - 3 && b.x + b.w > p.x - p.w / 2 + 3 && b.y < p.y + p.h && b.y + b.h > p.y + 2) {
            sfx.end(); ctx.end(); return;
          }
          if (b.y > H) { blocks.splice(i, 1); ctx.add(5); }
        }
        g.fillStyle = '#00d4ff';
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + p.w / 2, p.y + p.h); g.lineTo(p.x - p.w / 2, p.y + p.h); g.closePath(); g.fill();
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
      return function () { cancelAnimationFrame(raf); c.dispose(); };
    }
  });

  /* 6. Star Catcher (canvas) */
  GAMES.push({
    id: 'stars', cat: 'action', title: 'Star Catcher', flush: true,
    blurb: 'Catch the gold stars and avoid the bombs.',
    how: 'Slide the paddle with your mouse, finger or arrow keys. Stars are +10, bombs are −20.',
    time: { easy: 45, medium: 45, hard: 40 },
    info: { easy: '45 seconds · few bombs', medium: '45 seconds · more bombs', hard: '40 seconds · fast and bomb-heavy' },
    start: function (ctx) {
      var c = canvasSetup(ctx), g = c.g, W = c.W, H = c.H;
      var cfg = { easy: { gap: 750, sp: 2.2, bomb: 0.15 }, medium: { gap: 600, sp: 3, bomb: 0.25 }, hard: { gap: 480, sp: 3.8, bomb: 0.35 } }[ctx.diff];
      var pad = { x: W / 2, w: 70, h: 12, y: H - 30 };
      var items = [], acc = 0, last = performance.now(), raf = 0;
      c.inp.move = function (x) { pad.x = x; };
      function frame(now) {
        if (ctx.over) return;
        var dt = Math.min(40, now - last); last = now;
        var k = dt / 16.67;
        if (c.inp.left) pad.x -= 7 * k;
        if (c.inp.right) pad.x += 7 * k;
        pad.x = Math.max(pad.w / 2, Math.min(W - pad.w / 2, pad.x));
        acc += dt;
        if (acc >= cfg.gap) {
          acc = 0;
          items.push({ x: rnd(16, W - 16), y: -16, r: 13, v: cfg.sp * (0.85 + Math.random() * 0.4), bomb: Math.random() < cfg.bomb });
        }
        g.fillStyle = '#05060b'; g.fillRect(0, 0, W, H);
        for (var i = items.length - 1; i >= 0; i--) {
          var it = items[i];
          it.y += it.v * k;
          if (it.bomb) {
            g.fillStyle = '#ff4fa3'; g.beginPath(); g.arc(it.x, it.y, it.r, 0, 6.2832); g.fill();
            g.strokeStyle = '#05060b'; g.lineWidth = 3; g.beginPath();
            g.moveTo(it.x - 6, it.y - 6); g.lineTo(it.x + 6, it.y + 6); g.moveTo(it.x + 6, it.y - 6); g.lineTo(it.x - 6, it.y + 6); g.stroke();
          } else {
            g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(it.x, it.y, it.r, 0, 6.2832); g.fill();
            g.fillStyle = '#fff6c4'; g.beginPath(); g.arc(it.x - 4, it.y - 4, 4, 0, 6.2832); g.fill();
          }
          var caught = it.y + it.r >= pad.y && it.y - it.r <= pad.y + pad.h && Math.abs(it.x - pad.x) <= pad.w / 2 + it.r;
          if (caught) {
            items.splice(i, 1);
            if (it.bomb) { ctx.add(-20); sfx.bad(); } else { ctx.add(10); sfx.good(); }
          } else if (it.y > H + 20) items.splice(i, 1);
        }
        g.fillStyle = '#39ff88'; g.fillRect(pad.x - pad.w / 2, pad.y, pad.w, pad.h);
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
      return function () { cancelAnimationFrame(raf); c.dispose(); };
    }
  });

  /* 7. Tic-Tac-Toe */
  var LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  function winnerOf(b) {
    for (var i = 0; i < LINES.length; i++) {
      var l = LINES[i];
      if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return { p: b[l[0]], l: l };
    }
    return null;
  }
  function minimax(b, turn) {
    var w = winnerOf(b);
    if (w) return w.p === 'O' ? 10 : -10;
    if (b.every(Boolean)) return 0;
    var best = turn === 'O' ? -99 : 99;
    for (var i = 0; i < 9; i++) {
      if (!b[i]) {
        b[i] = turn;
        var s = minimax(b, turn === 'O' ? 'X' : 'O');
        b[i] = '';
        best = turn === 'O' ? Math.max(best, s) : Math.min(best, s);
      }
    }
    return best;
  }
  GAMES.push({
    id: 'ttt', cat: 'puzzle', title: 'Tic-Tac-Toe', flush: false,
    blurb: 'Beat the computer and build a winning streak.',
    how: 'You are X. Win a round for 30 points, draw for 10. The game ends the first time you lose.',
    time: null,
    info: { easy: 'Computer plays random moves', medium: 'Computer blocks and wins when it can', hard: 'Computer never makes a mistake' },
    start: function (ctx) {
      var board, cells = [], timers = [], busy = false;
      var status = el('div', 'status'), grid = el('div', 'ttt'), hint = el('div', 'hint', 'You are X. Computer is O.');
      ctx.stage.appendChild(status); ctx.stage.appendChild(grid); ctx.stage.appendChild(hint);
      function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
      function newRound() {
        board = ['', '', '', '', '', '', '', '', '']; busy = false;
        grid.innerHTML = ''; cells = [];
        for (var i = 0; i < 9; i++) (function (i) {
          var b = el('button', 'tcell'); b.type = 'button'; b.setAttribute('aria-label', 'Cell ' + (i + 1));
          b.addEventListener('click', function () { play(i); });
          grid.appendChild(b); cells.push(b);
        })(i);
        status.textContent = 'Your move';
      }
      function mark(i, p) {
        board[i] = p; cells[i].textContent = p; cells[i].classList.add(p.toLowerCase()); cells[i].disabled = true;
      }
      function check() {
        var w = winnerOf(board);
        if (w) {
          w.l.forEach(function (i) { cells[i].classList.add('win'); });
          cells.forEach(function (c) { c.disabled = true; });
          busy = true;
          if (w.p === 'X') { ctx.add(30); sfx.good(); status.textContent = 'You win! +30'; later(newRound, 1000); }
          else { sfx.end(); status.textContent = 'Computer wins!'; later(function () { ctx.end(); }, 900); }
          return true;
        }
        if (board.every(Boolean)) {
          busy = true; ctx.add(10); status.textContent = 'Draw! +10'; later(newRound, 1000); return true;
        }
        return false;
      }
      function play(i) {
        if (ctx.over || busy || board[i]) return;
        mark(i, 'X'); sfx.tick();
        if (check()) return;
        busy = true; status.textContent = 'Computer is thinking...';
        later(function () {
          if (ctx.over) return;
          mark(aiMove(), 'O');
          if (!check()) { busy = false; status.textContent = 'Your move'; }
        }, 350);
      }
      function empties() { var e = []; for (var i = 0; i < 9; i++) if (!board[i]) e.push(i); return e; }
      function findWin(p) {
        var e = empties();
        for (var j = 0; j < e.length; j++) { board[e[j]] = p; var w = winnerOf(board); board[e[j]] = ''; if (w) return e[j]; }
        return -1;
      }
      function aiMove() {
        var e = empties();
        if (ctx.diff === 'easy') return e[rnd(0, e.length - 1)];
        if (ctx.diff === 'medium') {
          var w = findWin('O'); if (w >= 0) return w;
          var b = findWin('X'); if (b >= 0) return b;
          return e[rnd(0, e.length - 1)];
        }
        var best = -99, pick = e[0];
        e.forEach(function (i) {
          board[i] = 'O'; var s = minimax(board, 'X'); board[i] = '';
          if (s > best) { best = s; pick = i; }
        });
        return pick;
      }
      newRound();
      return function () { timers.forEach(clearTimeout); };
    }
  });

  /* 8. 2048 */
  GAMES.push({
    id: 'g2048', cat: 'puzzle', title: '2048', flush: false,
    blurb: 'Slide and merge tiles to reach the highest number.',
    how: 'Use arrow keys (or W A S D), swipe, or the buttons. Equal tiles merge and add to your score. The game ends when the board is full.',
    time: { hard: 240 },
    info: { easy: 'Untimed · mostly 2s spawn', medium: 'Untimed · occasional 4s', hard: '4 minutes · more 4s' },
    start: function (ctx) {
      var four = { easy: 0.05, medium: 0.12, hard: 0.25 }[ctx.diff];
      var b = []; for (var i = 0; i < 4; i++) b.push([0, 0, 0, 0]);
      var grid = el('div', 'g2048'), pad = el('div', 'dpad'), newPos = -1;
      var status = el('div', 'status'); status.style.marginTop = '10px';
      ctx.stage.appendChild(grid); ctx.stage.appendChild(pad); ctx.stage.appendChild(status);
      function spawn() {
        var e = [];
        for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) if (!b[r][c]) e.push([r, c]);
        if (!e.length) return;
        var s = e[rnd(0, e.length - 1)];
        b[s[0]][s[1]] = Math.random() < four ? 4 : 2; newPos = s[0] * 4 + s[1];
      }
      function render() {
        grid.innerHTML = '';
        for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) {
          var v = b[r][c], t = el('div', 'tile');
          if (!v) t.classList.add('e');
          else {
            t.textContent = v;
            t.style.setProperty('--p', Math.min(100, Math.log2(v) / 11 * 100) + '%');
            var len = String(v).length;
            if (len === 3) t.classList.add('d3'); else if (len >= 4) t.classList.add('d4');
            if (v >= 64) t.classList.add('hi');
            if (v >= 2048) t.classList.add('gold');
            if (r * 4 + c === newPos) t.classList.add('pop');
          }
          grid.appendChild(t);
        }
        newPos = -1;
      }
      function slide(line) {
        var a = line.filter(Boolean), gained = 0;
        for (var i = 0; i < a.length - 1; i++) {
          if (a[i] === a[i + 1]) { a[i] *= 2; gained += a[i]; a.splice(i + 1, 1); }
        }
        while (a.length < 4) a.push(0);
        return { a: a, gained: gained };
      }
      function move(dir) {
        if (ctx.over) return;
        var moved = false, gained = 0;
        for (var i = 0; i < 4; i++) {
          var line = [];
          for (var j = 0; j < 4; j++) {
            if (dir === 'L') line.push(b[i][j]);
            else if (dir === 'R') line.push(b[i][3 - j]);
            else if (dir === 'U') line.push(b[j][i]);
            else line.push(b[3 - j][i]);
          }
          var res = slide(line); gained += res.gained;
          for (var k = 0; k < 4; k++) {
            var r, c;
            if (dir === 'L') { r = i; c = k; } else if (dir === 'R') { r = i; c = 3 - k; }
            else if (dir === 'U') { r = k; c = i; } else { r = 3 - k; c = i; }
            if (b[r][c] !== res.a[k]) moved = true;
            b[r][c] = res.a[k];
          }
        }
        if (!moved) return;
        if (gained) { ctx.add(gained); sfx.good(); } else sfx.tick();
        spawn(); render();
        if (!canMove()) { status.textContent = 'No more moves!'; sfx.end(); setTimeout(function () { ctx.end(); }, 700); }
      }
      function canMove() {
        for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) {
          if (!b[r][c]) return true;
          if (c < 3 && b[r][c] === b[r][c + 1]) return true;
          if (r < 3 && b[r][c] === b[r + 1][c]) return true;
        }
        return false;
      }
      function kd(e) {
        var m = { ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D', a: 'L', A: 'L', d: 'R', D: 'R', w: 'U', W: 'U', s: 'D', S: 'D' }[e.key];
        if (m) { e.preventDefault(); move(m); }
      }
      document.addEventListener('keydown', kd);
      [['←', 'L'], ['↑', 'U'], ['↓', 'D'], ['→', 'R']].forEach(function (d) {
        var bt = el('button', null, d[0]); bt.type = 'button'; bt.setAttribute('aria-label', 'Move ' + d[1]);
        bt.addEventListener('click', function () { move(d[1]); });
        pad.appendChild(bt);
      });
      var sx = 0, sy = 0;
      grid.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; });
      grid.addEventListener('pointerup', function (e) {
        var dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'R' : 'L'); else move(dy > 0 ? 'D' : 'U');
      });
      spawn(); spawn(); render();
      return function () { document.removeEventListener('keydown', kd); };
    }
  });

  /* 9. Word Scramble */
  var WORDS = {
    easy: [['Animal', 'TIGER'], ['Animal', 'ZEBRA'], ['Animal', 'HORSE'], ['Fruit', 'MANGO'], ['Fruit', 'APPLE'], ['Fruit', 'GRAPE'], ['Fruit', 'LEMON'], ['Country', 'INDIA'], ['Country', 'CHINA'], ['Country', 'SPAIN'], ['Country', 'NEPAL'], ['Tech', 'MOUSE'], ['Colour', 'GREEN'], ['Colour', 'BLACK']],
    medium: [['Animal', 'DOLPHIN'], ['Animal', 'GIRAFFE'], ['Animal', 'MONKEY'], ['Fruit', 'BANANA'], ['Fruit', 'ORANGE'], ['Fruit', 'PAPAYA'], ['Tech', 'MONITOR'], ['Tech', 'BROWSER'], ['Tech', 'PYTHON'], ['Tech', 'SERVER'], ['Country', 'FRANCE'], ['Country', 'BRAZIL'], ['Country', 'CANADA'], ['College', 'LIBRARY'], ['College', 'PROJECT'], ['College', 'CAMPUS'], ['College', 'LECTURE']],
    hard: [['Animal', 'ELEPHANT'], ['Fruit', 'STRAWBERRY'], ['Food', 'CHOCOLATE'], ['Country', 'AUSTRALIA'], ['Tech', 'ALGORITHM'], ['Tech', 'KEYBOARD'], ['Tech', 'DATABASE'], ['Tech', 'COMPUTER'], ['Tech', 'PROGRAMMING'], ['College', 'UNIVERSITY'], ['College', 'SEMESTER'], ['College', 'ENGINEERING']]
  };
  GAMES.push({
    id: 'scramble', cat: 'puzzle', title: 'Word Scramble', flush: false,
    blurb: 'Unscramble the letters to find the hidden word.',
    how: 'Type the word and press Enter. Each correct word scores 2 points per letter. Skip a word if you are stuck.',
    time: { easy: 75, medium: 60, hard: 60 },
    info: { easy: '4–5 letter words · 75 seconds', medium: '6–7 letter words · 60 seconds', hard: '8+ letter words · 60 seconds' },
    start: function (ctx) {
      var pool = [], word = '';
      var cat = el('div', 'cat'), letters = el('div', 'letters'), form = el('form'), inp = el('input', 'field'), status = el('div', 'status');
      inp.type = 'text'; inp.autocomplete = 'off'; inp.autocapitalize = 'characters'; inp.setAttribute('aria-label', 'Your answer');
      form.appendChild(inp);
      var row = el('div', 'row'), sub = el('button', 'btn small', 'Submit'), skip = el('button', 'btn ghost small', 'Skip');
      sub.type = 'submit'; skip.type = 'button'; row.appendChild(sub); row.appendChild(skip); form.appendChild(row);
      ctx.stage.appendChild(cat); ctx.stage.appendChild(letters); ctx.stage.appendChild(form); ctx.stage.appendChild(status);
      function next() {
        if (!pool.length) pool = shuffle(WORDS[ctx.diff]);
        var w = pool.pop(); word = w[1]; cat.textContent = 'Category: ' + w[0];
        var s = word;
        for (var tries = 0; tries < 20 && s === word; tries++) s = shuffle(word.split('')).join('');
        letters.innerHTML = '';
        s.split('').forEach(function (ch) { letters.appendChild(el('span', 'lt', ch)); });
        inp.value = ''; inp.focus();
      }
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (ctx.over || !inp.value.trim()) return;
        if (inp.value.trim().toUpperCase() === word) {
          var pts = word.length * 2; ctx.add(pts); sfx.good(); status.textContent = 'Correct! +' + pts; next();
        } else {
          sfx.bad(); status.textContent = 'Try again';
          inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake');
        }
      });
      skip.addEventListener('click', function () { if (!ctx.over) { status.textContent = 'Skipped: ' + word; next(); } });
      next();
      return function () {};
    }
  });

  /* ---------- views ---------- */
  var views = { home: $('#view-home'), category: $('#view-category'), game: $('#view-game'), leaderboard: $('#view-leaderboard') };
  var cur = { cat: null, game: null, diff: 'medium' };
  var run = null;

  function show(name) {
    stopRun();
    Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });
    window.scrollTo(0, 0);
    if (name === 'home') renderHome();
    if (name === 'leaderboard') renderBoard();
  }

  /* ---------- home ---------- */
  function renderHome() {
    var cats = $('#cats'); cats.innerHTML = '';
    Object.keys(CATS).forEach(function (key) {
      var c = CATS[key], card = el('div', 'catcard ' + key);
      card.appendChild(el('div', 'caticon', c.icon));
      card.appendChild(el('h3', null, c.name));
      card.appendChild(el('p', null, c.desc));
      var ul = el('ul');
      GAMES.filter(function (g) { return g.cat === key; }).forEach(function (g, i) {
        var li = el('li'); li.appendChild(el('b', null, String(i + 1))); li.appendChild(document.createTextNode(g.title)); ul.appendChild(li);
      });
      card.appendChild(ul);
      var btn = el('button', 'btn', 'Play ' + c.name.split(' ')[0]); btn.type = 'button';
      btn.addEventListener('click', function () { openCategory(key); });
      card.appendChild(btn);
      cats.appendChild(card);
    });
    var list = $('#topScores'); list.innerHTML = '';
    var top = getScores().slice().sort(function (a, b) { return b.score - a.score; }).slice(0, 5);
    if (!top.length) { list.appendChild(el('li', 'empty', 'No scores yet. Be the first!')); return; }
    top.forEach(function (s, i) {
      var li = el('li');
      li.appendChild(el('span', 'rank', String(i + 1)));
      li.appendChild(el('span', 'who', s.name));
      li.appendChild(el('span', 'what', s.game + ' · ' + cap(s.diff)));
      li.appendChild(el('span', 'pts', String(s.score)));
      list.appendChild(li);
    });
  }

  /* ---------- category ---------- */
  function openCategory(key) {
    cur.cat = key;
    show('category');
    views.category.className = 'view ' + key;
    var c = CATS[key], head = $('#catHead'); head.innerHTML = '';
    head.appendChild(el('p', 'eyebrow', 'Category'));
    head.appendChild(el('h2', null, c.icon + ' ' + c.name));
    head.appendChild(el('p', 'lede', c.desc));
    var box = $('#gameCards'); box.innerHTML = '';
    GAMES.forEach(function (g, idx) {
      if (g.cat !== key) return;
      var card = el('div', 'gcard');
      card.appendChild(el('div', 'gnum', (idx < 9 ? '0' : '') + (idx + 1)));
      card.appendChild(el('h3', null, g.title));
      card.appendChild(el('p', null, g.blurb));
      var tags = el('div', 'tags');
      tags.appendChild(el('span', g.time ? 'tag timed' : 'tag', g.time ? 'Timed' : 'Endless'));
      tags.appendChild(el('span', 'tag', 'Easy · Medium · Hard'));
      card.appendChild(tags);
      var best = el('div', 'gbest'); best.appendChild(document.createTextNode('Best score: ')); best.appendChild(el('b', null, String(bestFor(g.id))));
      card.appendChild(best);
      var btn = el('button', 'btn', 'Play'); btn.type = 'button';
      btn.addEventListener('click', function () { openGame(g); });
      card.appendChild(btn);
      box.appendChild(card);
    });
  }

  /* ---------- game page ---------- */
  function openGame(g) {
    cur.game = g; cur.cat = g.cat; cur.diff = 'medium';
    show('game');
    views.game.className = 'view ' + g.cat;
    $('#gCat').textContent = CATS[g.cat].name;
    $('#gTitle').textContent = g.title;
    $('#gHow').textContent = g.how;
    $('#hScore').textContent = '0';
    $('#hTime').textContent = '--';
    $('#hBest').textContent = bestFor(g.id);
    $('#setup').hidden = false; $('#runbar').hidden = true;
    var stage = $('#stage'); stage.hidden = true; stage.innerHTML = '';
    setDiff('medium');
  }
  function setDiff(d) {
    cur.diff = d;
    $$('#diffSeg button').forEach(function (b) { b.classList.toggle('on', b.dataset.d === d); b.setAttribute('aria-pressed', b.dataset.d === d); });
    $('#hDiff').textContent = cap(d);
    $('#levelInfo').textContent = cur.game.info[d];
    $('#multInfo').textContent = 'Score multiplier: ×' + MULT[d];
  }

  /* ---------- run engine ---------- */
  function setRaw(r, n) {
    if (r.over) return;
    r.raw = Math.max(0, n);
    $('#hScore').textContent = r.raw;
  }
  function startGame() {
    stopRun();
    var g = cur.game, stage = $('#stage');
    var r = { g: g, diff: cur.diff, raw: 0, over: false, cleanup: null, left: null, tid: null };
    run = r;
    $('#setup').hidden = true; $('#runbar').hidden = false;
    stage.hidden = false; stage.innerHTML = '';
    stage.className = 'stage' + (g.flush ? ' flush' : '');
    $('#hScore').textContent = '0';
    $('#hDiff').textContent = cap(r.diff);
    $('#hBest').textContent = bestFor(g.id);
    var t = g.time && g.time[r.diff];
    if (t) {
      r.left = t; $('#hTime').textContent = t;
      r.tid = setInterval(function () {
        r.left--; $('#hTime').textContent = Math.max(0, r.left);
        if (r.left <= 0) endGame(r);
      }, 1000);
    } else $('#hTime').textContent = '--';
    var ctx = {
      stage: stage, diff: r.diff, sfx: sfx,
      add: function (n) { setRaw(r, r.raw + n); },
      end: function () { endGame(r); },
      left: function () { return r.left; }
    };
    Object.defineProperty(ctx, 'over', { get: function () { return r.over; } });
    Object.defineProperty(ctx, 'score', { get: function () { return r.raw; } });
    r.cleanup = g.start(ctx) || null;
  }
  function stopRun() {
    if (!run) return;
    run.over = true;
    clearInterval(run.tid);
    if (run.cleanup) { try { run.cleanup(); } catch (e) {} }
    run = null;
  }
  function endGame(r) {
    r = r || run;
    if (!r || r.over) return;
    r.over = true;
    clearInterval(r.tid);
    if (r.cleanup) { try { r.cleanup(); } catch (e) {} }
    var final = Math.round(r.raw * MULT[r.diff]);
    var prev = bestFor(r.g.id);
    if (r.raw > 0) {
      var all = getScores();
      all.push({ name: playerName(), id: r.g.id, game: r.g.title, diff: r.diff, score: final, date: Date.now() });
      all.sort(function (a, b) { return b.score - a.score; });
      save(K_SCORES, all.slice(0, 200));
    }
    sfx.end();
    $('#runbar').hidden = true;
    $('#hBest').textContent = bestFor(r.g.id);
    var stage = $('#stage');
    var ov = el('div', 'overlay');
    ov.appendChild(el('h3', null, 'Game Over'));
    ov.appendChild(el('div', 'bigscore', String(final)));
    if (final > prev && final > 0) ov.appendChild(el('div', 'newbest', 'New best!'));
    ov.appendChild(el('p', 'muted', 'Raw score ' + r.raw + ' × ' + MULT[r.diff] + ' (' + cap(r.diff) + ')'));
    var row = el('div', 'row');
    var again = el('button', 'btn', 'Play Again'); again.type = 'button';
    var back = el('button', 'btn ghost small', 'More Games'); back.type = 'button';
    var lb = el('button', 'btn ghost small', 'Leaderboard'); lb.type = 'button';
    again.addEventListener('click', startGame);
    back.addEventListener('click', function () { openCategory(r.g.cat); });
    lb.addEventListener('click', function () { show('leaderboard'); });
    row.appendChild(again); row.appendChild(back); row.appendChild(lb);
    ov.appendChild(row);
    stage.appendChild(ov);
    run = null;
    again.focus();
  }

  /* ---------- leaderboard ---------- */
  function renderBoard() {
    var sel = $('#lbFilter');
    var keep = sel.value || 'all';
    sel.innerHTML = '';
    var o = el('option', null, 'All games'); o.value = 'all'; sel.appendChild(o);
    GAMES.forEach(function (g) { var op = el('option', null, g.title); op.value = g.id; sel.appendChild(op); });
    sel.value = keep;
    drawBoard();
  }
  function drawBoard() {
    var f = $('#lbFilter').value, body = $('#lbBody'); body.innerHTML = '';
    var rows = getScores().filter(function (s) { return f === 'all' || s.id === f; })
      .sort(function (a, b) { return b.score - a.score; }).slice(0, 20);
    if (!rows.length) {
      var tr = el('tr'), td = el('td', 'none', 'No scores yet. Go set one!'); td.colSpan = 6; tr.appendChild(td); body.appendChild(tr); return;
    }
    rows.forEach(function (s, i) {
      var tr = el('tr', i < 3 ? 'r' + (i + 1) : '');
      tr.appendChild(el('td', null, String(i + 1)));
      tr.appendChild(el('td', null, s.name));
      tr.appendChild(el('td', null, s.game));
      tr.appendChild(el('td', null, cap(s.diff)));
      tr.appendChild(el('td', 'score', String(s.score)));
      tr.appendChild(el('td', null, new Date(s.date).toLocaleDateString()));
      body.appendChild(tr);
    });
  }

  /* ---------- wire up ---------- */
  $$('[data-go]').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.go); }); });
  $('.logo').addEventListener('click', function (e) { e.preventDefault(); show('home'); });
  $('#gameBack').addEventListener('click', function () { openCategory(cur.cat); });
  $$('#diffSeg button').forEach(function (b) { b.addEventListener('click', function () { setDiff(b.dataset.d); }); });
  $('#startBtn').addEventListener('click', startGame);
  $('#endBtn').addEventListener('click', function () { endGame(run); });
  $('#lbFilter').addEventListener('change', drawBoard);
  $('#lbClear').addEventListener('click', function () {
    if (confirm('Clear all saved scores in this browser?')) { save(K_SCORES, []); drawBoard(); }
  });

  var sb = $('#soundBtn');
  function paintSound() { sb.textContent = 'Sound: ' + (state.sound ? 'On' : 'Off'); sb.setAttribute('aria-pressed', state.sound ? 'true' : 'false'); }
  sb.addEventListener('click', function () { state.sound = !state.sound; save(K_SOUND, state.sound); paintSound(); sfx.tick(); });
  paintSound();

  var nameBox = $('#playerName');
  nameBox.value = load(K_NAME, '');
  nameBox.addEventListener('input', function () { save(K_NAME, nameBox.value.trim()); });

  show('home');
})();
