"use strict";
const dirs = {Up:[-1,0],Right:[0,1],Down:[1,0],Left:[0,-1]};
const saveKey = "sonhamle-html-v3"; // v3: levels 6-40 replaced, old completion marks no longer apply
const $ = id => document.getElementById(id);
const key = (r,c) => `${r},${c}`;
let levels = [], level, number = 1, state, progress;
const initialProgress = () => ({unlocked:1,current:1,completed:[]});

function initialState(){return {position:[...level.start],closed:new Set(),stars:new Set(level.stars.map(([r,c])=>key(r,c))),moves:0};}
function copyState(s){return {position:[...s.position],closed:new Set(s.closed),stars:new Set(s.stars),moves:s.moves};}
function save(){localStorage.setItem(saveKey,JSON.stringify(progress));}
function loadLevel(n){
  number=n;level=levels[n-1];state=initialState();progress.current=n;save();
  $("levels-view").hidden=true;$("game-view").hidden=false;$("levels-toggle").hidden=false;
  $("message").textContent="Bir hücreye tıkla; nokta o yönde son açık kareye kayar.";
  render();
}
function active(r,c){return r>=0&&r<level.height&&c>=0&&c<level.width&&level.activeSet.has(key(r,c));}
function slide(s,dir){
  if(s.stars.size===0)return null;
  const [dr,dc]=dirs[dir];let [r,c]=s.position;const path=[];
  while(active(r+dr,c+dc)&&!level.wallSet.has(key(r+dr,c+dc))&&!s.closed.has(key(r+dr,c+dc))){r+=dr;c+=dc;path.push(key(r,c));}
  if(!path.length)return null;
  const after=copyState(s);after.closed.add(key(...s.position));after.position=[r,c];after.moves++;
  for(const cell of path)after.stars.delete(cell);
  return after;
}
function hasMove(s){return Object.keys(dirs).some(dir=>slide(s,dir)!==null);}
function move(dir){
  if(!level||state.stars.size===0)return;
  const after=slide(state,dir);if(!after)return;
  state=after;
  if(state.stars.size===0){
    progress.completed=Array.from(new Set([...progress.completed,number]));progress.unlocked=Math.max(progress.unlocked,Math.min(40,number+1));save();
    $("message").textContent=number===40?"Prototip tamamlandı!":"Harika! Bütün yıldızlar toplandı.";
  }else if(!hasMove(state))$("message").textContent="Çıkmaz! Yeniden Başlat ile başka yol dene.";
  else $("message").textContent="Ayrıldığın tek kare kapandı. Sonraki kararı düşün.";
  render();
}
function render(){
  $("level-title").textContent=`Bölüm ${number}`;
  $("counters").textContent=`Yıldız: ${state.stars.size} · Hamle: ${state.moves}`;
  const board=$("board");board.style.gridTemplateColumns=`repeat(${level.width},1fr)`;board.style.gridTemplateRows=`repeat(${level.height},1fr)`;
  board.replaceChildren();
  for(let r=0;r<level.height;r++)for(let c=0;c<level.width;c++){
    const cell=document.createElement("button");cell.type="button";cell.dataset.row=r;cell.dataset.col=c;
    cell.className="cell";cell.setAttribute("aria-label",`Satır ${r+1}, sütun ${c+1}`);
    const id=key(r,c);
    if(!level.activeSet.has(id)){cell.classList.add("void");cell.tabIndex=-1;}
    else if(level.wallSet.has(id)){cell.classList.add("wall");cell.setAttribute("aria-label","Duvar");}
    else if(state.closed.has(id)){cell.classList.add("closed");cell.textContent="X";}
    else if(state.position[0]===r&&state.position[1]===c){const dot=document.createElement("span");dot.className="player";cell.append(dot);cell.setAttribute("aria-label","Oyuncu");}
    else if(state.stars.has(id)){const star=document.createElement("span");star.className="star";cell.append(star);cell.setAttribute("aria-label","Yıldız");}
    board.append(cell);
  }
  $("next").hidden=state.stars.size!==0||number===40;
}
function chooseDirection(r,c){
  const dr=r-state.position[0],dc=c-state.position[1];
  if(!dr&&!dc)return null;
  if(Math.abs(dr)>=Math.abs(dc))return dr<0?"Up":"Down";
  return dc<0?"Left":"Right";
}
function showLevels(){
  const grid=$("level-grid");grid.replaceChildren();
  for(let n=1;n<=40;n++){
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
$("next").addEventListener("click",()=>{if(number<40)loadLevel(number+1);});
$("levels-toggle").addEventListener("click",showLevels);
$("back").addEventListener("click",()=>{$("levels-view").hidden=true;$("game-view").hidden=false;$("levels-toggle").hidden=false;});
fetch("levels.json",{cache:"no-cache"}).then(r=>{if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}).then(data=>{
  if(data.length!==40)throw Error("40 bölüm yüklenemedi");
  levels=data.map(l=>({...l,activeSet:new Set(l.activeCells.map(p=>key(p.row,p.column))),wallSet:new Set(l.walls.map(p=>key(p.row,p.column))),stars:l.stars.map(p=>[p.row,p.column]),start:[l.start.row,l.start.column]}));
  try{progress={...initialProgress(),...JSON.parse(localStorage.getItem(saveKey))};}catch{progress=initialProgress();}
  const requested=Number(new URLSearchParams(location.search).get("level"));
  loadLevel(Number.isInteger(requested)&&requested>=1&&requested<=40?requested:Math.min(Math.max(progress.current,1),40));
}).catch(error=>{$("message").textContent=`Bölümler yüklenemedi: ${error.message}`;});
