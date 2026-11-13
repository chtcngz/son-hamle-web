"use strict";
const dirs = {Up:[-1,0],Right:[0,1],Down:[1,0],Left:[0,-1]};
const saveKey = "sonhamle-html-v3"; // v3: levels 6-40 replaced, old completion marks no longer apply
const $ = id => document.getElementById(id);
const key = (r,c) => `${r},${c}`;
let levels = [], level, number = 1, state, progress;
const initialProgress = () => ({unlocked:1,current:1,completed:[]});
const pointKey = p => key(p.row,p.column);

function normalizeLevel(l){
  const portals=l.portals??[];
  return {...l,activeSet:new Set(l.activeCells.map(pointKey)),wallSet:new Set(l.walls.map(pointKey)),
    gateSet:new Set((l.gates??[]).map(pointKey)),keys:(l.keys??[]).map(pointKey),
    portalMap:portals.length===2?new Map([[pointKey(portals[0]),pointKey(portals[1])],[pointKey(portals[1]),pointKey(portals[0])]]):new Map(),
    stars:l.stars.map(pointKey),starOrder:(l.starOrder??[]).map(pointKey),start:[l.start.row,l.start.column]};
}
function initialState(){return {position:[...level.start],closed:new Set(),stars:new Set(level.stars),keys:new Set(level.keys),orderIndex:0,moves:0};}
function copyState(s){return {position:[...s.position],closed:new Set(s.closed),stars:new Set(s.stars),keys:new Set(s.keys),orderIndex:s.orderIndex,moves:s.moves};}
function save(){localStorage.setItem(saveKey,JSON.stringify(progress));}
function loadLevel(n){
  number=n;level=levels[n-1];state=initialState();progress.current=n;save();
  $("levels-view").hidden=true;$("game-view").hidden=false;$("levels-toggle").hidden=false;
  $("message").textContent="Bir hücreye tıkla; nokta o yönde son açık kareye kayar.";
  render();
}
function active(r,c){return r>=0&&r<level.height&&c>=0&&c<level.width&&level.activeSet.has(key(r,c));}
function openGate(s){return level.keys.length>0&&s.keys.size<level.keys.length;}
function visit(s,id){
  s.keys.delete(id);
  if(s.stars.has(id)&&(!level.starOrder.length||level.starOrder[s.orderIndex]===id)){
    s.stars.delete(id);
    if(level.starOrder.length)s.orderIndex++;
  }
}
function slide(s,dir){
  if(s.stars.size===0)return null;
  const [dr,dc]=dirs[dir];let [r,c]=s.position;
  const after=copyState(s);after.closed.add(key(r,c));
  let moved=false;
  while(active(r+dr,c+dc)){
    const next=key(r+dr,c+dc);
    if(level.wallSet.has(next)||after.closed.has(next)||(level.gateSet.has(next)&&!openGate(after)))break;
    const exit=level.portalMap.get(next);
    if(exit&&(after.closed.has(exit)||level.wallSet.has(exit)||(level.gateSet.has(exit)&&!openGate(after))))break;
    r+=dr;c+=dc;moved=true;visit(after,next);
    if(exit){
      visit(after,exit);
      [r,c]=exit.split(",").map(Number);
      break;
    }
  }
  if(!moved)return null;
  after.position=[r,c];after.moves++;
  return after;
}
function hasMove(s){return Object.keys(dirs).some(dir=>slide(s,dir)!==null);}
function move(dir){
  if(!level||state.stars.size===0)return;
  const after=slide(state,dir);if(!after)return;
  state=after;
  if(state.stars.size===0){
    progress.completed=Array.from(new Set([...progress.completed,number]));progress.unlocked=Math.max(progress.unlocked,Math.min(levels.length,number+1));save();
    $("message").textContent=number===levels.length?"Seri tamamlandı!":"Harika! Bütün yıldızlar toplandı.";
  }else if(!hasMove(state))$("message").textContent="Çıkmaz! Yeniden Başlat ile başka yol dene.";
  else $("message").textContent="Ayrıldığın tek kare kapandı. Sonraki kararı düşün.";
  render();
}
function render(){
  $("level-title").textContent=`Bölüm ${number}`;
  $("counters").textContent=`Yıldız: ${state.stars.size} · Hamle: ${state.moves}`+(level.starOrder.length?` · Sıra: ${Math.min(state.orderIndex+1,level.starOrder.length)}/${level.starOrder.length}`:"");
  const hint=$("rule-hint");
  if(hint){
    hint.hidden=number<=40;
    hint.textContent=level.keys.length?"Anahtarı al: kapı açılır.":level.portalMap.size?"Portala gir: eşinden çıkarsın ve hamle biter.":level.starOrder.length?"Yıldızları numara sırasıyla topla.":"";
  }
  const board=$("board");board.style.gridTemplateColumns=`repeat(${level.width},1fr)`;board.style.gridTemplateRows=`repeat(${level.height},1fr)`;
  board.replaceChildren();
  for(let r=0;r<level.height;r++)for(let c=0;c<level.width;c++){
    const cell=document.createElement("button");cell.type="button";cell.dataset.row=r;cell.dataset.col=c;
    cell.className="cell";cell.setAttribute("aria-label",`Satır ${r+1}, sütun ${c+1}`);
    const id=key(r,c);
    if(!level.activeSet.has(id)){cell.classList.add("void");cell.tabIndex=-1;}
    else if(level.wallSet.has(id)){cell.classList.add("wall");cell.setAttribute("aria-label","Duvar");}
    else if(state.closed.has(id)){cell.classList.add("closed");cell.textContent="X";}
    else {
      if(level.gateSet.has(id)){
        cell.classList.add("gate",openGate(state)?"open":"locked");
        cell.setAttribute("aria-label",openGate(state)?"Açık kapı":"Kilitli kapı");
        if(!openGate(state))cell.textContent="▣";
      }
      if(level.portalMap.has(id)){cell.classList.add("portal");cell.setAttribute("aria-label","Portal");}
      if(state.keys.has(id)){
        const icon=document.createElement("span");icon.className="key-icon";icon.textContent="🔑";cell.append(icon);
        cell.setAttribute("aria-label","Anahtar");
      }
      if(state.stars.has(id)){
        const star=document.createElement("span");star.className="star";
        if(level.starOrder.length){
          const index=level.starOrder.indexOf(id);
          star.classList.add(index===state.orderIndex?"target":"future");
          star.textContent=String(index+1);
          cell.setAttribute("aria-label",`${index+1}. yıldız${index===state.orderIndex?", sıradaki":""}`);
        }else cell.setAttribute("aria-label","Yıldız");
        cell.append(star);
      }
      if(state.position[0]===r&&state.position[1]===c){
        const dot=document.createElement("span");dot.className="player";cell.append(dot);
        const waitingStar=state.stars.has(id)&&level.starOrder.length
          ?`, ${level.starOrder.indexOf(id)+1}. yıldız burada, sırası gelmedi`:"";
        cell.setAttribute("aria-label","Oyuncu"+(level.portalMap.has(id)?", portal üzerinde":"")+waitingStar);
      }
    }
    board.append(cell);
  }
  $("next").hidden=state.stars.size!==0||number===levels.length;
}
function chooseDirection(r,c){
  const dr=r-state.position[0],dc=c-state.position[1];
  if(!dr&&!dc)return null;
  if(Math.abs(dr)>=Math.abs(dc))return dr<0?"Up":"Down";
  return dc<0?"Left":"Right";
}
function showLevels(){
  const grid=$("level-grid");grid.replaceChildren();
  for(let n=1;n<=levels.length;n++){
    const button=document.createElement("button");button.type="button";button.textContent=String(n).padStart(2,"0")+(progress.completed.includes(n)?" ✓":"");
    if(progress.completed.includes(n))button.classList.add("complete");
    if(n===number)button.classList.add("current");
    button.addEventListener("click",()=>loadLevel(n));grid.append(button);
  }
  $("game-view").hidden=true;$("levels-view").hidden=false;$("levels-toggle").hidden=true;
}
$("board").addEventListener("click",e=>{
  const cell=e.target.closest(".cell");if(!cell||cell.classList.contains("void"))return;
  const dir=chooseDirection(Number(cell.dataset.row),Number(cell.dataset.col));if(dir)move(dir);
});
document.addEventListener("keydown",e=>{const dir={ArrowUp:"Up",ArrowRight:"Right",ArrowDown:"Down",ArrowLeft:"Left"}[e.key];if(dir){e.preventDefault();move(dir);}});
$("restart").addEventListener("click",()=>{state=initialState();$("message").textContent="Bölüm yeniden başladı.";render();});
$("next").addEventListener("click",()=>{if(number<levels.length)loadLevel(number+1);});
$("levels-toggle").addEventListener("click",showLevels);
$("back").addEventListener("click",()=>{$("levels-view").hidden=true;$("game-view").hidden=false;$("levels-toggle").hidden=false;});
fetch("levels-v5.json",{cache:"no-cache"}).then(r=>{if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}).then(data=>{
  if(data.length!==70)throw Error("70 bölüm yüklenemedi");
  levels=data.map(normalizeLevel);
  try{progress={...initialProgress(),...JSON.parse(localStorage.getItem(saveKey))};}catch{progress=initialProgress();}
  const requested=Number(new URLSearchParams(location.search).get("level"));
  loadLevel(Number.isInteger(requested)&&requested>=1&&requested<=levels.length?requested:Math.min(Math.max(progress.current,1),levels.length));
}).catch(error=>{$("message").textContent=`Bölümler yüklenemedi: ${error.message}`;});
