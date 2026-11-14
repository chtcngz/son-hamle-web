"use strict";
// Oyun kuralları engine.js'te, zorluk hesabı difficulty.js'te; burası yalnızca arayüz.
const {key,normalizeLevel,featuresOf} = SonHamleEngine;
const {BLOCK_SIZE,BLOCK_FEATURES} = SonHamleDifficulty;
const saveKey = "sonhamle-html-v7"; // v7: 61–80 durak yerine kara yıldız bloğu oldu, 81–100 çatlak kare bloğu eklendi
// Eski kayıtlar taşınır. Her adım bir önceki sürümdeki bölüm numarasının yeni yerini söyler:
// bölüm duruyorsa (yeri değişmiş olsa da) "tamamlandı" işareti onunla gelir, bölüm değiştiyse (null) silinir.
// v5'in geçit ve ok bloklarından yeni eğriye uyan 12 bölüm yeni yerlerinde duruyor (eski numara: yeni numara).
const MOVED_FROM_V5 = {32:21,33:23,34:25,35:28,36:29,37:32,38:34,39:36,40:38,52:41,53:43,54:46};
const saveMigrations = [
  {from:"sonhamle-html-v4",to:n=>[18,19,20,38,39,40].includes(n)?null:n},
  {from:"sonhamle-html-v5",to:n=>n<=20?n:MOVED_FROM_V5[n]??null},
  {from:"sonhamle-html-v6",to:n=>n<=60?n:null}, // 61–80 (durak) bölümleri değişti
];
const featureNames = {portal:"Geçit",arrow:"Ok",stop:"Durak",black:"Kara yıldız",crack:"Çatlak kare",gate:"Kapı ve anahtar",order:"Sıralı yıldız"};
const featureHints = {portal:"Geçide gir: eşinden çıkarsın ve hamle biter.",arrow:"Ok seni yönüne çevirir; oka karşıdan girilmez.",stop:"Durağa giren nokta orada durur.",
  black:"Kara yıldıza değen top yanar: üstünden geçme.",crack:"Çatlak kareden kayıp geçersen arkandan kapanır.",gate:"Anahtarı al: kapı açılır.",order:"Yıldızları numara sırasıyla topla."};
// Tahtada önceki blokların özellikleri de varsa onlar tek satırlık kısa hatırlatmayla yazılır.
const featureReminders = {portal:"Geçit: eşinden çıkarsın",arrow:"Ok: yönüne çevirir",stop:"Durak: orada durursun",black:"Kara yıldız: değme",crack:"Çatlak: geçince kapanır",gate:"Anahtar: kapıyı açar",order:"Yıldızlar: numara sırasıyla"};
const directionNames = {Up:"yukarı",Right:"sağa",Down:"aşağı",Left:"sola"};
const $ = id => document.getElementById(id);
let levels = [], level, number = 1, state, progress;
let resultClosed = false; // oyuncu sonuç penceresini kapattı: tahtaya bakıyor
const initialProgress = () => ({unlocked:1,current:1,completed:[]});
const initialState = () => SonHamleEngine.initialState(level);
const won = () => SonHamleEngine.won(state);
const openGate = s => SonHamleEngine.openGate(level,s);
function save(){localStorage.setItem(saveKey,JSON.stringify(progress));}
function loadProgress(){
  try{
    const saved=JSON.parse(localStorage.getItem(saveKey));
    if(saved)return {...initialProgress(),...saved};
    for(let index=saveMigrations.length-1;index>=0;index--){ // en yeni eski kayıttan başla
      const previous=JSON.parse(localStorage.getItem(saveMigrations[index].from));
      if(!previous)continue;
      let completed=previous.completed??[];
      for(const step of saveMigrations.slice(index))completed=completed.map(n=>step.to(n)).filter(n=>n!==null);
      return {...initialProgress(),...previous,completed:Array.from(new Set(completed)).sort((a,b)=>a-b)};
    }
  }catch{}
  return initialProgress();
}
function loadLevel(n){
  number=n;level=levels[n-1];state=initialState();resultClosed=false;progress.current=n;save();
  $("levels-view").hidden=true;$("game-view").hidden=false;$("levels-toggle").hidden=false;
  $("message").textContent="Bir hücreye tıkla; nokta o yönde son açık kareye kayar.";
  render();
}
function restart(){state=initialState();resultClosed=false;$("message").textContent="Bölüm yeniden başladı.";render();}
function move(dir){
  if(!level||state.stars.size===0||state.burned)return;
  const after=SonHamleEngine.slide(level,state,dir);if(!after)return;
  // Ayrılınan kareden başka kapanan kareler: girilen geçit ya da üstünden geçilen çatlak.
  const origin=key(...state.position),newlyClosed=[...after.closed].filter(id=>id!==origin&&!state.closed.has(id));
  const usedPortal=newlyClosed.some(id=>level.portalMap.has(id)),brokeCrack=newlyClosed.some(id=>level.crackSet.has(id));
  state=after;
  if(state.burned)$("message").textContent="Kara yıldıza değdin; top yandı.";
  else if(won()){
    progress.completed=Array.from(new Set([...progress.completed,number]));progress.unlocked=Math.max(progress.unlocked,Math.min(levels.length,number+1));save();
    $("message").textContent=number===levels.length?"Seri tamamlandı!":"Harika! Bütün yıldızlar toplandı.";
  }else if(!SonHamleEngine.hasMove(level,state))$("message").textContent="Çıkmaz! Yeniden Başlat ile başka yol dene.";
  else $("message").textContent=usedPortal?"Ayrıldığın kare ve girdiğin geçit kapandı. Sonraki kararı düşün."
    :brokeCrack?"Üstünden geçtiğin çatlak kırıldı ve kapandı. Sonraki kararı düşün."
    :level.stopSet.has(key(...state.position))?"Durakta durdun; ayrıldığın kare kapandı. Sonraki kararı düşün."
    :"Ayrıldığın tek kare kapandı. Sonraki kararı düşün.";
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
  if(hint){ // bloğun yeni özelliği tam cümleyle, tahtadaki diğer özellikler altında kısa hatırlatmayla
    const own=BLOCK_FEATURES[Math.floor((number-1)/BLOCK_SIZE)],features=featuresOf(level);
    const main=features.includes(own)?own:features[0],others=features.filter(feature=>feature!==main);
    hint.hidden=!features.length||won(); // bölüm bitince yerini Sonraki Bölüm düğmesine bırakır
    hint.textContent=[featureHints[main]??"",others.map(feature=>featureReminders[feature]).join(" · ")].filter(Boolean).join("\n");
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
      const stop=level.stopSet.has(id);
      if(stop){
        cell.classList.add("stop");cell.setAttribute("aria-label","Durak");
        if(!playerHere){const icon=document.createElement("span");icon.className="stop-icon";cell.append(icon);}
      }
      const black=level.blackSet.has(id);
      if(black){
        cell.classList.add("black");cell.setAttribute("aria-label","Kara yıldız");
        if(!playerHere){const icon=document.createElement("span");icon.className="black-star";cell.append(icon);}
      }
      const crack=level.crackSet.has(id);
      if(crack){
        cell.classList.add("crack");cell.setAttribute("aria-label","Çatlak kare");
        if(!playerHere){const icon=document.createElement("span");icon.className="crack-icon";cell.append(icon);}
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
        const dot=document.createElement("span");dot.className=state.burned?"player burned":"player";cell.append(dot);
        const waitingStar=state.stars.has(id)&&level.starOrder.length
          ?`, ${level.starOrder.indexOf(id)+1}. yıldız burada, sırası gelmedi`:"";
        cell.setAttribute("aria-label","Oyuncu"+(portalOpen?", geçit üzerinde":"")+(arrow?", ok üzerinde":"")+(stop?", durak üzerinde":"")
          +(black?", kara yıldızda yandı":"")+(crack?", çatlak üzerinde":"")+waitingStar);
      }
    }
    board.append(cell);
  }
  $("next").hidden=!won()||number===levels.length;
  renderResult();
}
// Sonuç penceresi: bölüm bitince ya da yapacak hamle kalmayınca ekranın ortasında açılır (style.css onu
// son hamle görülsün diye kısa bir gecikmeyle gösterir; o ana kadar tıklanamaz).
// Karta dokunmak sıradaki işi yapar: sonraki bölüm, son bölümde bölüm listesi, çıkmazda yeniden başlatma.
// Kartın dışına dokunmak ya da Esc pencereyi kapatır; tahta son hâliyle ve alttaki düğmelerle kalır.
function renderResult(){
  const finished=won(),stuck=!finished&&!SonHamleEngine.hasMove(level,state),box=$("result");
  box.hidden=resultClosed||!(finished||stuck);
  if(box.hidden)return;
  const last=number===levels.length;
  box.className=finished?"result won":"result lost";
  $("result-title").textContent=finished?"Başardın!":"Kaybettin!";
  $("result-text").textContent=state.burned?"Kara yıldıza değdin.":!finished?"Çıkmaza girdin: hamle kalmadı.":last?"Bütün bölümleri bitirdin.":`Bütün yıldızları ${state.moves} hamlede topladın.`;
  $("result-action").textContent=!finished?"Yeniden Başla":last?"Bölümler":"Sonraki Bölüm";
}
function resultAction(){
  if(!won())restart();
  else if(number<levels.length)loadLevel(number+1);
  else showLevels();
}
function closeResult(){resultClosed=true;$("result").hidden=true;}
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
      const feature=BLOCK_FEATURES[(n-1)/BLOCK_SIZE]??featuresOf(levels[n-1])[0];
      title.textContent=`${featureNames[feature]??"Temel"} · ${n}–${Math.min(n+BLOCK_SIZE-1,levels.length)}`;
      grid.append(title);
    }
    const button=document.createElement("button");button.type="button";button.textContent=String(n).padStart(2,"0")+(progress.completed.includes(n)?" ✓":"");
    if(progress.completed.includes(n))button.classList.add("complete");
    if(n===number)button.classList.add("current");
    button.addEventListener("click",()=>loadLevel(n));grid.append(button);
  }
  $("game-view").hidden=true;$("levels-view").hidden=false;$("levels-toggle").hidden=true;
  closeResult();
}
$("board").addEventListener("click",e=>{
  const cell=e.target.closest(".cell");if(!cell||cell.classList.contains("void"))return;
  const dir=chooseDirection(Number(cell.dataset.row),Number(cell.dataset.col));if(dir)move(dir);
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&!$("result").hidden)return closeResult();
  const dir={ArrowUp:"Up",ArrowRight:"Right",ArrowDown:"Down",ArrowLeft:"Left"}[e.key];if(dir){e.preventDefault();move(dir);}
});
$("restart").addEventListener("click",restart);
$("result-card").addEventListener("click",resultAction);
$("result").addEventListener("click",e=>{if(e.target===e.currentTarget)closeResult();}); // kartın dışı
$("result").addEventListener("animationend",()=>$("result-card").focus({preventScroll:true})); // klavyeyle oynayan Enter ile sürdürür
$("next").addEventListener("click",()=>{if(number<levels.length)loadLevel(number+1);});
$("levels-toggle").addEventListener("click",showLevels);
$("back").addEventListener("click",()=>{$("levels-view").hidden=true;$("game-view").hidden=false;$("levels-toggle").hidden=false;});
fetch("levels-v9.json",{cache:"no-cache"}).then(r=>{if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}).then(data=>{
  if(!Array.isArray(data)||!data.length)throw Error("bölüm listesi boş");
  levels=data.map(normalizeLevel);
  progress=loadProgress();
  const requested=Number(new URLSearchParams(location.search).get("level"));
  loadLevel(Number.isInteger(requested)&&requested>=1&&requested<=levels.length?requested:Math.min(Math.max(progress.current,1),levels.length));
}).catch(error=>{$("message").textContent=`Bölümler yüklenemedi: ${error.message}`;});
