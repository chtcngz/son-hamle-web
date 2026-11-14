"use strict";
// Son Hamle deneme odası: yeni fikirlerin kuralları tek motorda.
//
// Ana oyunun temel kuralı aynen geçerlidir: nokta seçilen yönde son açık kareye kadar kayar, hamleye
// başladığı kare kapanır, yolundaki yıldızları toplar. Bu dosya o kuralın üstüne denenecek fikirleri ekler:
//
//  Kareler (her tahtada):
//   black      kara yıldız: üstüne gelen top yanar, bölüm kaybedilir.
//   cracks     çatlak kare: üstünden kayıp geçilince arkadan kapanır.
//   exit       çıkış: yıldızlar bitince açılır; top içine girince bölüm biter. Çıkış kapanırsa kaybedilir.
//   paint      boya: üstünden geçilen her kare boyanır; amaç bütün tahtayı boyamak (yıldız yok).
//   switches   şalter: üstünden geçince kırmızı duvarlar iner, mavi duvarlar kalkar (ya da tersi).
//   mirrors    eğik ayna (/ ya da \): topu geldiği yöne göre 90° çevirir. Bir hamlede aynı aynadan iki kez geçilmez.
//   wrapRows / wrapCols   tünel: bu satır/sütunda tahtanın bir kenarından çıkan top karşı kenardan girer.
//   stones     taş: top taşa çarpınca durur, taş aynı yöne kayar. Taşa bitişik top da taşı itebilir.
//   permanent  kalıcı kare: ayrılınca kapanmaz.
//   rotators   döndürme karesi: hamle bitince tahta saat yönünde 90° döner; yönler ekrana göre okunur.
//   closed     bölüm başında kapalı kareler ("son hamleyi bul").
//
//  Bölüm biçimleri (mode):
//   classic    tek tahta, tek top (grid "hex" ise altıgen tahta, 6 yön).
//   twin       iki tahta, tek hamle iki topu birden oynatır. couple: same (aynı yön), mirror (sağ-sol ters),
//              reverse (ters yön), echo (ikinci top bir önceki hamleni yapar). Hareket edemeyen top yerinde
//              kalır ve karesi kapanmaz. Yıldızları biten tahtanın topu durur; sync ise iki tahtanın son
//              yıldızları aynı hamlede alınmalıdır (biri erken biterse kaybedilir).
//   duo        tek tahtada iki top: ikisi de aynı yöne kayar, birbirine çarpınca durur. Öndeki top önce
//              kayar; ayrıldığı kare hemen kapandığı için arkadaki onun eski yerinden geçemez.
//   chain      zincir: odalar sırayla oynanır. Bir odanın yıldızları bitince top aynı satır/sütundan bir
//              sonraki odaya geçer; orası duvar ya da tahta dışıysa kaybedilir.
//   designer   tasarımcı: hamle sırası verilir; oyuncu önce designerWalls kadar duvar koyar, sonra sıra oynatılır.
//              Hareket edemeyen hamle atlanır. Sıra bitmeden yıldızlar biterse kazanılır.
//   pocket     (classic ile birlikte) cebindeki duvar sayısı: istediğin an boş bir kareye duvar koyabilirsin.
//
// Koordinatlar [satır, sütun]. Altıgen tahtada [satır, eksen sütunu] (sivri tepeli altıgen, eksenel koordinat).
(function(root){
  const SQUARE=[[-1,0],[0,1],[1,0],[0,-1]];                        // 0 yukarı, 1 sağ, 2 aşağı, 3 sol
  const HEX=[[0,1],[1,0],[1,-1],[0,-1],[-1,0],[-1,1]];             // 0 doğu, 1 güneydoğu, 2 güneybatı, 3 batı, 4 kuzeybatı, 5 kuzeydoğu
  const SQUARE_NAMES=["Up","Right","Down","Left"],HEX_NAMES=["E","SE","SW","W","NW","NE"];
  const MIRROR_TURN={"/":[1,0,3,2],"\\":[3,2,1,0]};
  const PLACE=1000,PLAY=999;                                       // eylem kodları: duvar koy (PLACE+kare), sırayı oynat
  const key=(r,c)=>r+","+c;
  const bit=i=>i<32?[1<<i,0]:[0,1<<(i-32)];
  const closedAt=(s,i)=>i<32?(s.lo>>>i)&1:(s.hi>>>(i-32))&1;
  function close(s,i){if(i<32)s.lo|=1<<i;else s.hi|=1<<(i-32);}
  function open(s,i){if(i<32)s.lo&=~(1<<i);else s.hi&=~(1<<(i-32));}
  const paintedAt=(s,i)=>i<32?(s.plo>>>i)&1:(s.phi>>>(i-32))&1;
  function paint(s,i){if(i<32)s.plo|=1<<i;else s.phi|=1<<(i-32);}

  // Bir tahtayı hızlı oynanacak tablolara çevirir.
  function compileBoard(raw,grid){
    const steps=grid==="hex"?HEX:SQUARE,D=steps.length;
    const walls=new Set((raw.walls??[]).map(([r,c])=>key(r,c)));
    const cells=[...raw.cells].sort((a,b)=>a[0]-b[0]||a[1]-b[1]).filter(([r,c])=>!walls.has(key(r,c)));
    const index=new Map(cells.map(([r,c],i)=>[key(r,c),i])),n=cells.length;
    if(n>64)throw Error("tahtada en çok 64 açık kare olabilir");
    const at=([r,c])=>{const i=index.get(key(r,c));if(i===undefined)throw Error(`${r},${c} tahtada açık kare değil`);return i;};
    const wrapRows=new Set(raw.wrapRows??[]),wrapCols=new Set(raw.wrapCols??[]);
    const nb=new Int16Array(n*D).fill(-1);
    cells.forEach(([r,c],i)=>steps.forEach(([dr,dc],d)=>{
      let rr=r+dr,cc=c+dc;
      if(grid!=="hex"){ // tünel: kutunun kenarından çıkan karşı kenardan girer
        if((cc<0||cc>=raw.width)&&wrapRows.has(r))cc=(cc+raw.width)%raw.width;
        if((rr<0||rr>=raw.height)&&wrapCols.has(c))rr=(rr+raw.height)%raw.height;
      }
      const j=index.get(key(rr,cc));if(j!==undefined)nb[i*D+d]=j;
    }));
    const flags=list=>{const a=new Uint8Array(n);for(const p of list??[])a[at(p)]=1;return a;};
    const starBit=new Int32Array(n);(raw.stars??[]).forEach((p,i)=>{starBit[at(p)]=1<<i;});
    const mirror=new Uint8Array(n);for(const [r,c,t] of raw.mirrors??[])mirror[at([r,c])]=t==="/"?1:2;
    let allLo=0,allHi=0;for(let i=0;i<n;i++){const [l,h]=bit(i);allLo|=l;allHi|=h;}
    const pre={lo:0,hi:0};for(const p of raw.closed??[])close(pre,at(p));
    return {raw,grid,D,n,cells,index,nb,at,starBit,allStars:(1<<(raw.stars??[]).length)-1,
      black:flags(raw.black),crack:flags(raw.cracks),sw:flags(raw.switches),red:flags(raw.red),blue:flags(raw.blue),
      permanent:flags(raw.permanent),rotator:flags(raw.rotators),mirror,
      exit:raw.exit?at(raw.exit):-1,paint:Boolean(raw.paint),allLo:allLo|0,allHi:allHi|0,
      start:raw.start?at(raw.start):-1,start2:raw.start2?at(raw.start2):-1,
      stones:(raw.stones??[]).map(at).sort((a,b)=>a-b),preLo:pre.lo,preHi:pre.hi};
  }
  function boardStart(B){
    const s={p:B.start,q:B.start2,lo:B.preLo,hi:B.preHi,stars:B.allStars,tog:0,plo:0,phi:0,rot:0,stones:B.stones};
    if(B.paint){if(s.p>=0)paint(s,s.p);}
    return s;
  }
  const copyBoard=s=>({...s});
  const wallNow=(B,s,i)=>(B.red[i]&&!s.tog)||(B.blue[i]&&s.tog);

  // Tek topu kaydırır (s değiştirilir). which: "p" ya da "q"; other: öteki topun karesi (yoksa -1).
  // Dönen değer: 0 hamle yok, 1 top kaydı, 2 top kımıldamadı ama bir taşı itti. ctx: toplama/kayıp/döndürme bilgisi.
  function slideBall(B,s,which,d,other,ctx){
    const D=B.D,start=s[which];
    if(start<0)return 0;
    let cur=start,moved=false,pushed=false,passedMirrors=null;
    const keepOrigin=B.permanent[start];
    if(!keepOrigin)close(s,start);
    for(;;){
      const next=B.nb[cur*D+d];
      if(next<0||closedAt(s,next)||next===other||wallNow(B,s,next))break;
      if(s.stones.length&&s.stones.includes(next)){ // taş: top durur, taş aynı yöne kayar
        let t=next;
        for(;;){
          const u=B.nb[t*D+d];
          if(u<0||closedAt(s,u)||u===other||s.stones.includes(u)||wallNow(B,s,u))break;
          t=u;
        }
        if(t!==next){s.stones=s.stones.map(x=>x===next?t:x).sort((a,b)=>a-b);pushed=true;ctx.pushed=true;}
        break;
      }
      if(B.mirror[next]&&passedMirrors&&passedMirrors.includes(next))break;
      if(moved&&B.crack[cur]){close(s,cur);ctx.cracked=true;} // üstünden geçilen çatlak kırılır
      cur=next;moved=true;
      const star=B.starBit[cur];
      if(star&s.stars){s.stars&=~star;ctx.collects=true;}
      if(B.paint&&!paintedAt(s,cur)){paint(s,cur);ctx.collects=true;}
      if(B.black[cur]){ctx.lost="black";break;}
      if(cur===B.exit&&s.stars===0){ctx.exited=true;break;}
      if(B.sw[cur]){s.tog^=1;ctx.toggled=true;}
      if(B.rotator[cur])ctx.rotations=(ctx.rotations??0)+1;
      if(B.mirror[cur]){(passedMirrors??=[]).push(cur);d=MIRROR_TURN[B.mirror[cur]===1?"/":"\\"][d];}
    }
    if(!moved){if(!keepOrigin)open(s,start);return pushed?2:0;}
    s[which]=cur;
    return 1;
  }

  // Bir tahtanın bu hamledeki sonucu: yıldız bitti mi, boya bitti mi, çıkış kapandı mı.
  const boardDone=(B,s)=>B.paint?(s.plo|0)===B.allLo&&(s.phi|0)===B.allHi:B.exit>=0?false:s.stars===0;

  function makeGame(level){
    const grid=level.grid??"square",mode=level.mode??"classic";
    const boards=level.boards.map(raw=>compileBoard(raw,grid)),D=boards[0].D;
    const names=grid==="hex"?HEX_NAMES:SQUARE_NAMES;
    const sequence=(level.sequence??[]).map(name=>SQUARE_NAMES.indexOf(name));
    const couple=level.couple??"same";
    const mapDir=d=>couple==="mirror"?(d===1?3:d===3?1:d):couple==="reverse"?(d+2)%4:d;

    function start(){
      return {b:boards.map(boardStart),room:0,last:-1,pocket:level.pocket??0,dw:[],placed:[],moves:0,won:false,lost:null};
    }
    const copy=G=>({...G,b:G.b.slice(),dw:G.dw,placed:G.placed});
    function eligibleForWall(B,s,i){
      return i!==s.p&&i!==s.q&&!closedAt(s,i)&&!(B.starBit[i]&s.stars)&&i!==B.exit&&!s.stones.includes(i)&&!B.black[i];
    }
    function actions(G){
      if(G.won||G.lost)return [];
      if(mode==="designer"){
        if(G.dw.length===level.designerWalls)return [PLAY];
        const B=boards[0],s=G.b[0],from=G.dw.length?G.dw[G.dw.length-1]+1:0,list=[];
        for(let i=from;i<B.n;i++)if(eligibleForWall(B,s,i))list.push(PLACE+i);
        return list;
      }
      const list=Array.from({length:D},(_,d)=>d);
      if(G.pocket>0){const B=boards[0],s=G.b[0];for(let i=0;i<B.n;i++)if(eligibleForWall(B,s,i))list.push(PLACE+i);}
      return list;
    }
    // Bir eylemi uygular; geçersizse null. Dönüş: {state, collects}.
    function apply(G,a){
      if(G.won||G.lost)return null;
      const ctx={};
      let N=copy(G);
      if(a>=PLACE){ // cepteki ya da tasarımcının duvarı
        const B=boards[0],s=copyBoard(G.b[0]),i=a-PLACE;
        if(mode==="designer"){
          if(G.dw.length>=level.designerWalls||!eligibleForWall(B,s,i)||(G.dw.length&&i<=G.dw[G.dw.length-1]))return null;
          N.dw=[...G.dw,i];return {state:N,collects:false};
        }
        if(G.pocket<=0||!eligibleForWall(B,s,i))return null;
        close(s,i);N.b=[s];N.pocket=G.pocket-1;N.placed=[...G.placed,i];N.moves++;
        return {state:N,collects:false};
      }
      if(a===PLAY){
        if(mode!=="designer"||G.dw.length!==level.designerWalls)return null;
        const result=playSequence(G.dw);
        N={...N,b:[result.frames[result.frames.length-1]],won:result.won,lost:result.won?null:"designer",moves:result.frames.length-1};
        return {state:N,collects:result.won};
      }
      if(a<0||a>=D)return null;
      if(mode==="classic"){
        const B=boards[0],s=copyBoard(G.b[0]);
        const d=s.rot?(a-s.rot+4)%4:a;
        if(!slideBall(B,s,"p",d,-1,ctx))return null;
        if(ctx.rotations)s.rot=(s.rot+ctx.rotations)%4;
        N.b=[s];N.moves++;
        if(ctx.lost)N.lost=ctx.lost;
        else if(B.exit>=0){if(ctx.exited)N.won=true;else if(closedAt(s,B.exit))N.lost="exit";}
        else if(boardDone(B,s))N.won=true;
        return {state:N,collects:Boolean(ctx.collects)};
      }
      if(mode==="duo"){
        const B=boards[0],s=copyBoard(G.b[0]),[dr,dc]=SQUARE[a];
        const along=i=>{const [r,c]=B.cells[i];return r*dr+c*dc;};
        const order=along(s.p)>=along(s.q)?["p","q"]:["q","p"];
        // ghost: toplar birbirini durdurmaz (yalnızca üreticinin karşılaştırması için).
        const first=slideBall(B,s,order[0],a,level.ghost?-1:s[order[1]],ctx);
        const second=slideBall(B,s,order[1],a,level.ghost?-1:s[order[0]],ctx);
        if(!first&&!second)return null;
        N.b=[s];N.moves++;
        if(ctx.lost)N.lost=ctx.lost;else if(s.stars===0)N.won=true;
        return {state:N,collects:Boolean(ctx.collects)};
      }
      if(mode==="twin"){
        const dirs=couple==="echo"?[a,G.last]:[a,mapDir(a)];
        let any=false;
        const next=G.b.map((old,k)=>{
          const B=boards[k],s=copyBoard(old);
          if(dirs[k]<0||(!level.sync&&old.stars===0))return s; // yıldızları biten tahtanın topu durur
          if(slideBall(B,s,"p",dirs[k],-1,ctx))any=true;
          return s;
        });
        if(!any)return null;
        N.b=next;N.moves++;N.last=a;
        const done=next.map(s=>s.stars===0);
        if(done.every(Boolean))N.won=true;
        else if(level.sync&&done.some(Boolean))N.lost="sync";
        return {state:N,collects:Boolean(ctx.collects)};
      }
      if(mode==="chain"){
        const k=G.room,B=boards[k],s=copyBoard(G.b[k]);
        if(!slideBall(B,s,"p",a,-1,ctx))return null;
        const b=G.b.slice();b[k]=s;N.b=b;N.moves++;
        if(s.stars===0){
          if(k===boards.length-1)N.won=true;
          else{ // sonraki odaya aynı karede geç
            const [r,c]=B.cells[s.p],nextBoard=boards[k+1],i=nextBoard.index.get(r+","+c);
            const t=copyBoard(G.b[k+1]);
            if(i===undefined||closedAt(t,i)){t.p=-1;b[k+1]=t;N.room=k+1;N.lost="chain";}
            else{
              t.p=i;if(nextBoard.starBit[i]&t.stars)t.stars&=~nextBoard.starBit[i];
              b[k+1]=t;N.room=k+1;
            }
          }
        }
        return {state:N,collects:Boolean(ctx.collects)||N.room!==G.room};
      }
      throw Error(`bilinmeyen bölüm biçimi: ${mode}`);
    }
    // Tasarımcı: duvarlar konduktan sonra hamle sırasını oynatır; her hamleden sonraki tahtayı döndürür.
    function playSequence(walls){
      const B=boards[0];let s=copyBoard(boardStart(B));
      for(const i of walls)close(s,i);
      const frames=[s];let won=false;
      for(const d of sequence){
        const t=copyBoard(s),ctx={};
        if(slideBall(B,t,"p",d,-1,ctx))s=t;
        frames.push(s);
        if(s.stars===0){won=true;break;}
      }
      return {won,frames};
    }
    function key(G){
      let text=`${G.room}|${G.last}|${G.pocket}|${G.dw.join(".")}|${G.won?1:0}|${G.lost??""}`;
      for(const s of G.b)text+=`|${s.p},${s.q},${s.lo},${s.hi},${s.stars},${s.tog},${s.plo},${s.phi},${s.rot},${s.stones.join(".")}`;
      return text;
    }
    const hasMove=G=>actions(G).some(a=>apply(G,a)!==null);
    return {level,grid,mode,D,boards,names,sequence,start,actions,apply,key,hasMove,playSequence,
      won:G=>G.won,lost:G=>G.lost,closedAt,paintedAt,wallNow:(k,s,i)=>wallNow(boards[k],s,i),PLACE,PLAY};
  }

  const api={SQUARE,HEX,SQUARE_NAMES,HEX_NAMES,PLACE,PLAY,makeGame,compileBoard};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.SonHamleLab=api;
})(typeof globalThis!=="undefined"?globalThis:this);
