(function () {
  const FRONT_COLS = 5;
  const GUIDE_KEY = "snakeEat.guideSeen";
  const ART = "./art/";
  const artReady = { egg: null, head: null, body: null };
  const tintCache = Object.create(null);

  const state = {
    level: null,
    grid: [],
    eggs: [],
    pillars: [],
    pillarCap: 5,
    remaining: 0,
    speed: 1,
    busy: false,
    active: null,
    msg: "",
    blocked: false,
    savedDef: null,
    guideStep: -1,
  };

  const el = {};

  function hex(pal, id) {
    return (pal && pal[id]) || "#888";
  }

  function parseHex(h) {
    const s = (h || "#888888").replace("#", "");
    const full = s.length === 3 ? s[0]+s[0]+s[1]+s[1]+s[2]+s[2] : s;
    return [
      parseInt(full.slice(0, 2), 16) || 0,
      parseInt(full.slice(2, 4), 16) || 0,
      parseInt(full.slice(4, 6), 16) || 0,
    ];
  }

  function loadImg(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function ensureArt() {
    if (!artReady.egg) {
      const [egg, head, body] = await Promise.all([
        loadImg(ART + "snake-egg.webp"),
        loadImg(ART + "snake-head.webp"),
        loadImg(ART + "snake-body.webp"),
      ]);
      artReady.egg = egg;
      artReady.head = head;
      artReady.body = body;
    }
  }

  function makeRoundEgg(hexColor) {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const [tr, tg, tb] = parseHex(hexColor);
    const g = ctx.createRadialGradient(
      size * 0.34, size * 0.32, size * 0.06,
      size * 0.5, size * 0.52, size * 0.5
    );
    g.addColorStop(0, "rgb(" + Math.min(255, tr + 70) + "," + Math.min(255, tg + 70) + "," + Math.min(255, tb + 70) + ")");
    g.addColorStop(0.45, "rgb(" + tr + "," + tg + "," + tb + ")");
    g.addColorStop(1, "rgb(" + ((tr * 0.5) | 0) + "," + ((tg * 0.5) | 0) + "," + ((tb * 0.5) | 0) + ")");
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    // soft rim
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 3;
    ctx.stroke();
    // light specular
    ctx.beginPath();
    ctx.ellipse(size * 0.38, size * 0.34, size * 0.16, size * 0.1, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fill();
    return canvas.toDataURL("image/png");
  }

  function colorizeSprite(img, hexColor, round) {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (round) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
    }
    ctx.drawImage(img, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size);
    const d = imageData.data;
    const [tr, tg, tb] = parseHex(hexColor);
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a < 8) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      // keep eyes / near-white / near-black untoned
      if (max - min < 28 && (lum > 0.82 || lum < 0.18)) continue;
      const shade = 0.35 + lum * 0.9;
      d[i] = Math.min(255, (tr * shade) | 0);
      d[i + 1] = Math.min(255, (tg * shade) | 0);
      d[i + 2] = Math.min(255, (tb * shade) | 0);
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  }

  function tinted(kind, colorId) {
    const pal = state.level && state.level.palette;
    const hexColor = hex(pal, colorId);
    const key = kind + ":" + colorId + ":" + hexColor;
    if (tintCache[key]) return tintCache[key];
    if (kind === "egg") {
      tintCache[key] = makeRoundEgg(hexColor);
      return tintCache[key];
    }
    const img = kind === "head" ? artReady.head : artReady.body;
    if (!img) return ART + (kind === "head" ? "snake-head.webp" : "snake-body.webp");
    tintCache[key] = colorizeSprite(img, hexColor, true);
    return tintCache[key];
  }

  function eggUrl(color) {
    return tinted("egg", color);
  }

  function headUrl(color) {
    return tinted("head", color);
  }

  function bodyUrl(color) {
    return tinted("body", color);
  }

  function countFilled(grid) {
    let n = 0;
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (grid[r][c]) n++;
      }
    }
    return n;
  }

  function hasRivers() {
    return state.level && state.level.rivers === "leftRight";
  }

  function isRiver(c) {
    if (!hasRivers()) return false;
    const w = state.grid[0].length;
    return c === 0 || c === w - 1;
  }

  function packEggs(list) {
    const cols = Array.from({ length: FRONT_COLS }, () => []);
    (list || []).forEach((e, i) => {
      cols[i % FRONT_COLS].push({ color: e.color, count: e.count });
    });
    return cols;
  }

  function loadLevel(def) {
    state.savedDef = def;
    state.level = def;
    state.grid = def.cells.map((row) => row.slice());
    state.pillarCap = def.pillarCap || 5;
    state.pillars = Array.from({ length: state.pillarCap }, () => null);
    state.eggs = packEggs(def.eggs);
    state.remaining = countFilled(state.grid);
    state.busy = false;
    state.active = null;
    state.msg = "";
    state.speed = 1;
    state.blocked = false;
    hideBlock();
    renderAll();
    maybeStartGuide();
  }

  function neighbors(r, c, h, w) {
    const out = [];
    if (r + 1 < h) out.push([r + 1, c]);
    if (r - 1 >= 0) out.push([r - 1, c]);
    if (c + 1 < w) out.push([r, c + 1]);
    if (c - 1 >= 0) out.push([r, c - 1]);
    return out.filter(([nr, nc]) => !isRiver(nc));
  }

  function findNextEat(color, r, c) {
    const h = state.grid.length;
    const w = state.grid[0].length;
    const cand = [];
    if (r < 0) {
      for (let col = 0; col < w; col++) {
        if (isRiver(col)) continue;
        if (state.grid[0][col] === color) cand.push([0, col]);
      }
    } else {
      neighbors(r, c, h, w).forEach(([nr, nc]) => {
        if (state.grid[nr][nc] === color) cand.push([nr, nc]);
      });
    }
    cand.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return cand[0] || null;
  }

  function wait(ms) {
    return new Promise((res) => setTimeout(res, ms / state.speed));
  }

  function occupiedPillars() {
    return state.pillars.filter(Boolean).length;
  }

  function showBlock(text) {
    state.blocked = true;
    document.getElementById("block-msg").textContent = text;
    document.getElementById("block").classList.remove("hidden");
  }

  function hideBlock() {
    state.blocked = false;
    const box = document.getElementById("block");
    if (box) box.classList.add("hidden");
  }

  const GUIDE = [
    {
      title: "点最前排蛇蛋",
      body: "带黄框的是前排蛋。点一下破出短蛇，从图案底边进去吃同色块。",
    },
    {
      title: "连续吃同色",
      body: "蛇只能吃碰得到的同色格，吃一格数字减 1、身子变长。左右是河，只能从下面进。",
    },
    {
      title: "上柱还能再点",
      body: "吃不到就盘在中间柱子上。点柱上的蛇可以再出来继续吃；数字到 0 会钻进右边黑洞。",
    },
  ];

  function maybeStartGuide() {
    try {
      if (localStorage.getItem(GUIDE_KEY) === "1") {
        state.guideStep = -1;
        document.getElementById("guide").classList.add("hidden");
        return;
      }
    } catch (e) {}
    state.guideStep = 0;
    showGuide();
  }

  function showGuide() {
    const g = document.getElementById("guide");
    if (state.guideStep < 0 || state.guideStep >= GUIDE.length) {
      g.classList.add("hidden");
      return;
    }
    const step = GUIDE[state.guideStep];
    document.getElementById("guide-step").textContent = state.guideStep + 1 + "/" + GUIDE.length;
    document.getElementById("guide-title").textContent = step.title;
    document.getElementById("guide-body").textContent = step.body;
    document.getElementById("guide-next").textContent =
      state.guideStep === GUIDE.length - 1 ? "开始" : "下一步";
    g.classList.remove("hidden");
  }

  function closeGuide(persist) {
    state.guideStep = -1;
    document.getElementById("guide").classList.add("hidden");
    if (persist) {
      try {
        localStorage.setItem(GUIDE_KEY, "1");
      } catch (e) {}
    }
  }

  async function runSnake(snake) {
    state.active = snake;
    state.msg = "";
    renderAll();

    while (snake.count > 0) {
      const next = findNextEat(snake.color, snake.r, snake.c);
      if (!next) break;
      const [nr, nc] = next;
      state.grid[nr][nc] = null;
      snake.r = nr;
      snake.c = nc;
      snake.count -= 1;
      snake.body.push([nr, nc]);
      state.remaining = countFilled(state.grid);
      renderAll();
      await wait(110);
    }

    if (snake.count <= 0) {
      snake.exiting = true;
      state.msg = "走向黑洞…";
      renderAll();
      await wait(220);
      for (let i = 0; i < 4; i++) {
        snake.c = Math.min(state.grid[0].length - 1, (snake.c < 0 ? 0 : snake.c) + 1);
        snake.body.push([snake.r < 0 ? 0 : snake.r, snake.c]);
        renderAll();
        await wait(90);
      }
      state.msg = "";
      state.active = null;
      renderAll();
      await wait(160);
      return "hole";
    }

    const slot = state.pillars.findIndex((p) => !p);
    if (slot >= 0) {
      state.pillars[slot] = { color: snake.color, count: snake.count };
      state.msg = "上柱子（点柱可再出）";
      state.active = null;
      renderAll();
      await wait(280);
      return "pillar";
    }

    state.active = null;
    state.msg = "柱子满了";
    renderAll();
    showBlock("柱子满了。可以加柱或重开本关。");
    state.eggs[0].unshift({ color: snake.color, count: snake.count });
    renderAll();
    return "full";
  }

  async function hatchFrom(col) {
    if (state.busy || state.blocked || state.guideStep >= 0) return;
    const stack = state.eggs[col];
    if (!stack || !stack.length) return;
    const egg = stack[0];
    state.busy = true;
    stack.shift();
    const snake = { color: egg.color, count: egg.count, r: -1, c: -1, body: [] };
    await runSnake(snake);
    state.busy = false;
    if (!state.blocked) {
      state.msg = "";
      renderAll();
    }
  }

  async function resumePillar(i) {
    if (state.busy || state.blocked || state.guideStep >= 0) return;
    const p = state.pillars[i];
    if (!p) return;
    state.busy = true;
    state.pillars[i] = null;
    const snake = { color: p.color, count: p.count, r: -1, c: -1, body: [] };
    state.msg = "再出吃";
    await runSnake(snake);
    state.busy = false;
    if (!state.blocked) {
      state.msg = "";
      renderAll();
    }
  }

  function renderBoard() {
    const def = state.level;
    const board = el.board;
    board.innerHTML = "";
    board.style.gridTemplateColumns = `repeat(${def.width}, 1fr)`;
    const bodySet = {};
    if (state.active && state.active.body) {
      state.active.body.forEach((rc, idx) => {
        bodySet[rc[0] + "," + rc[1]] = idx;
      });
    }
    for (let r = def.height - 1; r >= 0; r--) {
      for (let c = 0; c < def.width; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        if (isRiver(c)) {
          cell.classList.add("river");
        } else {
          const color = state.grid[r][c];
          if (color) {
            cell.style.background = hex(def.palette, color);
          } else {
            cell.classList.add("empty");
          }
        }
        const bi = bodySet[r + "," + c];
        if (bi != null && state.active) {
          const isHead = bi === state.active.body.length - 1;
          cell.classList.add(isHead ? "snake-head" : "snake-body");
          const col = hex(def.palette, state.active.color);
          cell.style.backgroundColor = col;
          cell.style.backgroundImage =
            "url(" + (isHead ? headUrl(state.active.color) : bodyUrl(state.active.color)) + ")";
          if (isHead) cell.textContent = String(state.active.count);
        }
        board.appendChild(cell);
      }
    }
  }

  function renderPillars() {
    el.pillars.innerHTML = "";
    for (let i = 0; i < state.pillarCap; i++) {
      const peg = document.createElement("button");
      peg.type = "button";
      peg.className = "peg";
      const p = state.pillars[i];
      if (p) {
        peg.classList.add("has");
        const s = document.createElement("div");
        s.className = "coil";
        s.style.backgroundColor = hex(state.level.palette, p.color);
        s.style.backgroundImage = "url(" + headUrl(p.color) + ")";
        s.textContent = String(p.count);
        peg.appendChild(s);
        peg.title = "再出吃";
        peg.onclick = () => resumePillar(i);
      } else {
        peg.disabled = true;
      }
      el.pillars.appendChild(peg);
    }
    el.cap.textContent = occupiedPillars() + "/" + state.pillarCap;
  }

  function renderEggs() {
    el.eggs.innerHTML = "";
    const maxD = Math.max(1, ...state.eggs.map((c) => c.length));
    for (let d = 0; d < maxD; d++) {
      const row = document.createElement("div");
      row.className = "egg-row";
      for (let c = 0; c < FRONT_COLS; c++) {
        const egg = state.eggs[c][d];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "egg";
        if (!egg) {
          btn.classList.add("ghost");
          btn.disabled = true;
        } else {
          btn.style.backgroundImage = "url(" + eggUrl(egg.color) + ")";
          btn.textContent = String(egg.count);
          if (d === 0) {
            btn.classList.add("front");
            btn.onclick = () => hatchFrom(c);
            if (state.blocked || state.busy || state.guideStep >= 0) btn.disabled = true;
          } else {
            btn.disabled = true;
            btn.classList.add("buried");
          }
        }
        row.appendChild(btn);
      }
      el.eggs.appendChild(row);
    }
  }

  function renderAll() {
    if (!state.level) return;
    el.title.textContent = state.level.name || state.level.id;
    el.remain.textContent = "剩余 " + state.remaining;
    el.tip.textContent = state.msg || "点最前排蛇蛋；柱上蛇可再点出";
    el.speedLab.textContent = "速度 x" + state.speed;
    renderBoard();
    renderPillars();
    renderEggs();
  }

  function bindTools() {
    document.getElementById("btn-speed").onclick = () => {
      state.speed = state.speed >= 4 ? 1 : state.speed * 2;
      renderAll();
    };
    document.getElementById("btn-cap").onclick = () => {
      if (state.busy) return;
      state.pillarCap += 1;
      state.pillars.push(null);
      state.msg = "柱子 +1";
      if (state.blocked) hideBlock();
      renderAll();
    };
    document.getElementById("btn-any").onclick = () => {
      if (state.busy || state.blocked || state.guideStep >= 0) return;
      for (let c = 0; c < FRONT_COLS; c++) {
        if (state.eggs[c].length > 1) {
          const buried = state.eggs[c].splice(1, 1)[0];
          state.eggs[c].unshift(buried);
          state.msg = "任意指：调到前排";
          renderAll();
          return;
        }
      }
      state.msg = "没有可调的埋蛋";
      renderAll();
    };
    document.getElementById("btn-shuffle").onclick = () => {
      if (state.busy || state.blocked || state.guideStep >= 0) return;
      const flat = [];
      state.eggs.forEach((col) => flat.push(...col));
      for (let i = flat.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = flat[i];
        flat[i] = flat[j];
        flat[j] = t;
      }
      state.eggs = Array.from({ length: FRONT_COLS }, () => []);
      flat.forEach((e, i) => state.eggs[i % FRONT_COLS].push(e));
      state.msg = "已随机排";
      renderAll();
    };
    document.getElementById("btn-restart").onclick = () => {
      if (!state.savedDef) return;
      loadLevel(state.savedDef);
    };
    document.getElementById("btn-add-pillar").onclick = () => {
      state.pillarCap += 1;
      state.pillars.push(null);
      hideBlock();
      state.msg = "已加柱";
      renderAll();
    };
    document.getElementById("guide-skip").onclick = () => closeGuide(true);
    document.getElementById("guide-next").onclick = () => {
      if (state.guideStep >= GUIDE.length - 1) {
        closeGuide(true);
        return;
      }
      state.guideStep += 1;
      showGuide();
    };
  }

  async function boot() {
    el.board = document.getElementById("board");
    el.pillars = document.getElementById("pillars");
    el.cap = document.getElementById("cap");
    el.eggs = document.getElementById("eggs");
    el.remain = document.getElementById("remain");
    el.title = document.getElementById("title");
    el.tip = document.getElementById("tip");
    el.speedLab = document.getElementById("speed-lab");
    bindTools();
    try {
      await ensureArt();
    } catch (e) {
      console.warn("art preload failed", e);
    }
    const res = await fetch("levels/giraffe.json");
    const def = await res.json();
    loadLevel(def);
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
