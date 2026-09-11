(function () {
  const FRONT_COLS = 5;
  const GUIDE_KEY = "snakeEat.guideSeen";
  const ART = "./art/";

  const EGG_ART = {
    orange: "egg-orange.webp",
    green: "egg-green.webp",
    leaf: "egg-green.webp",
    leaf2: "egg-lime.webp",
    lime: "egg-lime.webp",
    sky: "egg-cyan.webp",
    blue: "egg-blue.webp",
    cyan: "egg-cyan.webp",
    ground: "egg-brown.webp",
    spot: "egg-brown.webp",
    mane: "egg-brown.webp",
    brown: "egg-brown.webp",
    cheek: "egg-pink.webp",
    pink: "egg-pink.webp",
    eye: "egg-red.webp",
    red: "egg-red.webp",
  };

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

  function eggUrl(color) {
    return ART + (EGG_ART[color] || "snake-egg.webp");
  }

  function headUrl(color) {
    return ART + (color === "orange" ? "snake-head-orange.webp" : "snake-head.webp");
  }

  function bodyUrl(color) {
    return ART + (color === "orange" ? "snake-body-orange.webp" : "snake-body.webp");
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
        s.style.backgroundImage = "url(" + headUrl(p.color) + ")";
        s.style.backgroundSize = "contain";
        s.style.backgroundRepeat = "no-repeat";
        s.style.backgroundPosition = "center";
        s.style.backgroundColor = hex(state.level.palette, p.color);
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
    const res = await fetch("levels/giraffe.json");
    const def = await res.json();
    loadLevel(def);
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
