"use strict";
// Bölüm dosyasını okuma/yazma ve tahtayı metin olarak çizme: araçların ortak kısmı.
const fs=require("fs"),path=require("path");
const Engine=require("../engine.js"),Difficulty=require("../difficulty.js");

const LEVELS_FILE=path.join(__dirname,"..","levels-v6.json");

function readLevels(file=LEVELS_FILE){
  return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")):[];
}
// Her bölüm tek satır: değişiklikler diff'te bölüm bölüm okunur.
function writeLevels(levels,file=LEVELS_FILE){
  fs.writeFileSync(file,"[\n"+levels.map(level=>JSON.stringify(level)).join(",\n")+"\n]\n");
}
function blockFeature(number){
  return Difficulty.BLOCK_FEATURES[Math.floor((number-1)/Difficulty.BLOCK_SIZE)]??null;
}
// Ham bölümü çözer; sonucu ve kullandığı özelliği döndürür.
function inspect(rawLevel,options){
  const level=Engine.normalizeLevel(rawLevel);
  return {level,feature:Engine.featureOf(level),analysis:Difficulty.analyze(level,options)};
}
// @ başlangıç, * yıldız (sıralıysa numarası), O geçit, # duvar, G kapı, k anahtar, boşluk = tahta dışı
function draw(rawLevel){
  const level=Engine.normalizeLevel(rawLevel),rows=[];
  for(let r=0;r<level.height;r++){
    let row="";
    for(let c=0;c<level.width;c++){
      const id=Engine.key(r,c);
      row+=!level.activeSet.has(id)?" ":level.wallSet.has(id)?"#":r===level.start[0]&&c===level.start[1]?"@"
        :level.stars.includes(id)?(level.starOrder.length?String(level.starOrder.indexOf(id)+1):"*")
        :level.portalMap.has(id)?"O":level.gateSet.has(id)?"G":level.keys.includes(id)?"k":".";
    }
    rows.push("  |"+row+"|");
  }
  return rows.join("\n");
}
const starText=rating=>rating===null?"  –  ":rating.toFixed(2);

module.exports={LEVELS_FILE,readLevels,writeLevels,blockFeature,inspect,draw,starText};
