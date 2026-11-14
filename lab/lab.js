"use strict";
// Deneme odasının arayüzü. Kurallar lab-engine.js'te; bölümler, zorlukları ve en kısa çözüm uzunlukları
// lab-levels.json'dadır (üretici: web/tools/lab-generate.js).
const Lab = SonHamleLab;
const $ = id => document.getElementById(id);
const SAVE = "sonhamle-lab-v1";
const LOST_TEXT = {black:"Kara yıldıza değdin; top yandı.",exit:"Çıkış kapandı: ayrıldığın çıkış karesi kapandı.",sync:"Bir tahta ötekinden önce bitti.",
  chain:"Sonraki odada geçtiğin kare duvar.",designer:"Sıra bitti ama yıldız kaldı."};
const SQUARE_PAD = [[3,"←"],[0,"↑"],[2,"↓"],[1,"→"]];
const HEX_PAD = [[3,"←"],[4,"↖"],[5,"↗"],[2,"↙"],[1,"↘"],[0,"→"]];
const KEYS = {ArrowUp:0,ArrowRight:1,ArrowDown:2,ArrowLeft:3};
const HEX_KEYS = {ArrowRight:0,d:0,c:1,z:2,ArrowLeft:3,a:3,q:4,e:5};
const GAP = 3;
let levels = [], index = 0, level, game, G, placing = false, draft = [], timer = null, resultClosed = false, progress, lastRot = 0;

const bitCount = x => { let n = 0; while (x) { x &= x - 1; n++; } return n; };
const total = list => list.reduce((sum, value) => sum + value, 0);
function loadProgress(){ try { return {completed:[],mastered:[],votes:{},...JSON.parse(localStorage.getItem(SAVE))}; } catch { return {completed:[],mastered:[],votes:{}}; } }
function save(){ try { localStorage.setItem(SAVE, JSON.stringify(progress)); } catch {} }
const isDesigner = () => level.mode === "designer";
const animating = () => timer !== null;

function boardLabel(k){
  if (level.mode === "twin") {
    if (k === 0) return "Üst tahta";
    return {same:"Alt tahta",mirror:"Alt tahta · ayna (sağ↔sol)",reverse:"Alt tahta · ters yön",echo:"Alt tahta · yankı (önceki hamle)"}[level.couple ?? "same"];
  }
  if (level.mode === "chain") return `Oda ${k + 1}` + (k < G.room ? " ✓" : k === G.room ? " · şimdi" : "");
  return "";
}
function lanes(raw){
  const list = [...(raw.wrapRows ?? []).map(r => `satır ${r + 1}`), ...(raw.wrapCols ?? []).map(c => `sütun ${c + 1}`)];
  return list.length ? `Tünel: ${list.join(", ")}` : "";
}

function loadLevel(i){
  clearTimeout(timer); timer = null;
  index = i; level = levels[i]; game = Lab.makeGame(level); G = game.start(); placing = false; draft = []; resultClosed = false; lastRot = 0;
  try { history.replaceState(null, "", `#${level.idea}`); } catch {} // adres doğrudan bu fikri açar
  $("difficulty").hidden = false;
  $("levels-view").hidden = true; $("game-view").hidden = false; $("levels-toggle").hidden = false;
  $("message").textContent = isDesigner() ? "Duvar koymak istediğin karelere dokun, sonra Oynat." : "Gitmek istediğin yöndeki kareye dokun ya da düğmeleri kullan.";
  buildPad();
  render();
}
function restart(keepWalls = false){
  clearTimeout(timer); timer = null;
  G = game.start(); placing = false; resultClosed = false; lastRot = 0;
  if (!keepWalls) draft = [];
  $("message").textContent = "Bölüm yeniden başladı.";
  render();
}
function finished(){
  if (!G.won) return;
  progress.completed = [...new Set([...progress.completed, level.idea])];
  if (!isDesigner() && G.moves === level.minMoves) progress.mastered = [...new Set([...progress.mastered, level.idea])];
  save();
}
function act(action){
  if (!level || animating() || G.won || G.lost) return;
  const result = game.apply(G, action);
  if (!result) { if (action >= Lab.PLACE) $("message").textContent = "Oraya duvar konmaz."; return; }
  G = result.state; placing = false;
  if (G.won) { finished(); $("message").textContent = "Başardın!"; }
  else if (G.lost) $("message").textContent = LOST_TEXT[G.lost];
  else if (!game.hasMove(G)) $("message").textContent = "Çıkmaz! Yeniden başlat ile başka yol dene.";
  else $("message").textContent = action >= Lab.PLACE ? "Duvarı koydun." : "Ayrıldığın kare kapandı.";
  render();
}
function playDesigner(){
  if (animating() || G.won || G.lost || draft.length !== level.designerWalls) return;
  const walls = [...draft].sort((a, b) => a - b), {frames, won} = game.playSequence(walls);
  let step = 0;
  const tick = () => {
    G = {...G, b:[frames[step]], moves:step, step};
    if (step === frames.length - 1) {
      timer = null;
      G = {...G, won, lost:won ? null : "designer", dw:walls};
      if (won) finished();
      $("message").textContent = won ? "Başardın!" : LOST_TEXT.designer;
    } else timer = setTimeout(() => { step++; tick(); }, 420);
    render();
  };
  $("message").textContent = "Sıra oynanıyor…";
  timer = 0; tick();
}

// ---- çizim ----
function renderDifficulty(rating){
  const label = rating.toLocaleString("tr-TR", {maximumFractionDigits:2});
  $("difficulty").setAttribute("aria-label", `Tahmini zorluk: ${label} / 5`);
  $("difficulty-value").textContent = `${label}/5`;
  const row = $("difficulty-stars"); row.replaceChildren();
  for (let i = 0; i < 5; i++) {
    const star = document.createElement("span"); star.className = "difficulty-star";
    const base = document.createElement("span"); base.textContent = "★";
    const fill = document.createElement("span"); fill.className = "difficulty-star-fill"; fill.textContent = "★";
    fill.style.width = `${Math.max(0, Math.min(1, rating - i)) * 100}%`;
    star.append(base, fill); row.append(star);
  }
}
function counters(){
  const parts = [];
  const B = game.boards[0], s = G.b[0];
  if (B.paint) parts.push(`Boyalı: ${bitCount(s.plo) + bitCount(s.phi)}/${B.n}`);
  else parts.push(`Yıldız: ${total(G.b.map(board => bitCount(board.stars)))}`);
  if (isDesigner()) parts.push(`Duvar: ${draft.length}/${level.designerWalls}`);
  else parts.push(`Hamle: ${G.moves}`);
  if (level.pocket) parts.push(`Cepte: ${G.pocket} duvar`);
  if (B.exit >= 0) parts.push(s.stars ? "Çıkış kapalı" : "Çıkış açık");
  return parts.join(" · ");
}
function icon(name, text = ""){ const span = document.createElement("span"); span.className = name; if (text) span.textContent = text; return span; }
function cellElement(k, r, c, size){
  const B = game.boards[k], s = G.b[k], raw = B.raw, id = `${r},${c}`, i = B.index.get(id);
  const cell = document.createElement("button");
  cell.type = "button"; cell.className = "cell"; cell.dataset.board = k; cell.dataset.row = r; cell.dataset.col = c;
  if (i !== undefined) cell.dataset.index = i;
  cell.style.width = cell.style.height = `${size}px`;
  const inside = raw.cells.some(([rr, cc]) => rr === r && cc === c);
  if (!inside) { cell.classList.add("void"); cell.tabIndex = -1; return cell; }
  if (i === undefined) { cell.classList.add("wall"); cell.setAttribute("aria-label", "Duvar"); return cell; }
  if (game.grid === "square") {
    if ((raw.wrapRows ?? []).includes(r)) { if (c === 0) cell.classList.add("wrap-l"); if (c === raw.width - 1) cell.classList.add("wrap-r"); }
    if ((raw.wrapCols ?? []).includes(c)) { if (r === 0) cell.classList.add("wrap-t"); if (r === raw.height - 1) cell.classList.add("wrap-b"); }
  }
  const designerWall = isDesigner() && draft.includes(i);
  if (designerWall || (k === 0 && G.placed.includes(i))) { cell.classList.add("wall", "placed"); cell.setAttribute("aria-label", "Koyduğun duvar"); return cell; }
  if (game.closedAt(s, i)) { cell.classList.add("closed"); cell.textContent = "X"; cell.setAttribute("aria-label", "Kapalı kare"); return cell; }
  const labels = [];
  if (B.red[i]) { const up = game.wallNow(k, s, i); cell.classList.add("red", up ? "up" : "down"); labels.push(up ? "Kırmızı duvar" : "İnmiş kırmızı duvar"); }
  if (B.blue[i]) { const up = game.wallNow(k, s, i); cell.classList.add("blue", up ? "up" : "down"); labels.push(up ? "Mavi duvar" : "İnmiş mavi duvar"); }
  if (B.paint && game.paintedAt(s, i)) { cell.classList.add("painted"); labels.push("Boyalı"); }
  const ballOn = (s.p === i || s.q === i) && (level.mode !== "chain" || k === G.room);
  if (B.permanent[i]) { cell.classList.add("permanent"); if (!ballOn) cell.append(icon("permanent-icon", "∞")); labels.push("Kalıcı kare"); }
  const ballHere = (s.p === i || s.q === i) && (level.mode !== "chain" || k === G.room);
  if (B.exit === i) { cell.classList.add("exit", s.stars ? "shut" : "open"); if (!ballHere) cell.append(icon("exit-icon")); labels.push(s.stars ? "Çıkış (kapalı)" : "Çıkış (açık)"); }
  if (B.sw[i]) { cell.classList.add("switch"); if (!ballHere) cell.append(icon(`switch-icon${s.tog ? " on" : ""}`)); labels.push("Şalter"); }
  if (B.mirror[i]) { cell.classList.add("mirror"); cell.append(icon(`mirror-icon ${B.mirror[i] === 1 ? "slash" : "backslash"}`)); labels.push("Ayna"); }
  if (B.crack[i]) { cell.classList.add("crack"); if (!ballHere) cell.append(icon("crack-icon")); labels.push("Çatlak kare"); }
  if (B.black[i]) { cell.classList.add("black"); if (!ballHere) cell.append(icon("black-star")); labels.push("Kara yıldız"); }
  if (B.rotator[i]) { cell.classList.add("rotator"); if (!ballHere) cell.append(icon("rotator-icon", "↻")); labels.push("Döndürme karesi"); }
  if (s.stones.includes(i)) { cell.append(icon("stone")); labels.push("Taş"); }
  if (B.starBit[i] & s.stars) { cell.append(icon("star")); labels.push("Yıldız"); }
  if (ballHere) {
    const second = s.q === i;
    cell.append(icon(`player${second ? " second" : ""}${G.lost === "black" ? " burned" : ""}`));
    labels.push(second ? "İkinci top" : "Top");
  }
  cell.setAttribute("aria-label", labels.join(", ") || `Satır ${r + 1}, sütun ${c + 1}`);
  return cell;
}
function drawBoards(){
  const wrap = $("boards"); wrap.replaceChildren();
  const width = Math.min(wrap.clientWidth || 360, 520);
  const many = game.boards.length > 1, labelSpace = many ? 26 : 0;
  const height = Math.max(240, window.innerHeight * (many ? 0.6 : 0.5)) - labelSpace * game.boards.length;
  game.boards.forEach((B, k) => {
    const raw = B.raw, holder = document.createElement("div"); holder.className = "board-wrap";
    if (level.mode === "chain") holder.classList.add(k < G.room ? "done" : k > G.room ? "later" : "now");
    const label = boardLabel(k) || lanes(raw);
    if (label) { const p = document.createElement("p"); p.className = "board-label"; p.textContent = label; holder.append(p); }
    const el = document.createElement("div"); el.className = `lab-board ${game.grid}`; el.dataset.board = k;
    if (game.grid === "hex") {
      const radius = (raw.width - 1) / 2, unitW = Math.sqrt(3) * (2 * radius + 1), unitH = 3 * radius + 2;
      const unit = Math.min(width / unitW, height / unitH), w = Math.sqrt(3) * unit, h = 2 * unit;
      el.style.width = `${unitW * unit}px`; el.style.height = `${unitH * unit}px`;
      for (const [r, c] of raw.cells) {
        const q = c - radius, rr = r - radius, cell = cellElement(k, r, c, 0);
        cell.style.width = `${w - GAP}px`; cell.style.height = `${h - GAP}px`;
        cell.style.left = `${(Math.sqrt(3) * (q + rr / 2) + Math.sqrt(3) * radius + Math.sqrt(3) / 2) * unit - (w - GAP) / 2}px`;
        cell.style.top = `${(1.5 * rr + 1.5 * radius + 1) * unit - (h - GAP) / 2}px`;
        el.append(cell);
      }
    } else {
      const rows = many && level.mode !== "classic" ? total(game.boards.map(b => b.raw.height)) : raw.height;
      const cols = Math.max(...game.boards.map(b => b.raw.width));
      const size = Math.floor(Math.min((width - GAP * (cols - 1)) / cols, (height - GAP * rows) / rows));
      el.style.gridTemplateColumns = `repeat(${raw.width},${size}px)`;
      for (let r = 0; r < raw.height; r++) for (let c = 0; c < raw.width; c++) el.append(cellElement(k, r, c, size));
      const rot = G.b[k].rot; // dönen tahta: ekranda döndürülür; döndüğü hamlede kısa bir dönme hareketiyle
      if (rot !== lastRot) {
        el.style.setProperty("--from", `${lastRot * 90}deg`); el.style.setProperty("--to", `${(rot < lastRot ? rot + 4 : rot) * 90}deg`);
        el.classList.add("turning"); lastRot = rot;
      }
      if (rot) el.style.transform = `rotate(${rot * 90}deg)`;
    }
    holder.append(el); wrap.append(holder);
  });
}
function buildPad(){
  const pad = $("pad"); pad.replaceChildren(); pad.className = `pad ${game.grid}`;
  pad.hidden = isDesigner();
  for (const [dir, text] of game.grid === "hex" ? HEX_PAD : SQUARE_PAD) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.dataset.dir = dir;
    button.setAttribute("aria-label", game.grid === "hex" ? Lab.HEX_NAMES[dir] : Lab.SQUARE_NAMES[dir]);
    pad.append(button);
  }
}
function renderSequence(){
  const box = $("sequence"); box.hidden = !isDesigner(); box.replaceChildren();
  if (!isDesigner()) return;
  const arrows = {Up:"↑",Right:"→",Down:"↓",Left:"←"};
  const title = document.createElement("span"); title.className = "sequence-title"; title.textContent = "Sıra:"; box.append(title);
  level.sequence.forEach((name, i) => {
    const chip = document.createElement("span"); chip.className = "sequence-step"; chip.textContent = arrows[name];
    if (G.step !== undefined && i < G.step) chip.classList.add("done");
    if (G.step !== undefined && i === G.step - 1) chip.classList.add("current");
    box.append(chip);
  });
}
function render(){
  $("level-title").textContent = level.title;
  renderDifficulty(level.rating);
  $("rule").textContent = level.rule;
  $("counters").textContent = counters();
  drawBoards();
  renderSequence();
  const pocket = $("pocket");
  pocket.hidden = !level.pocket;
  pocket.textContent = placing ? "Vazgeç" : `Duvar Koy (${G.pocket})`;
  pocket.disabled = !placing && (G.pocket <= 0 || G.won || Boolean(G.lost));
  pocket.classList.toggle("active", placing);
  const play = $("play");
  play.hidden = !isDesigner();
  play.disabled = animating() || G.won || Boolean(G.lost) || draft.length !== level.designerWalls;
  $("next").hidden = !G.won || index === levels.length - 1;
  const vote = progress.votes[level.idea];
  $("vote-up").setAttribute("aria-pressed", String(vote === "up")); $("vote-down").setAttribute("aria-pressed", String(vote === "down"));
  renderResult();
}
function renderResult(){
  const stuck = !G.won && !G.lost && !isDesigner() && !game.hasMove(G), box = $("result");
  box.hidden = resultClosed || animating() || !(G.won || G.lost || stuck);
  if (box.hidden) return;
  box.className = G.won ? "result won" : "result lost";
  $("result-title").textContent = G.won ? "Başardın!" : "Kaybettin!";
  let text;
  if (G.won && isDesigner()) text = "Duvarlar doğru yerde: sıra bütün yıldızları topladı.";
  else if (G.won) text = `${G.moves} hamlede bitirdin. En kısa çözüm ${level.minMoves} hamle.` + (G.moves === level.minMoves ? " Ustalık ★" : "");
  else text = G.lost ? LOST_TEXT[G.lost] : "Çıkmaza girdin: hamle kalmadı.";
  $("result-text").textContent = text;
  $("result-action").textContent = !G.won ? (isDesigner() ? "Yeniden Dene" : "Yeniden Başla") : index === levels.length - 1 ? "Fikirler" : "Sonraki Fikir";
}
function resultAction(){
  if (!G.won) restart(isDesigner());
  else if (index < levels.length - 1) loadLevel(index + 1);
  else showList();
}
function closeResult(){ resultClosed = true; $("result").hidden = true; }

function showList(){
  clearTimeout(timer); timer = null;
  const list = $("idea-list"); list.replaceChildren();
  levels.forEach((l, i) => {
    const card = document.createElement("button"); card.type = "button"; card.className = "idea-card";
    if (progress.completed.includes(l.idea)) card.classList.add("complete");
    const number = icon("idea-number", String(i + 1)), title = icon("idea-title", l.title);
    const vote = progress.votes[l.idea] === "up" ? " 👍" : progress.votes[l.idea] === "down" ? " 👎" : "";
    const marks = icon("idea-marks", (progress.completed.includes(l.idea) ? "✓" : "") + (progress.mastered.includes(l.idea) ? " ★" : "") + vote);
    card.append(number, title, marks);
    card.addEventListener("click", () => loadLevel(i));
    list.append(card);
  });
  const named = kind => levels.filter(l => progress.votes[l.idea] === kind).map(l => l.title);
  const up = named("up"), down = named("down");
  $("votes").hidden = !up.length && !down.length;
  $("votes-text").textContent = [up.length ? `Beğendiklerim: ${up.join(", ")}.` : "", down.length ? `Beğenmediklerim: ${down.join(", ")}.` : ""].filter(Boolean).join("\n");
  $("level-title").textContent = "Deneme Odası"; $("counters").textContent = `${levels.length} fikir · ${progress.completed.length} tamamlandı`;
  $("difficulty").hidden = true;
  $("game-view").hidden = true; $("levels-view").hidden = false; $("levels-toggle").hidden = true;
  try { history.replaceState(null, "", location.pathname + location.search); } catch {}
  closeResult();
}

// ---- giriş ----
function directionTo(cell){
  const k = Number(cell.dataset.board), holder = $("boards").children[k];
  const balls = [...holder.querySelectorAll(".player")];
  if (!balls.length) return null;
  const center = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const [x, y] = center(cell);
  const ball = balls.map(b => [b, Math.hypot(center(b)[0] - x, center(b)[1] - y)]).sort((a, b) => a[1] - b[1])[0][0];
  const [bx, by] = center(ball), dx = x - bx, dy = y - by;
  if (Math.hypot(dx, dy) < 4) return null;
  if (game.grid === "hex") { let angle = Math.atan2(dy, dx) * 180 / Math.PI; if (angle < 0) angle += 360; return Math.round(angle / 60) % 6; }
  return Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? 0 : 2) : (dx < 0 ? 3 : 1);
}
$("boards").addEventListener("click", e => {
  const cell = e.target.closest(".cell"); if (!cell || cell.classList.contains("void") || !level) return;
  const k = Number(cell.dataset.board), i = cell.dataset.index === undefined ? null : Number(cell.dataset.index);
  if (isDesigner()) {
    if (animating() || G.won || G.lost || i === null) return;
    if (draft.includes(i)) draft = draft.filter(x => x !== i);
    else if (draft.length < level.designerWalls && game.actions({...game.start(), dw:[]}).includes(Lab.PLACE + i)) draft = [...draft, i];
    else { $("message").textContent = draft.length >= level.designerWalls ? "İki duvarın da yerinde; birini kaldırmak için üstüne dokun." : "Oraya duvar konmaz."; return; }
    $("message").textContent = draft.length === level.designerWalls ? "Duvarlar hazır: Oynat'a bas." : "Bir duvar daha koy.";
    return render();
  }
  if (placing) { if (i !== null && k === 0) act(Lab.PLACE + i); return; }
  if (level.mode === "chain" && k !== G.room) return;
  let dir = directionTo(cell); if (dir === null) return;
  if (level.mode === "twin" && k === 1) {
    if (level.couple === "echo") { $("message").textContent = "Alt tahta kendi oynar; üst tahtaya ya da düğmelere dokun."; return; }
    if (level.couple === "mirror") dir = dir === 1 ? 3 : dir === 3 ? 1 : dir;
    if (level.couple === "reverse") dir = (dir + 2) % 4;
  }
  act(dir);
});
$("pad").addEventListener("click", e => { const button = e.target.closest("button"); if (button) act(Number(button.dataset.dir)); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !$("result").hidden) return closeResult();
  if (!level || $("game-view").hidden || isDesigner()) return;
  const dir = (game.grid === "hex" ? HEX_KEYS : KEYS)[e.key];
  if (dir !== undefined) { e.preventDefault(); act(dir); }
});
$("pocket").addEventListener("click", () => {
  placing = !placing;
  $("message").textContent = placing ? "Duvar koymak istediğin boş kareye dokun." : "Vazgeçtin; duvar hâlâ cebinde.";
  render();
});
$("play").addEventListener("click", playDesigner);
function vote(kind){
  progress.votes = {...progress.votes};
  if (progress.votes[level.idea] === kind) delete progress.votes[level.idea]; else progress.votes[level.idea] = kind;
  save(); render();
}
$("vote-up").addEventListener("click", () => vote("up"));
$("vote-down").addEventListener("click", () => vote("down"));
$("votes-copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("votes-text").textContent); $("votes-copy").textContent = "Kopyalandı"; }
  catch { $("votes-copy").textContent = "Kopyalanamadı: yazıyı elle seç"; }
});
$("restart").addEventListener("click", () => restart(false));
$("next").addEventListener("click", () => { if (index < levels.length - 1) loadLevel(index + 1); });
$("levels-toggle").addEventListener("click", showList);
$("result-card").addEventListener("click", resultAction);
$("result").addEventListener("click", e => { if (e.target === e.currentTarget) closeResult(); });
window.addEventListener("hashchange", () => { // adresteki #fikir değişince o bölüm açılır
  const at = levels.findIndex(l => l.idea === location.hash.slice(1));
  if (at >= 0 && (at !== index || $("game-view").hidden)) loadLevel(at);
});
let resizeTimer;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (level && !$("game-view").hidden) drawBoards(); }, 120); });

fetch("lab-levels.json", {cache:"no-cache"}).then(r => { if (!r.ok) throw Error(`HTTP ${r.status}`); return r.json(); }).then(data => {
  levels = data; progress = loadProgress();
  const wanted = location.hash.slice(1) || new URLSearchParams(location.search).get("fikir"), at = levels.findIndex(l => l.idea === wanted);
  if (at >= 0) { $("difficulty").hidden = false; loadLevel(at); } else showList();
}).catch(error => { $("counters").textContent = `Bölümler yüklenemedi: ${error.message}`; });
