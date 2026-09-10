(function () {
  const FRONT_COLS = 5;
  const state = {
    level: null,
    grid: [], // [r][c] color or null if eaten
    eggs: [], // columns of eggs, front = index 0
    pillars: [], // {color,count} | null
    pillarCap: 5,
    remaining: 0,
    speed: 1,
    busy: false,
    active: null, // {color,count,r,c,path:[]}
    msg: "",
  };

  const el = {
    board: null,
    pillars: null,
    hole: null,
    eggs: null,
    remain: null,
    title: null,
    tip: null,
  };

  function hex(pal, id) {
    return (pal && pal[id]) || "#888";
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

  function loadLevel(def) {
    state.level = def;
    state.grid = def.cells.map((row) => row.slice());
    state.pillarCap = def.pillarCap || 5;
    state.pillars = Array.from({ length: state.pillarCap }, () => null);
    // pack eggs into FRONT_COLS columns (front = depth 0)
    const cols = Array.from({ length: FRONT_COLS }, () => []);
    (def.eggs || []).forEach((e, i) => {
      cols[i % FRONT_COLS].push({ color: e.color, count: e.count });
    });
    state.eggs = cols;
    state.remaining = countFilled(state.grid);
    state.busy = false;
    state.active = null;
    state.msg = "";
    state.speed = 1;
    renderAll();
  }

  function neighbors(r, c, h, w) {
    const out = [];
    if (r + 1 < h) out.push([r + 1, c]);
    if (r - 1 >= 0) out.push([r - 1, c]);
    if (c + 1 < w) out.push([r, c + 1]);
    if (c - 1 >= 0) out.push([r, c - 1]);
    return out;
  }

  /** Reachable same-color cells for a snake at (r,c) or entering from bottom (r===-1). */
  function findNextEat(color, r, c) {
    const h = state.grid.length;
    const w = state.grid[0].length;
    const cand = [];
    if (r < 0) {
      for (let col = 0; col < w; col++) {
        if (state.grid[0][col] === color) cand.push([0, col]);
      }
    } else {
      neighbors(r, c, h, w).forEach(([nr, nc]) => {
        if (state.grid[nr][nc] === color) cand.push([nr, nc]);
      });
    }
    // prefer lower then lefter (stable)
    cand.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return cand[0] || null;
  }

  function wait(ms) {
    return new Promise((res) => setTimeout(res, ms / state.speed));
  }

  async function hatchFrom(col) {
    if (state.busy) return;
    const stack = state.eggs[col];
    if (!stack || !stack.length) return;
    const egg = stack[0];
    // pillars full and we might need one — still try eat first
    state.busy = true;
    stack.shift();
    const snake = { color: egg.color, count: egg.count, r: -1, c: -1, path: [] };
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
      snake.path.push([nr, nc]);
      state.remaining = countFilled(state.grid);
      renderAll();
      await wait(120);
    }

    if (snake.count <= 0) {
      state.msg = "钻进黑洞";
      state.active = null;
      renderAll();
      await wait(280);
    } else {
      const slot = state.pillars.findIndex((p) => !p);
      if (slot >= 0) {
        state.pillars[slot] = { color: snake.color, count: snake.count };
        state.msg = "上柱子";
      } else {
        // return egg to front of column
        stack.unshift({ color: snake.color, count: snake.count });
        state.msg = "柱子满了";
      }
      state.active = null;
      renderAll();
      await wait(400);
    }
    state.busy = false;
    state.msg = "";
    renderAll();
  }

  function occupiedPillars() {
    return state.pillars.filter(Boolean).length;
  }

  function renderBoard() {
    const def = state.level;
    const board = el.board;
    board.innerHTML = "";
    board.style.gridTemplateColumns = `repeat(${def.width}, 1fr)`;
    // paint top-first for CSS grid (row height-1 at top)
    for (let r = def.height - 1; r >= 0; r--) {
      for (let c = 0; c < def.width; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        const color = state.grid[r][c];
        if (color) {
          cell.style.background = hex(def.palette, color);
        } else {
          cell.classList.add("empty");
        }
        if (state.active && state.active.r === r && state.active.c === c) {
          cell.classList.add("snake-head");
          cell.textContent = String(state.active.count);
        }
        board.appendChild(cell);
      }
    }
  }

  function renderPillars() {
    el.pillars.innerHTML = "";
    for (let i = 0; i < state.pillarCap; i++) {
      const peg = document.createElement("div");
      peg.className = "peg";
      const p = state.pillars[i];
      if (p) {
        const s = document.createElement("div");
        s.className = "coil";
        s.style.background = hex(state.level.palette, p.color);
        s.textContent = String(p.count);
        peg.appendChild(s);
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
          btn.style.background = hex(state.level.palette, egg.color);
          btn.textContent = String(egg.count);
          if (d === 0) {
            btn.classList.add("front");
            btn.onclick = () => hatchFrom(c);
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
    el.tip.textContent = state.msg || "点最前排蛇蛋";
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
      renderAll();
    };
    document.getElementById("btn-any").onclick = () => {
      if (state.busy) return;
      // promote a buried egg to front of its column
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
      if (state.busy) return;
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
