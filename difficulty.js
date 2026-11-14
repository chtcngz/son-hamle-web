"use strict";
// Son Hamle zorluk algoritması.
//
// Bir bölümün zorluğu elle verilmez; bölümün kendisinden hesaplanır:
//
//  1. Bölümün bütün oyun ağacı çıkarılır (her konum bir kez çözülür).
//  2. Bu ağaçta iki hayali oyuncu oynatılır. İkisi de bir hamle ilerisini görür,
//     yani hamle biter bitmez sıkışacağı kareye bile bile girmez.
//       - Dalgın oyuncu: hafızası yoktur. Yıldız/anahtar toplayan hamleyi
//         GREED kat daha çok sever, gerisini rastgele seçer; sıkışınca baştan başlar.
//       - Sistemli oyuncu: rastgele dener ama tutmayan bir yolu bir daha denemez.
//  3. Her oyuncunun bölümü bitirene kadar (yeniden başlamalar dahil) vermesi beklenen
//     karar sayısı bulunur. Karar, yanlış gidebilecek seçimdir: mecburi hamleler ve
//     hangisi seçilse kazandıran hamleler sayılmaz. Emek = 1 + karar sayısı;
//     iki oyuncudan küçük olanınki alınır.
//  4. Emek logaritmik ölçekte yıldıza çevrilir ve çeyrek yıldıza yuvarlanır:
//     yıldız = 1 + log2(emek)/3. Yani emek her 8 katına çıktığında puan bir tam yıldız artar;
//     hiç risk yoksa 1 yıldız, 4096 kararlık emek 5 yıldızdır.
//
// Hesap kesindir (rastgelelik/örnekleme yoktur): aynı bölüm hep aynı puanı alır.
(function(root){
  const Engine=(typeof module!=="undefined"&&module.exports)?require("./engine.js"):root.SonHamleEngine;

  // Oyunun akışı: her 20 bölümde bir özellik gelir. Sıradaki 20'lik bloğu açmak için
  // listeye özelliğin adını ekleyip `node tools/generate.js` çalıştırmak yeter.
  // null = temel oyun. Üreticide tanımlı özellikler: "portal" (geçit), "arrow" (ok), "black" (kara yıldız),
  // "crack" (çatlak kare) ve "stop" (durak; kuralı oyunda duruyor ama bloğu kaldırıldı).
  const BLOCK_FEATURES=[null,"portal","arrow","black","crack"];
  const BLOCK_SIZE=20;        // her özellik 20 bölüm sürer
  const STEP=0.25;            // puan çeyrek yıldız adımlarıyla verilir
  const FEATURE_START=3;      // özellik blokları bu yıldızdan başlar: oyuncu temel bloğu bitirmiştir
  const FEATURE_PACE=2;       // özellik bloklarında kaç bölümde bir çeyrek yıldız artar
  const SOLO_SLOTS=6;         // özellik bloğunun ilk bölümleri yalnızca yeni özelliği taşır
  const TRIO_SLOTS=6;         // son bölümlerinde yeni özelliğe iki eski özellik birden eşlik eder
  // Bir hamlenin gerçekten kullandığı özellikler bit olarak tutulur (bkz. slideFast → special).
  // Kara yıldız hiçbir çözümde "kullanılmaz" (değen kaybeder); gerekliliği ayrıca ölçülür (bkz. generate.js).
  const FEATURE_BITS={portal:1,arrow:2,stop:4,black:8,crack:16};
  const USE_BITS=FEATURE_BITS.portal|FEATURE_BITS.arrow|FEATURE_BITS.stop|FEATURE_BITS.crack;
  const ALL_FEATURE_BITS=Object.values(FEATURE_BITS).reduce((all,bit)=>all|bit,0);
  const GREED=2;              // dalgın oyuncunun toplayan hamleye verdiği ağırlık
  const RAW_ONE_STAR=0;       // log2(emek) bu değerde 1 yıldız
  const RAW_FIVE_STARS=12;    // log2(emek) bu değerde 5 yıldız
  const EXPERT_SIGHT=3;       // usta oyuncunun önünü gördüğü hamle sayısı
  const MAX_STATES=2_000_000; // bundan büyük oyun ağacı hesaplanmaz (null döner)

  // Bölüm numarasının (1'den başlar) olması gereken zorluğu.
  //  - Temel blok: ilk 4 bölüm 1 yıldız, sonra her bölüm çeyrek yıldız artar, 20. bölüm 5 yıldız.
  //  - Özellik blokları: oyuncu artık deneyimlidir; blok 3 yıldızdan başlar, iki bölümde bir
  //    çeyrek yıldız artar ve son 4 bölüm 5 yıldızdır.
  function targetRating(levelNumber){
    const slot=(levelNumber-1)%BLOCK_SIZE+1;
    if(levelNumber<=BLOCK_SIZE)return Math.max(1,slot*STEP);
    return Math.min(5,FEATURE_START+Math.floor((slot-1)/FEATURE_PACE)*STEP);
  }
  // Bölümün tahtasında bulunması gereken özellikler (Engine.featureNames sırasıyla).
  // Bloğun kendi özelliği her bölümünde vardır. İlk SOLO_SLOTS bölüm onu tek başına tanıtır; sonra
  // önceki blokların özellikleri sırayla eşlik eder, son TRIO_SLOTS bölümde ikisi birden.
  // Bir tahtada en çok üç özellik bulunur.
  function levelFeatures(levelNumber){
    const block=Math.floor((levelNumber-1)/BLOCK_SIZE),slot=(levelNumber-1)%BLOCK_SIZE+1,own=BLOCK_FEATURES[block];
    if(!own)return [];
    const earlier=BLOCK_FEATURES.slice(0,block).filter(Boolean),chosen=[own];
    if(slot>SOLO_SLOTS&&earlier.length){
      const turn=slot-SOLO_SLOTS-1;
      chosen.push(earlier[turn%earlier.length]);
      if(slot>BLOCK_SIZE-TRIO_SLOTS&&earlier.length>1)chosen.push(earlier[(turn+1)%earlier.length]);
    }
    return Engine.featureNames.filter(name=>chosen.includes(name));
  }
  // Bir yıldız puanının log2(emek) ölçeğindeki tam karşılığı (aralığının ortası).
  function rawFromRating(rating){
    return RAW_ONE_STAR+(rating-1)*(RAW_FIVE_STARS-RAW_ONE_STAR)/4;
  }
  function ratingFromRaw(raw){
    const stars=1+4*(raw-RAW_ONE_STAR)/(RAW_FIVE_STARS-RAW_ONE_STAR);
    return Math.min(5,Math.max(1,Math.round(stars/STEP)*STEP));
  }

  // Bölümü hızlı çözülebilir tablolara çevirir. Duvar ve boşluk dışındaki kareler 0..n-1 numaralanır.
  function compile(level){
    const index=new Map(),cells=[];
    for(let r=0;r<level.height;r++)for(let c=0;c<level.width;c++){
      const id=Engine.key(r,c);
      if(level.activeSet.has(id)&&!level.wallSet.has(id)){index.set(id,cells.length);cells.push(id);}
    }
    const n=cells.length,steps=[[-1,0],[0,1],[1,0],[0,-1]];
    const neighbor=new Int8Array(n*4).fill(-1);
    cells.forEach((id,i)=>{
      const [r,c]=id.split(",").map(Number);
      steps.forEach(([dr,dc],d)=>{const j=index.get(Engine.key(r+dr,c+dc));if(j!==undefined)neighbor[i*4+d]=j;});
    });
    let valid=index.has(Engine.key(level.start[0],level.start[1]));
    const portal=new Int8Array(n).fill(-1);
    for(const [from,to] of level.portalMap){
      if(index.has(from)&&index.has(to))portal[index.get(from)]=index.get(to);else valid=false;
    }
    const gate=new Uint8Array(n);for(const id of level.gateSet)if(index.has(id))gate[index.get(id)]=1;
    const arrow=new Int8Array(n).fill(-1); // ok karesinin yönü (0 yukarı, 1 sağ, 2 aşağı, 3 sol), ok yoksa -1
    for(const [id,direction] of level.arrowMap){
      if(index.has(id)&&Engine.dirNames.includes(direction))arrow[index.get(id)]=Engine.dirNames.indexOf(direction);else valid=false;
    }
    const stop=new Uint8Array(n);
    for(const id of level.stopSet){if(index.has(id))stop[index.get(id)]=1;else valid=false;}
    const black=new Uint8Array(n);
    for(const id of level.blackSet){if(index.has(id))black[index.get(id)]=1;else valid=false;}
    // Çatlak karelerin her birine bir bit: konum, hangi çatlakların üstünden geçilerek kırıldığını da tutar
    // (çatlağın gerçekten kullanıldığını ölçmek için; oyunun kendisi için kapanmış kare yeter).
    const crackBit=new Int32Array(n);let crackCount=0;
    for(const id of level.crackSet){if(index.has(id))crackBit[index.get(id)]=1<<crackCount++;else valid=false;}
    const present=(level.portalMap.size?FEATURE_BITS.portal:0)|(level.arrowMap.size?FEATURE_BITS.arrow:0)|(level.stopSet.size?FEATURE_BITS.stop:0)
      |(level.blackSet.size?FEATURE_BITS.black:0)|(crackCount?FEATURE_BITS.crack:0);
    const starBit=new Int32Array(n),keyBit=new Int32Array(n),orderOf=new Int8Array(n).fill(-1);
    // Konum anahtarı tek sayıya sığmalı (53 bit): 6x6'ya kadar tahtalarda fazlasıyla yeter.
    if(n>64||crackCount+level.keys.length+level.stars.length+6+Math.max(0,n-32)+32>52)valid=false;
    level.stars.forEach((id,i)=>{if(index.has(id))starBit[index.get(id)]=1<<i;else valid=false;});
    level.keys.forEach((id,i)=>{if(index.has(id))keyBit[index.get(id)]=1<<i;else valid=false;});
    level.starOrder.forEach((id,i)=>{if(index.has(id))orderOf[index.get(id)]=i;});
    return {valid,n,cells,neighbor,portal,gate,arrow,stop,black,crackBit,crackCount,present,starBit,keyBit,orderOf,ordered:level.starOrder.length>0,
      starCount:level.stars.length,keyCount:level.keys.length,start:index.get(Engine.key(level.start[0],level.start[1])),
      allStars:2**level.stars.length-1,allKeys:2**level.keys.length-1};
  }
  function bitCount(x){let count=0;while(x){x&=x-1;count++;}return count;}

  // engine.js'teki slide ile aynı kural, bit maskeleriyle. Sonuç `out` içine yazılır; hamle yoksa false.
  // special: hamlenin gerçekten kullandığı özellikler (FEATURE_BITS): geçitten geçti, bir okta dönüp
  // yoluna devam etti, yoluna devam edebilecekken bir durakta kaldı ya da üstünden geçerek kırdığı bir
  // çatlakta durdu (çatlak sıradan kare olsaydı nokta yoluna devam ederdi).
  // Son yıldız alındıktan sonra olanlar sayılmaz: o noktada bölüm zaten bitmiştir.
  // broken: üstünden geçilerek kırılmış çatlaklar (L.crackBit). burned: nokta kara yıldıza değdi (bölüm kaybedildi).
  // crackUse: bu hamleyi durduran kırık çatlak(lar).
  const out={position:0,closedLow:0,closedHigh:0,stars:0,keys:0,broken:0,burned:false,collects:false,passedLow:0,passedHigh:0,looped:false,special:0,crackUse:0};
  function slideFast(L,position,closedLow,closedHigh,stars,keys,direction,broken=0){
    if(position<32)closedLow|=1<<position;else closedHigh|=1<<(position-32);
    let current=position,moved=false,collects=false,passedLow=0,passedHigh=0,looped=false,special=0,turned=false,held=false,burned=false,crackUse=0;
    for(;;){
      const next=L.neighbor[current*4+direction];if(next<0)break;
      if(next<32?(closedLow>>>next)&1:(closedHigh>>>(next-32))&1){
        if(broken&L.crackBit[next]&&stars!==0){special|=FEATURE_BITS.crack;crackUse|=L.crackBit[next];}
        break;
      }
      let open=L.keyCount>0&&keys!==L.allKeys;
      if(L.gate[next]&&!open)break;
      const turn=L.arrow[next];
      if(turn>=0){
        if(turn===(direction+2)%4)break;
        // passed maskesi bu hamlede geçilen kareleri tutar: ok ikinci kez geliyorsa döngü var demektir.
        if(next<32?(passedLow>>>next)&1:(passedHigh>>>(next-32))&1){if(!held)looped=true;break;}
      }
      const exit=L.portal[next];
      if(exit>=0&&((exit<32?(closedLow>>>exit)&1:(closedHigh>>>(exit-32))&1)||(L.gate[exit]&&!open)))break;
      // Durak: önü açık olduğu hâlde nokta girdiği durakta kalır (önü kapalıysa durak bir şey değiştirmemiştir).
      if(held){if(stars!==0)special|=FEATURE_BITS.stop;break;}
      if(moved&&L.crackBit[current]){ // üstünden geçilen çatlak arkadan kapanır
        if(current<32)closedLow|=1<<current;else closedHigh|=1<<(current-32);
        broken|=L.crackBit[current];
      }
      current=next;moved=true;
      const live=stars!==0;
      if(turned&&live)special|=FEATURE_BITS.arrow; // okta döndükten sonra en az bir kare daha gidildi
      for(let pass=0;pass<2;pass++){ // pass 0: girilen kare, pass 1: portal çıkışı
        const id=pass===0?next:exit;if(id<0)break;
        if(id<32)passedLow|=1<<id;else passedHigh|=1<<(id-32);
        if(keys&L.keyBit[id]){keys&=~L.keyBit[id];collects=true;}
        const bit=L.starBit[id];
        if(bit&stars&&(!L.ordered||L.orderOf[id]===L.starCount-bitCount(stars))){stars&=~bit;collects=true;}
      }
      if(L.black[next]){burned=true;break;}
      if(exit>=0){ // girilen geçit hemen kapanır
        if(next<32)closedLow|=1<<next;else closedHigh|=1<<(next-32);
        current=exit;if(live)special|=FEATURE_BITS.portal;
        if(L.black[exit])burned=true;
        break;
      }
      if(L.stop[next]){held=true;continue;} // hamle burada biter; döngünün başı yalnızca önünün açık olup olmadığına bakar
      if(turn>=0&&turn!==direction){direction=turn;turned=true;}
    }
    if(!moved)return false;
    out.position=current;out.closedLow=closedLow;out.closedHigh=closedHigh;out.stars=stars;out.keys=keys;out.broken=broken;out.burned=burned;
    out.collects=collects;out.passedLow=passedLow;out.passedHigh=passedHigh;out.looped=looped;out.special=special;out.crackUse=crackUse;
    return true;
  }

  // Bölümü baştan sona çözer ve ölçümleri döndürür. Bölüm bozuksa ya da oyun ağacı çok büyükse null.
  //   solvable        bölüm bitirilebilir mi
  //   unneeded        tahtadaki özelliklerden, kullanılmadan (geçitten geçmeden, okta dönmeden, durakta
  //                   kalmadan, kırık çatlakta durmadan) da bitirilebilenler; boş liste = tahtadaki her
  //                   özellik her çözümde gerekli. Kara yıldız burada sayılmaz (bkz. FEATURE_BITS).
  //   minMoves        en kısa çözümün hamle sayısı
  //   solutions       birbirinden farklı çözüm (hamle dizisi) sayısı
  //   states          oyun ağacındaki farklı konum sayısı
  //   winChance       dalgın oyuncunun tek denemede bitirme olasılığı
  //   casualEffort    1 + dalgın oyuncunun bölüm bitene kadar verdiği beklenen karar sayısı
  //   systematicEffort 1 + sistemli oyuncunun bölüm bitene kadar verdiği beklenen karar sayısı
  //   effort          ikisinden küçüğü; raw = log2(effort); rating = 1..5 (çeyrek adım)
  //   expertRaw       usta oyuncunun log2(emeği): bölümün "derin" zorluğu (blok sonu bölümleri için)
  //   used / usedCells en az bir çözümün üzerinden geçtiği kareler ve oranları
  //   usedCracks      en az bir çözümde kırılıp sonra noktayı durduran çatlaklar
  //   loops           oklar bir hamlede noktayı aynı oka geri getiriyor mu
  function analyze(level,options={}){
    const L=compile(level);if(!L.valid)return null;
    const maxStates=options.maxStates??MAX_STATES;
    const memo=new Map();
    const highFactor=2**Math.max(0,L.n-32),starFactor=2**L.starCount,keyFactor=2**L.keyCount;
    const WIN={won:true,noMoves:false,winnable:true,avoid:ALL_FEATURE_BITS,deadIn:Infinity,minMoves:0,solutions:1,chance:1,decisions:0,expertChance:1,expertDecisions:0,lines:1,depthSum:0,tries:1,work:0,usedLow:0,usedHigh:0,usedCracks:0};
    // Kara yıldıza değen hamlenin sonu: bölüm kaybedildi (yapacak hamlesi olmayan konum gibi).
    const BURNED={won:false,noMoves:true,winnable:false,avoid:0,deadIn:0,minMoves:Infinity,solutions:0,chance:0,decisions:0,expertChance:0,expertDecisions:0,lines:1,depthSum:0,tries:0,work:0,usedLow:0,usedHigh:0,usedCracks:0};
    let states=0,tooBig=false,loops=false;
    function solve(position,closedLow,closedHigh,stars,keys,broken){
      if(stars===0)return WIN;
      const id=(((((broken*keyFactor+keys)*starFactor+stars)*64+position)*highFactor+(closedHigh>>>0))*4294967296)+(closedLow>>>0);
      let node=memo.get(id);if(node)return node;
      node={won:false,noMoves:true,winnable:false,avoid:0,deadIn:0,minMoves:Infinity,solutions:0,chance:0,decisions:0,expertChance:0,expertDecisions:0,lines:1,depthSum:0,tries:0,work:0,usedLow:0,usedHigh:0,usedCracks:0};
      memo.set(id,node);
      if(++states>maxStates){tooBig=true;return node;}
      const choices=[];
      for(let direction=0;direction<4;direction++){
        if(!slideFast(L,position,closedLow,closedHigh,stars,keys,direction,broken))continue;
        const collects=out.collects,passedLow=out.passedLow,passedHigh=out.passedHigh,special=out.special,crackUse=out.crackUse;
        if(out.looped)loops=true;
        const child=out.burned?BURNED:solve(out.position,out.closedLow,out.closedHigh,out.stars,out.keys,out.broken);
        if(tooBig)return node;
        node.noMoves=false;node.deadIn=Math.max(node.deadIn,child.deadIn+1);
        node.avoid|=child.avoid&~special; // avoid: hangi özellikler hiç kullanılmadan buradan kazanılabilir
        if(child.winnable){
          node.winnable=true;node.minMoves=Math.min(node.minMoves,child.minMoves+1);node.solutions+=child.solutions;
          node.usedLow|=passedLow|child.usedLow;node.usedHigh|=passedHigh|child.usedHigh;node.usedCracks|=crackUse|child.usedCracks;
        }
        if(!child.noMoves)choices.push(child,collects); // sıkışılan kare aday değildir
      }
      if(choices.length===0)return node; // görünür çıkmaz: bu deneme burada biter
      // Usta oyuncu: dalgın oyuncu gibi oynar ama EXPERT_SIGHT hamle ilerisini görür; o kadar hamlede
      // kesin biten yollara girmez. Yalnızca geç ortaya çıkan (derin) tuzaklar onu yanıltır.
      let expertWinners=0,expertCount=0,expertWeight=0;
      for(let i=0;i<choices.length;i+=2)if(choices[i].deadIn>=EXPERT_SIGHT){
        expertCount++;expertWeight+=choices[i+1]?GREED:1;if(choices[i].winnable)expertWinners++;
      }
      node.expertDecisions=expertCount>1&&expertWinners<expertCount?1:0;
      for(let i=0;i<choices.length;i+=2)if(choices[i].deadIn>=EXPERT_SIGHT){
        const weight=(choices[i+1]?GREED:1)/expertWeight;
        node.expertChance+=weight*choices[i].expertChance;node.expertDecisions+=weight*choices[i].expertDecisions;
      }
      let winners=0,weightSum=0;
      for(let i=0;i<choices.length;i+=2){if(choices[i].winnable)winners++;weightSum+=choices[i+1]?GREED:1;}
      // Karar: birden çok aday var ve en az biri çıkmaza götürüyor. Tek adaylı (mecburi) ya da
      // hangisi seçilirse seçilsin kazandıran hamleler düşünmeyi gerektirmez, emek sayılmaz.
      const cost=choices.length>2&&winners<choices.length/2?1:0;
      // Dalgın oyuncu: chance = bu konumdan kazanma olasılığı, decisions = deneme bitene kadar verilen karar.
      node.decisions=cost;
      for(let i=0;i<choices.length;i+=2){
        const weight=(choices[i+1]?GREED:1)/weightSum;
        node.chance+=weight*choices[i].chance;node.decisions+=weight*choices[i].decisions;
      }
      // Sistemli oyuncu. lines/depthSum: bu konumun altındaki bütün yolların sayısı ve içerdikleri toplam karar.
      // tries/work: çözüme varana kadar denenen yol sayısı ve verilen karar (maliyet = tries*derinlik + work).
      let deadLines=0,deadDepth=0,triesSum=0,workSum=0;
      node.lines=0;
      for(let i=0;i<choices.length;i+=2){
        const child=choices[i];
        node.lines+=child.lines;node.depthSum+=child.depthSum+cost*child.lines;
        if(child.winnable){triesSum+=child.tries;workSum+=cost*child.tries+child.work;}
        else{deadLines+=child.lines;deadDepth+=child.depthSum+cost*child.lines;}
      }
      if(winners){
        node.tries=deadLines/(winners+1)+triesSum/winners;
        node.work=deadDepth/(winners+1)+workSum/winners;
      }
      return node;
    }
    const rootNode=solve(L.start,0,0,L.allStars,L.allKeys,0);
    if(tooBig)return null;
    const unneeded=Engine.featureNames.filter(name=>FEATURE_BITS[name]&USE_BITS&L.present&rootNode.avoid);
    const result={solvable:rootNode.winnable,unneeded,states,cells:L.n,loops,minMoves:null,solutions:0,winChance:0,
      casualEffort:Infinity,systematicEffort:Infinity,effort:Infinity,raw:null,rating:null,expertRaw:null,usedCells:0,used:null};
    if(!rootNode.winnable)return result;
    result.minMoves=rootNode.minMoves;result.solutions=rootNode.solutions;result.winChance=rootNode.chance;
    result.casualEffort=1+rootNode.decisions/rootNode.chance;
    result.systematicEffort=1+rootNode.work;
    result.effort=Math.min(result.casualEffort,result.systematicEffort);
    result.raw=Math.log2(result.effort);
    result.rating=ratingFromRaw(result.raw);
    result.expertRaw=Math.log2(1+rootNode.expertDecisions/rootNode.expertChance);
    result.used=new Set(L.cells.filter((id,i)=>i===L.start||(i<32?(rootNode.usedLow>>>i)&1:(rootNode.usedHigh>>>(i-32))&1)));
    result.usedCells=result.used.size/L.n;
    result.usedCracks=new Set(L.cells.filter((id,i)=>L.crackBit[i]&rootNode.usedCracks));
    return result;
  }
  // Bölümün yıldız puanı (1–5, çeyrek adım). Çözümsüz ya da hesaplanamayan bölümde null.
  function rate(level){
    const result=analyze(level);
    return result&&result.solvable?result.rating:null;
  }

  const api={BLOCK_FEATURES,BLOCK_SIZE,STEP,GREED,RAW_ONE_STAR,RAW_FIVE_STARS,FEATURE_BITS,targetRating,levelFeatures,ratingFromRaw,rawFromRating,analyze,rate,compile,slideFast,slideResult:out};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.SonHamleDifficulty=api;
})(typeof globalThis!=="undefined"?globalThis:this);
