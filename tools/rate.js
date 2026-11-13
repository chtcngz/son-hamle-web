"use strict";
// Bölümlerin zorluğunu hesaplar ve hedef eğriyle karşılaştırır.
//   node tools/rate.js                 bütün bölümlerin tablosu
//   node tools/rate.js --draw 21,22    seçilen bölümleri tahtasıyla birlikte göster
//   node tools/rate.js --write         hesaplanan puanı dosyadaki difficultyRating alanına yaz
//   node tools/rate.js baska.json      başka bir bölüm dosyasını puanla
const {LEVELS_FILE,readLevels,writeLevels,blockFeature,inspect,draw,starText}=require("./levels-file.js");
const {misfit}=require("./generate.js"),Difficulty=require("../difficulty.js");

const args=process.argv.slice(2);
const write=args.includes("--write");
const drawIndex=args.indexOf("--draw");
const drawn=drawIndex<0?null:new Set((args[drawIndex+1]??"").split(",").map(Number));
const file=args.find((arg,i)=>!arg.startsWith("--")&&(drawIndex<0||i!==drawIndex+1))??LEVELS_FILE;
const featureNames={portal:"geçit",gate:"kapı",order:"sıra"};

const levels=readLevels(file);
if(!levels.length){console.error(`${file}: bölüm yok`);process.exit(1);}
let mismatches=0;
console.log("Bölüm  Özellik  Tahta  Yıldız  Hamle  Çözüm   Şans    Zorluk  Hedef");
levels.forEach((rawLevel,i)=>{
  const number=i+1,found=inspect(rawLevel),{level,feature,analysis}=found;
  const solved=analysis&&analysis.solvable,rating=solved?analysis.rating:null,target=Difficulty.targetRating(number);
  const problem=misfit(rawLevel,blockFeature(number),target,found);
  if(problem)mismatches++;
  if(!drawn||drawn.has(number)){
    console.log([String(number).padStart(4)+" ",(featureNames[feature]??"temel").padEnd(7),`${level.width}x${level.height}`.padEnd(5),
      String(level.stars.length).padStart(4)+"  ",String(solved?analysis.minMoves:"–").padStart(4)+" ",
      String(solved?analysis.solutions:0).padStart(5),(solved?(analysis.winChance*100).toFixed(1)+"%":"–").padStart(7),
      " "+starText(rating)+"  ",target.toFixed(2),problem?" ← "+problem:""].join("  "));
    if(drawn)console.log(draw(rawLevel));
  }
  if(write&&solved)rawLevel.difficultyRating=rating;
});
console.log(mismatches?`${mismatches} bölüm hedef eğriye uymuyor (← işaretliler). Düzeltmek için: node tools/generate.js`:"Bütün bölümler hedef eğride.");
if(write){writeLevels(levels,file);console.log("difficultyRating alanları güncellendi.");}
