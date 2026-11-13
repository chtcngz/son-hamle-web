"use strict";
// Oyun kuralları engine.js'te, zorluk hesabı difficulty.js'te; burası yalnızca arayüz.
const {key,normalizeLevel,featureOf} = SonHamleEngine;
const {BLOCK_SIZE,BLOCK_FEATURES} = SonHamleDifficulty;
const saveKey = "sonhamle-html-v5"; // v5: 18–20 ve 38–40 yenilendi
// Önceki kayıt (v4) taşınır; yalnızca yenilenen bölümlerin "tamamlandı" işareti silinir.
const previousSaveKey = "sonhamle-html-v4", replacedSincePrevious = [18,19,20,38,39,40];
const featureNames = {portal:"Geçit",arrow:"Ok",gate:"Kapı ve anahtar",order:"Sıralı yıldız"};
const featureHints = {portal:"Geçide gir: eşinden çıkarsın ve hamle biter.",arrow:"Ok seni gösterdiği yöne çevirir; oka karşıdan girilmez.",gate:"Anahtarı al: kapı açılır.",order:"Yıldızları numara sırasıyla topla."};
const directionNames = {Up:"yukarı",Right:"sağa",Down:"aşağı",Left:"sola"};
const $ = id => document.getElementById(id);
let levels = [], level, number = 1, state, progress;
const initialProgress = () => ({unlocked:1,current:1,completed:[]});
const initialState = () => SonHamleEngine.initialState(level);
const openGate = s => SonHamleEngine.openGate(level,s);
function save(){localStorage.setItem(saveKey,JSON.stringify(progress));}
function loadProgress(){
  try{
    const saved=JSON.parse(localStorage.getItem(saveKey));
    if(saved)return {...initialProgress(),...saved};
    const previous=JSON.parse(localStorage.getItem(previousSaveKey));
    if(previous)return {...initialProgress(),...previous,completed:(previous.completed??[]).filter(n=>!replacedSincePrevious.includes(n))};
  }catch{}
  return initialProgress();
}
function loadLevel(n){
  number=n;level=levels[n-1];state=initialState();progress.current=n;save();
  $("levels-view").hidden=true;$("game-view").hidden=false;$("levels-toggle").hidden=false;
  $("message").textContent="Bir hücreye tıkla; nokta o yönde son açık kareye kayar.";
  render();
}
function move(dir){
  if(!level||state.stars.size===0)return;
  const after=SonHamleEngine.slide(level,state,dir);if(!after)return;
  const usedPortal=after.closed.size-state.closed.size>1; // ayrılınan kareyle birlikte girilen geçit de kapandı
  state=after;
  if(state.stars.size===0){
    progress.completed=Array.from(new Set([...progress.completed,number]));progress.unlocked=Math.max(progress.unlocked,Math.min(levels.length,number+1));save();
    $("message").textContent=number===levels.length?"Seri tamamlandı!":"Harika! Bütün yıldızlar toplandı.";
  }else if(!SonHamleEngine.hasMove(level,state))$("message").textContent="Çıkmaz! Yeniden Başlat ile başka yol dene.";
  else $("message").textContent=usedPortal?"Ayrıldığın kare ve girdiğin geçit kapandı. Sonraki kararı düşün.":"Ayrıldığın tek kare kapandı. Sonraki kararı düşün.";
  render();
}
// Zorluk bölümün kendisinden hesaplanır (bölüm başına bir kez). Hesaplanamazsa dosyadaki değere düşülür.
function ratingOf(l){
  if(l.rating===undefined){
    let computed=null;
    try{computed=SonHamleDifficulty.rate(l);}catch{}
    l.rating=computed??(Number.isFinite(l.difficultyRating)?l.difficultyRating:0);
  }
  return l.rating;
}
function renderDifficulty(){
  const rating=ratingOf(level);
  const label=rating?rating.toLocaleString("tr-TR",{maximumFractionDigits:2}):"–";
  $("difficulty").setAttribute("aria-label",`Tahmini zorluk: ${label} / 5`);
  $("difficulty").setAttribute("title","Bölümün hesaplanan tahmini zorluğu");
  $("difficulty-value").textContent=`${label}/5`;
  const row=$("difficulty-stars");row.replaceChildren();
  for(let index=0;index<5;index++){
    const star=document.createElement("span");star.className="difficulty-star";
    const base=document.createElement("span");base.textContent="★";
    const fill=document.createElement("span");fill.className="difficulty-star-fill";fill.textContent="★";
    fill.style.width=`${Math.max(0,Math.min(1,rating-index))*100}%`;
    star.append(base,fill);row.append(star);
  }
}
function render(){
  $("level-title").textContent=`Bölüm ${number}`;
  renderDifficulty();
  $("counters").textContent=`Yıldız: ${state.stars.size} · Hamle: ${state.moves}`+(level.starOrder.length?` · Sıra: ${Math.min(state.orderIndex+1,level.starOrder.length)}/${level.starOrder.length}`:"");
  const hint=$("rule-hint");
  if(hint){
    const feature=featureOf(level);
    hint.hidden=!feature;
    hint.textContent=featureHints[feature]??"";
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
      // Kullanılan geçit kaybolur: girilen uç kapanır, çıkılan uç sıradan kareye döner.
      const portalOpen=level.portalMap.has(id)&&!state.closed.has(level.portalMap.get(id));
      if(portalOpen){cell.classList.add("portal");cell.setAttribute("aria-label","Geçit");}
      const arrow=level.arrowMap.get(id),playerHere=state.position[0]===r&&state.position[1]===c;
      if(arrow){
        cell.classList.add("arrow");cell.setAttribute("aria-label",`Ok: ${directionNames[arrow]}`);
        if(!playerHere){const icon=document.createElement("span");icon.className=`arrow-icon ${arrow}`;cell.append(icon);}
      }
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
      if(playerHere){
        const dot=document.createElement("span");dot.className="player";cell.append(dot);
        const waitingStar=state.stars.has(id)&&level.starOrder.length
          ?`, ${level.starOrder.indexOf(id)+1}. yıldız burada, sırası gelmedi`:"";
        cell.setAttribute("aria-label","Oyuncu"+(portalOpen?", geçit üzerinde":"")+(arrow?", ok üzerinde":"")+waitingStar);
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
    if((n-1)%BLOCK_SIZE===0){ // her 20 bölümde yeni özellik: blok başlığı
      const title=document.createElement("p");title.className="block-title";
      const feature=BLOCK_FEATURES[(n-1)/BLOCK_SIZE]??featureOf(levels[n-1]);
      title.textContent=`${featureNames[feature]??"Temel"} · ${n}–${Math.min(n+BLOCK_SIZE-1,levels.length)}`;
      grid.append(title);
    }
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
fetch("levels-v7.json",{cache:"no-cache"}).then(r=>{if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}).then(data=>{
  if(!Array.isArray(data)||!data.length)throw Error("bölüm listesi boş");
  levels=data.map(normalizeLevel);
  progress=loadProgress();
  const requested=Number(new URLSearchParams(location.search).get("level"));
  loadLevel(Number.isInteger(requested)&&requested>=1&&requested<=levels.length?requested:Math.min(Math.max(progress.current,1),levels.length));
}).catch(error=>{$("message").textContent=`Bölümler yüklenemedi: ${error.message}`;});
