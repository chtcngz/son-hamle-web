"use strict";
// Son Hamle oyun kuralları. Hem oyun (app.js) hem zorluk hesabı (difficulty.js)
// hem de Node araçları (tools/) aynı dosyayı kullanır; kural tek yerde durur.
(function(root){
  const dirs = {Up:[-1,0],Right:[0,1],Down:[1,0],Left:[0,-1]};
  const dirNames = Object.keys(dirs);
  const key = (r,c) => `${r},${c}`;
  const pointKey = p => key(p.row,p.column);

  function normalizeLevel(l){
    const portals=l.portals??[];
    return {...l,activeSet:new Set(l.activeCells.map(pointKey)),wallSet:new Set(l.walls.map(pointKey)),
      gateSet:new Set((l.gates??[]).map(pointKey)),keys:(l.keys??[]).map(pointKey),
      portalMap:portals.length===2?new Map([[pointKey(portals[0]),pointKey(portals[1])],[pointKey(portals[1]),pointKey(portals[0])]]):new Map(),
      arrowMap:new Map((l.arrows??[]).map(arrow=>[pointKey(arrow),arrow.direction])),
      stopSet:new Set((l.stops??[]).map(pointKey)),
      blackSet:new Set((l.blackStars??[]).map(pointKey)),crackSet:new Set((l.cracks??[]).map(pointKey)),
      stars:l.stars.map(pointKey),starOrder:(l.starOrder??[]).map(pointKey),start:[l.start.row,l.start.column]};
  }
  // Bölümün tahtasındaki özellikler, hep aynı sırayla: "portal" (geçit), "arrow" (ok), "stop" (durak),
  // "black" (kara yıldız), "crack" (çatlak kare), "gate" (kapı-anahtar), "order" (sıralı yıldız).
  // Temel bölümde liste boştur.
  const featureNames=["portal","arrow","stop","black","crack","gate","order"];
  function featuresOf(level){
    const present={portal:level.portalMap.size,arrow:level.arrowMap.size,stop:level.stopSet.size,black:level.blackSet.size,
      crack:level.crackSet.size,gate:level.keys.length,order:level.starOrder.length};
    return featureNames.filter(name=>present[name]);
  }
  // burned: nokta bir kara yıldıza değdi; bölüm kaybedildi.
  function initialState(level){return {position:[...level.start],closed:new Set(),stars:new Set(level.stars),keys:new Set(level.keys),orderIndex:0,moves:0,burned:false};}
  function copyState(s){return {position:[...s.position],closed:new Set(s.closed),stars:new Set(s.stars),keys:new Set(s.keys),orderIndex:s.orderIndex,moves:s.moves,burned:s.burned};}
  // Bölüm kazanıldı mı: bütün yıldızlar toplandı ve nokta kara yıldıza değmedi.
  function won(s){return s.stars.size===0&&!s.burned;}
  function active(level,r,c){return r>=0&&r<level.height&&c>=0&&c<level.width&&level.activeSet.has(key(r,c));}
  function openGate(level,s){return level.keys.length>0&&s.keys.size<level.keys.length;}
  function visit(level,s,id){
    s.keys.delete(id);
    if(s.stars.has(id)&&(!level.starOrder.length||level.starOrder[s.orderIndex]===id)){
      s.stars.delete(id);
      if(level.starOrder.length)s.orderIndex++;
    }
  }
  // Bir hamle: nokta o yönde son açık kareye kayar, ayrıldığı kare kapanır.
  //  - Geçit: girilen geçit hemen kapanır, nokta eşinden çıkar ve hamle biter.
  //  - Ok: giren nokta okun yönüne döner ve kaymayı sürdürür. Oka karşıdan girilmez (duvar gibidir);
  //    aynı hamlede bir oktan ikinci kez geçilmez (oklar noktayı sonsuz döngüye sokamaz).
  //  - Durak: giren nokta orada durur ve hamle biter; üstünden kayıp geçilmez. Duraktan her yöne
  //    çıkılır ve ayrılınan durak da her kare gibi kapanır.
  //  - Kara yıldız: üstüne gelen nokta (kayarken, okla dönerek ya da geçitten çıkarak) orada yanar;
  //    hamle biter ve bölüm kaybedilir. Kara yıldız durdurucu değildir: nokta ona kadar kayar.
  //  - Çatlak kare: nokta üstünden kayıp geçerse kare arkasından hemen kapanır. Nokta çatlak karede
  //    durursa kare açık kalır; oradan ayrılınca her kare gibi kapanır.
  // Hamle yapılamıyorsa (ya da bölüm bitmişse) null döner.
  function slide(level,s,dir){
    if(s.stars.size===0||s.burned)return null;
    let [dr,dc]=dirs[dir],[r,c]=s.position;
    const after=copyState(s);after.closed.add(key(r,c));
    const passedArrows=new Set();
    let moved=false;
    while(active(level,r+dr,c+dc)){
      const next=key(r+dr,c+dc);
      if(level.wallSet.has(next)||after.closed.has(next)||(level.gateSet.has(next)&&!openGate(level,after)))break;
      const arrow=level.arrowMap.get(next);
      if(arrow&&(passedArrows.has(next)||(dirs[arrow][0]===-dr&&dirs[arrow][1]===-dc)))break;
      const exit=level.portalMap.get(next);
      if(exit&&(after.closed.has(exit)||level.wallSet.has(exit)||(level.gateSet.has(exit)&&!openGate(level,after))))break;
      if(moved&&level.crackSet.has(key(r,c)))after.closed.add(key(r,c)); // üstünden geçilen çatlak kırılır
      r+=dr;c+=dc;moved=true;visit(level,after,next);
      if(level.blackSet.has(next)){after.burned=true;break;}
      if(exit){
        after.closed.add(next);
        visit(level,after,exit);
        [r,c]=exit.split(",").map(Number);
        if(level.blackSet.has(exit))after.burned=true;
        break;
      }
      if(level.stopSet.has(next))break;
      if(arrow){passedArrows.add(next);[dr,dc]=dirs[arrow];}
    }
    if(!moved)return null;
    after.position=[r,c];after.moves++;
    return after;
  }
  function hasMove(level,s){return dirNames.some(dir=>slide(level,s,dir)!==null);}

  const api={dirs,dirNames,key,pointKey,normalizeLevel,featureNames,featuresOf,initialState,copyState,won,openGate,slide,hasMove};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.SonHamleEngine=api;
})(typeof globalThis!=="undefined"?globalThis:this);
