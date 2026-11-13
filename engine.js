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
      stars:l.stars.map(pointKey),starOrder:(l.starOrder??[]).map(pointKey),start:[l.start.row,l.start.column]};
  }
  // Bölümün kullandığı özellik: "gate" | "portal" | "order" | null (temel bölüm).
  function featureOf(level){
    return level.keys.length?"gate":level.portalMap.size?"portal":level.starOrder.length?"order":null;
  }
  function initialState(level){return {position:[...level.start],closed:new Set(),stars:new Set(level.stars),keys:new Set(level.keys),orderIndex:0,moves:0};}
  function copyState(s){return {position:[...s.position],closed:new Set(s.closed),stars:new Set(s.stars),keys:new Set(s.keys),orderIndex:s.orderIndex,moves:s.moves};}
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
  // Hamle yapılamıyorsa (ya da bölüm bitmişse) null döner.
  function slide(level,s,dir){
    if(s.stars.size===0)return null;
    const [dr,dc]=dirs[dir];let [r,c]=s.position;
    const after=copyState(s);after.closed.add(key(r,c));
    let moved=false;
    while(active(level,r+dr,c+dc)){
      const next=key(r+dr,c+dc);
      if(level.wallSet.has(next)||after.closed.has(next)||(level.gateSet.has(next)&&!openGate(level,after)))break;
      const exit=level.portalMap.get(next);
      if(exit&&(after.closed.has(exit)||level.wallSet.has(exit)||(level.gateSet.has(exit)&&!openGate(level,after))))break;
      r+=dr;c+=dc;moved=true;visit(level,after,next);
      if(exit){
        visit(level,after,exit);
        [r,c]=exit.split(",").map(Number);
        break;
      }
    }
    if(!moved)return null;
    after.position=[r,c];after.moves++;
    return after;
  }
  function hasMove(level,s){return dirNames.some(dir=>slide(level,s,dir)!==null);}

  const api={dirs,dirNames,key,pointKey,normalizeLevel,featureOf,initialState,copyState,openGate,slide,hasMove};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.SonHamleEngine=api;
})(typeof globalThis!=="undefined"?globalThis:this);
