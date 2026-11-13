"use strict";
// Bölüm üretici: bölüm dosyasını hedef zorluk eğrisine uydurur.
//
// difficulty.js'teki BLOCK_FEATURES her 20'lik bloğun özelliğini söyler. Bu araç her bölüm
// yuvasına bakar; oradaki bölüm doğru özellikteyse ve hesaplanan zorluğu hedefe eşitse dokunmaz,
// değilse yerine hedef zorlukta yeni bir bölüm arar.
//
//   node tools/generate.js                    eksik ya da eğriye uymayan bölümleri üret
//   node tools/generate.js --only 27,31       bu bölümleri (beğenilmediyse) yenileriyle değiştir
//   node tools/generate.js --seed 5           başka bir rastgele tohumla dene (varsayılan 1)
//   node tools/generate.js --pool eski.json   önce bu dosyadaki bölümlerden uyanı yerleştir
//
// Arama: rastgele bir tahtadan başlanır; yıldız/duvar/başlangıç/geçit küçük adımlarla oynatılır ve
// hedef zorluğa yaklaştıran adımlar tutulur. Hedefe oturan adaylar arasından en "derli toplu" olan seçilir.
const {LEVELS_FILE,readLevels,writeLevels,blockFeature,inspect,starText}=require("./levels-file.js");
const Difficulty=require("../difficulty.js");

// Blok içindeki sıraya göre tahta boyu: ilk bölümler küçük, son bölümler büyük tahtada.
const SIZE_BY_SLOT=[3,3,3,3,4,4,4,4,5,5,5,5,5,5,6,6,6,6,6,6];
const STARS_BY_SIZE={3:[1,2],4:[2,3],5:[3,5],6:[4,6]};
const MAX_WALLS={3:2,4:2,5:5,6:8};
const SEARCH_STATES=60000; // arama sırasında bundan büyük oyun ağaçları atlanır
const WANTED=60;           // bir yuva için kaç uygun aday toplanınca seçim yapılır
const BUDGET=3000;         // bir yuva için en çok kaç tahta denenir (bulunamazsa iki kez katlanır)
const MIN_USED_CELLS=0.75; // üretilen bölümde karelerin en az bu kadarı bir çözümde kullanılmalı
const HALF_BIN=(Difficulty.RAW_FIVE_STARS-Difficulty.RAW_ONE_STAR)/4*Difficulty.STEP/2;

// Özelliğe özgü kısımlar. Yeni özellik eklemek için buraya bir giriş yazılır.
//   cells      özelliğin tahtada kapladığı kare sayısı
//   apply      ayrılan kareleri bölüm verisine işler
//   essential  özellik gerçekten gerekli mi (yoksa bölüm çözülemiyor mu)
const FEATURES={
  portal:{
    rulesVersion:3,cells:2,
    apply(level,points){level.portals=points;},
    // Geçit kareleri duvar olsaydı bölüm çözülemiyorsa her çözüm geçitten geçiyor demektir.
    essential(rawLevel){
      const {analysis}=inspect({...rawLevel,portals:[],walls:[...rawLevel.walls,...rawLevel.portals]},{maxStates:SEARCH_STATES});
      return analysis!==null&&!analysis.solvable;
    },
  },
};

// ---- küçük yardımcılar ----
function randomSource(seed){ // mulberry32: tohum aynıysa sonuç aynı
  let a=seed>>>0;
  return ()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
}
function hash(text){let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return h>>>0;}
const between=(random,low,high)=>low+Math.floor(random()*(high-low+1));
const choose=(random,list)=>list[Math.floor(random()*list.length)];
const idealMoves=rating=>2.6*rating-1; // 1★ ≈ 1-2 hamle, 5★ ≈ 12 hamle
const signature=rawLevel=>JSON.stringify([rawLevel.width,rawLevel.activeCells,rawLevel.walls,rawLevel.start,rawLevel.stars,rawLevel.portals??[]]);
// Tahtanın iskeleti (biçim + duvarlar). Aynı blokta iki bölüm aynı iskeleti paylaşmaz.
const skeleton=(rawLevel,feature)=>JSON.stringify([feature,rawLevel.width,rawLevel.activeCells,rawLevel.walls]);

// Arama sırasında tahta, kare numaralarıyla (satır*boy+sütun) tutulur.
function toLevel(board,feature){
  const point=id=>({row:Math.floor(id/board.size),column:id%board.size}),sorted=ids=>[...ids].sort((a,b)=>a-b).map(point);
  const level={rulesVersion:feature?FEATURES[feature].rulesVersion:2,width:board.size,height:board.size,
    activeCells:sorted(board.active),start:point(board.start),walls:sorted(board.walls),stars:sorted(board.stars)};
  if(feature)FEATURES[feature].apply(level,board.extra.map(point));
  return level;
}
// Açık kareler tek parça mı (geçidin iki ucu birbirine bağlı sayılır).
function connected(board){
  const free=[...board.active].filter(id=>!board.walls.has(id)),freeSet=new Set(free),seen=new Set([free[0]]),queue=[free[0]];
  while(queue.length){
    const id=queue.pop(),row=Math.floor(id/board.size),column=id%board.size,next=[];
    if(row>0)next.push(id-board.size);if(row<board.size-1)next.push(id+board.size);
    if(column>0)next.push(id-1);if(column<board.size-1)next.push(id+1);
    const extraIndex=board.extra.indexOf(id);if(extraIndex>=0)next.push(...board.extra);
    for(const other of next)if(freeSet.has(other)&&!seen.has(other)){seen.add(other);queue.push(other);}
  }
  return seen.size===free.length;
}
const occupied=board=>new Set([board.start,...board.stars,...board.extra]);
function emptyCells(board){
  const taken=occupied(board);
  return [...board.active].filter(id=>!board.walls.has(id)&&!taken.has(id));
}
function randomBoard(random,size,feature){
  for(;;){
    const active=new Set(Array.from({length:size*size},(_,id)=>id));
    for(let cut=choose(random,[0,0,1,1,1,2]);cut>0;cut--){ // tahtadan dikdörtgen parçalar kes
      const width=between(random,1,size-2),height=between(random,1,size-2);
      if(width*height>size*size/3)continue;
      const top=between(random,0,size-height),left=between(random,0,size-width);
      for(let r=top;r<top+height;r++)for(let c=left;c<left+width;c++)active.delete(r*size+c);
    }
    const rows=new Set([...active].map(id=>Math.floor(id/size))),columns=new Set([...active].map(id=>id%size));
    if(rows.size<size||columns.size<size)continue; // tahta kendi boyunu doldurmalı
    const cells=[...active],walls=new Set();
    for(let count=between(random,0,MAX_WALLS[size]);count>0;count--)walls.add(choose(random,cells));
    const free=cells.filter(id=>!walls.has(id)),extraCount=feature?FEATURES[feature].cells:0;
    const starCount=between(random,...STARS_BY_SIZE[size]);
    if(free.length<starCount+extraCount+2)continue;
    for(let i=free.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[free[i],free[j]]=[free[j],free[i]];}
    const board={size,active,walls,start:free[0],stars:free.slice(1,1+starCount),extra:free.slice(1+starCount,1+starCount+extraCount)};
    if(connected(board))return board;
  }
}
// Tahtada küçük bir değişiklik yapar; geçerli bir tahta çıkmazsa null.
function mutate(random,board){
  const next={...board,walls:new Set(board.walls),stars:[...board.stars],extra:[...board.extra]};
  const empty=emptyCells(board),[minStars,maxStars]=STARS_BY_SIZE[board.size];
  const kind=choose(random,["star","star","star","start","wall+","wall-","wall~","star+","star-",...(board.extra.length?["extra","extra"]:[])]);
  if(kind!=="wall-"&&kind!=="star-"&&!empty.length)return null;
  const target=choose(random,empty);
  if(kind==="star")next.stars[between(random,0,next.stars.length-1)]=target;
  else if(kind==="start")next.start=target;
  else if(kind==="extra")next.extra[between(random,0,next.extra.length-1)]=target;
  else if(kind==="star+"){if(next.stars.length>=maxStars)return null;next.stars.push(target);}
  else if(kind==="star-"){if(next.stars.length<=minStars)return null;next.stars.splice(between(random,0,next.stars.length-1),1);}
  else if(kind==="wall+"){if(next.walls.size>=MAX_WALLS[board.size])return null;next.walls.add(target);}
  else{
    if(!next.walls.size)return null;
    next.walls.delete(choose(random,[...next.walls]));
    if(kind==="wall~")next.walls.add(target);
  }
  return connected(next)?next:null;
}

// Aynı zorluktaki adaylar arasında tercih: tahtanın çoğu işe yarasın, zorluk aralığın ortasına
// yakın olsun, çözüm uzunluğu o zorluktan beklenene yakın olsun, çözüm sayısı az olsun
// (her yol çıkmasın, bulmaca "sıkı" dursun), tahta duvara boğulmasın.
function quality(rawLevel,analysis,target){
  return 2*analysis.usedCells-0.5*Math.abs(analysis.raw-Difficulty.rawFromRating(target))/HALF_BIN
    -0.2*Math.abs(analysis.minMoves-idealMoves(target))-0.1*Math.log2(analysis.solutions)-0.1*rawLevel.walls.length;
}
// Bölüm bu yuvaya neden konamaz? Konabiliyorsa null. Yuvaya uyan bölüm: bloğun özelliğini taşır,
// çözülebilir, hesaplanan zorluğu hedefe eşittir ve özellik kullanılmadan çözülemez.
function misfit(rawLevel,feature,target,found=inspect(rawLevel)){
  const {analysis}=found,name=value=>value??"temel";
  if(found.feature!==feature)return `özelliği "${name(found.feature)}", bu blokta "${name(feature)}" olmalı`;
  if(!analysis||!analysis.solvable)return "çözümü yok";
  if(analysis.rating!==target)return `zorluğu ${starText(analysis.rating)}, olması gereken ${starText(target)}`;
  // 5 yıldızın üst sınırı yok; blok sonu makul kalsın diye o da diğer aralıklarla aynı genişlikte tutulur.
  if(analysis.raw>Difficulty.rawFromRating(target)+HALF_BIN)return "5 yıldız aralığının da üstünde (fazla zor)";
  if(feature&&!FEATURES[feature].essential(rawLevel))return `"${feature}" kullanılmadan da çözülebiliyor`;
  return null;
}
const fits=(...args)=>misfit(...args)===null;

// Hedef zorlukta `count` farklı bölüm arar. taken: oyunda zaten bulunan bölümler ve tahta iskeletleri.
function search(random,size,feature,target,count,taken){
  const center=Difficulty.rawFromRating(target),found=new Map();
  const distance=analysis=>Math.abs(analysis.raw-center);
  const evaluate=board=>{
    const rawLevel=toLevel(board,feature),{analysis}=inspect(rawLevel,{maxStates:SEARCH_STATES});
    return analysis&&analysis.solvable?{board,rawLevel,analysis}:null;
  };
  let tries=0,budget=BUDGET*count;
  for(let round=0;round<3&&found.size<count;round++,budget*=2){
    while(tries<budget&&found.size<WANTED*count){
      let current=null;
      while(!current&&tries<budget){tries++;current=evaluate(randomBoard(random,size,feature));}
      for(let idle=0;current&&idle<80&&tries<budget;idle++){
        if(current.analysis.rating===target&&current.analysis.usedCells>=MIN_USED_CELLS){
          const id=signature(current.rawLevel);
          if(!found.has(id)&&!taken.has(id)&&!taken.has(skeleton(current.rawLevel,feature))&&fits(current.rawLevel,feature,target,{feature,analysis:current.analysis}))
            found.set(id,{...current,score:quality(current.rawLevel,current.analysis,target)});
        }
        const board=mutate(random,current.board);if(!board)continue;
        tries++;
        const next=evaluate(board);if(!next)continue;
        const gain=distance(current.analysis)-distance(next.analysis);
        if(gain>0||(gain>-0.5&&random()<0.15)){if(gain>0)idle=0;current=next;}
      }
    }
  }
  if(found.size<count)return null;
  // En iyi adaylardan seç; birlikte seçilenler de birbirinden farklı iskelette olsun.
  const ranked=[...found.values()].sort((a,b)=>b.score-a.score),chosen=[],boards=new Set();
  for(const candidate of ranked){
    const board=skeleton(candidate.rawLevel,feature);
    if(chosen.length>=count||boards.has(board))continue;
    boards.add(board);chosen.push(candidate);
  }
  return chosen.length<count?null:chosen;
}

function main(){
  const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
  const seed=Number(option("--seed")??1),only=new Set((option("--only")??"").split(",").filter(Boolean).map(Number));
  const pool=option("--pool")?readLevels(option("--pool")).map(rawLevel=>({rawLevel,...inspect(rawLevel)})):[];
  const levels=readLevels(),total=Difficulty.BLOCK_FEATURES.length*Difficulty.BLOCK_SIZE;
  for(const feature of Difficulty.BLOCK_FEATURES)if(feature&&!FEATURES[feature])throw Error(`"${feature}" özelliği için üretici tanımlı değil (tools/generate.js içindeki FEATURES)`);
  levels.length=Math.min(levels.length,total);
  const taken=new Set(),kept=new Set();
  for(let number=1;number<=total;number++){
    const rawLevel=levels[number-1];
    if(!rawLevel)continue;
    taken.add(signature(rawLevel));taken.add(skeleton(rawLevel,blockFeature(number))); // değiştirilen bölümün aynısı ya da benzeri yeniden seçilmesin
    if(!only.has(number)&&fits(rawLevel,blockFeature(number),Difficulty.targetRating(number)))kept.add(number);
  }
  // Aynı hedefi paylaşan yuvalar (ör. 1-4) birlikte doldurulur.
  for(let number=1;number<=total;){
    const feature=blockFeature(number),target=Difficulty.targetRating(number),group=[];
    for(;number<=total&&blockFeature(number)===feature&&Difficulty.targetRating(number)===target;number++)group.push(number);
    const open=group.filter(n=>!kept.has(n));
    if(open.length){
      const size=SIZE_BY_SLOT[(group[0]-1)%Difficulty.BLOCK_SIZE],placed=[];
      // 1) havuzdan uyanlar (yuvanın tahta boyundakiler önce)
      const fromPool=pool.filter(item=>!taken.has(signature(item.rawLevel))&&fits(item.rawLevel,feature,target,item))
        .map(item=>({...item,score:quality(item.rawLevel,item.analysis,target)+(item.rawLevel.width===size?10:0)}))
        .sort((a,b)=>b.score-a.score).slice(0,open.length);
      for(const item of fromPool){placed.push({rawLevel:{...item.rawLevel},source:"havuz"});taken.add(signature(item.rawLevel));taken.add(skeleton(item.rawLevel,feature));}
      // 2) kalanı üret
      const missing=open.length-placed.length;
      if(missing){
        // Tohuma atılan bölümler de katılır: beğenilmeyen bölüm her seferinde bambaşka bir aramayla değişir.
        const replaced=open.map(n=>levels[n-1]?signature(levels[n-1]):"").join("");
        const result=search(randomSource(seed*1000003+group[0]+(replaced?hash(replaced):0)),size,feature,target,missing,taken);
        if(!result)throw Error(`Bölüm ${open.join(",")} için ${starText(target)} zorlukta aday bulunamadı; başka bir --seed dene.`);
        for(const item of result){placed.push({rawLevel:item.rawLevel,source:"yeni"});taken.add(signature(item.rawLevel));taken.add(skeleton(item.rawLevel,feature));}
      }
      open.forEach((n,i)=>{levels[n-1]=placed[i].rawLevel;console.log(`Bölüm ${String(n).padStart(2)}: ${starText(target)} yıldız, ${placed[i].source}`);});
    }
    // Aynı zorluktaki bölümler kendi içinde kısadan uzuna, kolaydan zora dizilir.
    const ordered=group.map(n=>({rawLevel:levels[n-1],analysis:inspect(levels[n-1]).analysis}))
      .sort((a,b)=>a.analysis.minMoves-b.analysis.minMoves||a.analysis.raw-b.analysis.raw);
    group.forEach((n,i)=>{
      const {rawLevel,analysis}=ordered[i],{id,difficultyRating,...rest}=rawLevel;
      levels[n-1]={id:`level-${String(n).padStart(3,"0")}`,...rest,difficultyRating:analysis.rating};
    });
  }
  writeLevels(levels);
  console.log(`${LEVELS_FILE}: ${total} bölüm, ${total-kept.size} yuva dolduruldu, ${kept.size} bölüme dokunulmadı.`);
}
if(require.main===module)main();
module.exports={misfit};
