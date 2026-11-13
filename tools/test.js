"use strict";
// Zorluk hesabındaki hızlı çözücünün oyun kurallarıyla (engine.js) birebir aynı
// oynadığını ve bölüm dosyasının hedef eğriye uyduğunu doğrular.
//   node tools/test.js [bölüm dosyası ...]
const path=require("path");
const Engine=require("../engine.js"),Difficulty=require("../difficulty.js");
const {LEVELS_FILE,readLevels,blockFeature,inspect}=require("./levels-file.js"),{misfit}=require("./generate.js");

function fail(message){console.error("HATA: "+message);process.exitCode=1;}

// Rastgele oyunlarda her hamleyi iki uygulamayla da oynar ve sonuçları karşılaştırır.
function crossCheck(level,label,playouts=200){
  const L=Difficulty.compile(level);
  if(!L.valid)return fail(`${label}: bölüm derlenemedi`);
  const indexOf=new Map(L.cells.map((id,i)=>[id,i]));
  const mask=ids=>{let low=0,high=0;for(const id of ids){const i=indexOf.get(id);if(i<32)low|=1<<i;else high|=1<<(i-32);}return [low,high];};
  let seed=12345;const random=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
  for(let game=0;game<playouts;game++){
    let state=Engine.initialState(level);
    while(state.stars.size){ // yıldızlar bitince oyun da biter
      const [low,high]=mask(state.closed);
      let stars=0,keys=0;
      level.stars.forEach((id,i)=>{if(state.stars.has(id))stars|=1<<i;});
      level.keys.forEach((id,i)=>{if(state.keys.has(id))keys|=1<<i;});
      const position=indexOf.get(Engine.key(...state.position));
      const next=[];
      Engine.dirNames.forEach((dir,d)=>{
        const slow=Engine.slide(level,state,dir);
        const fast=Difficulty.slideFast(L,position,low,high,stars,keys,d);
        if(!slow!==!fast)return fail(`${label}: ${dir} hamlesi iki uygulamada farklı (var/yok)`);
        if(!slow)return;
        const result=Difficulty.slideResult;
        const [slowLow,slowHigh]=mask(slow.closed);
        let slowStars=0,slowKeys=0;
        level.stars.forEach((id,i)=>{if(slow.stars.has(id))slowStars|=1<<i;});
        level.keys.forEach((id,i)=>{if(slow.keys.has(id))slowKeys|=1<<i;});
        if(indexOf.get(Engine.key(...slow.position))!==result.position||slowLow!==result.closedLow||slowHigh!==result.closedHigh||slowStars!==result.stars||slowKeys!==result.keys)
          fail(`${label}: ${dir} hamlesinin sonucu iki uygulamada farklı`);
        next.push(slow);
      });
      if(!next.length||process.exitCode)break;
      state=next[Math.floor(random()*next.length)];
    }
    if(process.exitCode)return;
  }
}

const files=process.argv.slice(2);
if(!files.length)files.push(LEVELS_FILE);
for(const file of files){
  const levels=readLevels(file),isShipped=path.resolve(file)===LEVELS_FILE,name=path.basename(file);
  if(!levels.length)fail(`${name}: bölüm yok`);
  levels.forEach((rawLevel,i)=>{
    const number=i+1,label=`${name} bölüm ${number}`,found=inspect(rawLevel);
    crossCheck(found.level,label);
    if(!isShipped)return; // oyunun kendi dosyası ayrıca hedef eğriye de uymalı
    const target=Difficulty.targetRating(number),problem=misfit(rawLevel,blockFeature(number),target,found);
    if(problem)return fail(`${label}: ${problem}`);
    if(rawLevel.difficultyRating!==target)fail(`${label}: dosyadaki difficultyRating (${rawLevel.difficultyRating}) hesaplananla (${target}) aynı değil; node tools/rate.js --write çalıştır`);
  });
  if(isShipped&&levels.length!==Difficulty.BLOCK_FEATURES.length*Difficulty.BLOCK_SIZE)fail(`${name}: ${levels.length} bölüm var, ${Difficulty.BLOCK_FEATURES.length*Difficulty.BLOCK_SIZE} olmalı`);
  if(!process.exitCode)console.log(`${name}: ${levels.length} bölüm tamam`);
}
