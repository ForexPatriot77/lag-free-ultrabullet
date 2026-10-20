/* Small dependency-free chess rules engine for this prototype.
   Supports legal moves, check, castling, en passant, and queen promotion. */
(() => {
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
  const files = "abcdefgh";
  function initial() {
    return { board: parseFenBoard(START), turn: "w", castle: {K:true,Q:true,k:true,q:true}, ep:null, half:0, full:1, last:null };
  }
  function parseFenBoard(fen) {
    const b = Array(64).fill(null); let r=0,c=0;
    for (const ch of fen.split("/").join("")) {
      if (ch>="1" && ch<="8") c += Number(ch);
      else { b[r*8+c]=ch; c++; }
      if (c===8) { r++; c=0; }
    }
    return b;
  }
  const color = p => p && (p===p.toUpperCase() ? "w":"b");
  const type = p => p && p.toLowerCase();
  const inside = (r,c) => r>=0 && r<8 && c>=0 && c<8;
  const clone = s => ({...s,board:s.board.slice(),castle:{...s.castle},last:s.last?{...s.last}:null});
  const coord = i => files[i%8] + (8-Math.floor(i/8));
  const index = sq => (8-Number(sq[1]))*8+files.indexOf(sq[0]);
  function attacked(s, target, by) {
    const tr=Math.floor(target/8), tc=target%8, b=s.board;
    // Pawn attacks
    const pawnRow = tr + (by==="w" ? 1 : -1);
    for (const dc of [-1,1]) if (inside(pawnRow,tc+dc)) {
      const p=b[pawnRow*8+tc+dc];
      if (p && color(p)===by && type(p)==="p") return true;
    }
    // Knights
    for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const r=tr+dr,c=tc+dc;if(inside(r,c)){const p=b[r*8+c];if(p&&color(p)===by&&type(p)==="n")return true;}
    }
    // King
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const r=tr+dr,c=tc+dc;if(inside(r,c)){const p=b[r*8+c];if(p&&color(p)===by&&type(p)==="k")return true;}}
    // Sliding pieces
    const dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    for(let d=0;d<dirs.length;d++){const [dr,dc]=dirs[d];let r=tr+dr,c=tc+dc,dist=1;while(inside(r,c)){const p=b[r*8+c];if(p){if(color(p)===by){const t=type(p);if(t==="q"||(d<4&&t==="r")||(d>=4&&t==="b")||(dist===1&&t==="k"))return true;}break;}r+=dr;c+=dc;dist++;}}
    return false;
  }
  function inCheck(s, side=s.turn) {
    const king = side==="w" ? "K":"k"; const at=s.board.indexOf(king);
    return at<0 || attacked(s,at,side==="w"?"b":"w");
  }
  function pseudo(s, from) {
    const b=s.board,p=b[from];if(!p||color(p)!==s.turn)return [];
    const side=color(p),t=type(p),r=Math.floor(from/8),c=from%8,m=[];
    const add=(rr,cc,extra={})=>{if(!inside(rr,cc))return false;const to=rr*8+cc,q=b[to];if(q&&color(q)===side)return false;if(q&&type(q)==="k")return false;m.push({from,to,...extra});return !q;};
    if(t==="p"){
      const dir=side==="w"?-1:1,start=side==="w"?6:1,promo=side==="w"?0:7;
      if(inside(r+dir,c)&&!b[(r+dir)*8+c]){
        add(r+dir,c,r+dir===promo?{promotion:"q"}:{});
        if(r===start&&!b[(r+2*dir)*8+c])add(r+2*dir,c,{});
      }
      for(const dc of [-1,1]){const rr=r+dir,cc=c+dc;if(!inside(rr,cc))continue;const to=rr*8+cc,q=b[to];if(q&&color(q)!==side&&type(q)!=="k")add(rr,cc,rr===promo?{promotion:"q"}:{});else if(s.ep===to)m.push({from,to,enPassant:true});}
    } else if(t==="n"){
      for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])add(r+dr,c+dc);
    } else if(t==="k"){
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(dr||dc)add(r+dr,c+dc);
      if(side==="w"&&from===60&&!inCheck(s,"w")){
        if(s.castle.K&&!b[61]&&!b[62]&&b[63]==="R"&&!attacked(s,61,"b")&&!attacked(s,62,"b"))m.push({from,to:62,castle:"K"});
        if(s.castle.Q&&!b[59]&&!b[58]&&!b[57]&&b[56]==="R"&&!attacked(s,59,"b")&&!attacked(s,58,"b"))m.push({from,to:58,castle:"Q"});
      }
      if(side==="b"&&from===4&&!inCheck(s,"b")){
        if(s.castle.k&&!b[5]&&!b[6]&&b[7]==="r"&&!attacked(s,5,"w")&&!attacked(s,6,"w"))m.push({from,to:6,castle:"k"});
        if(s.castle.q&&!b[3]&&!b[2]&&!b[1]&&b[0]==="r"&&!attacked(s,3,"w")&&!attacked(s,2,"w"))m.push({from,to:2,castle:"q"});
      }
    } else {
      const dirs=t==="r"?[[1,0],[-1,0],[0,1],[0,-1]]:t==="b"?[[1,1],[1,-1],[-1,1],[-1,-1]]:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      for(const [dr,dc] of dirs){let rr=r+dr,cc=c+dc;while(inside(rr,cc)){const keepGoing=add(rr,cc);if(!keepGoing)break;rr+=dr;cc+=dc;}}
    }
    return m;
  }
  function apply(s, move) {
    const n=clone(s),b=n.board,p=b[move.from],side=color(p),t=type(p),to=move.to;
    if(move.enPassant)b[to+(side==="w"?8:-8)]=null;
    b[move.to]=move.promotion?(side==="w"?move.promotion.toUpperCase():move.promotion):p;b[move.from]=null;
    if(move.castle==="K"){b[61]="R";b[63]=null;}if(move.castle==="Q"){b[59]="R";b[56]=null;}
    if(move.castle==="k"){b[5]="r";b[7]=null;}if(move.castle==="q"){b[3]="r";b[0]=null;}
    if(t==="k"){if(side==="w"){n.castle.K=false;n.castle.Q=false;}else{n.castle.k=false;n.castle.q=false;}}
    if(move.from===63||move.to===63)n.castle.K=false;if(move.from===56||move.to===56)n.castle.Q=false;
    if(move.from===7||move.to===7)n.castle.k=false;if(move.from===0||move.to===0)n.castle.q=false;
    n.ep=t==="p"&&Math.abs(move.to-move.from)===16?(move.from+move.to)/2:null;
    n.half=t==="p"||s.board[to]||move.enPassant?0:s.half+1;if(side==="b")n.full++;
    n.turn=side==="w"?"b":"w";n.last={from:move.from,to:move.to};return n;
  }
  function legalMoves(s, from=null) {
    const starts=from===null?s.board.map((p,i)=>p&&color(p)===s.turn?i:null).filter(x=>x!==null):[from];
    const all=[];for(const f of starts)for(const m of pseudo(s,f)){const n=apply(s,m);if(!inCheck(n,s.turn))all.push(m);}
    return all;
  }
  function san(s,m) {
    const p=s.board[m.from],t=type(p),capture=!!s.board[m.to]||m.enPassant;
    if(m.castle)return m.castle.toUpperCase()==="K"?"O-O":"O-O-O";
    return (t==="p"?(capture?files[m.from%8]:""):t.toUpperCase())+(capture?"x":"")+coord(m.to)+(m.promotion?"=Q":"");
  }
  function makeMove(s,from,to) {
    const candidates=legalMoves(s,from).filter(m=>m.to===to);
    if(!candidates.length)return null;
    return {state:apply(s,candidates[0]),move:candidates[0],san:san(s,candidates[0])};
  }
  function status(s){const moves=legalMoves(s);if(moves.length){if(inCheck(s))return {over:false,check:true};return {over:false,check:false};}return inCheck(s)?{over:true,result:s.turn==="w"?"0-1":"1-0",reason:"Checkmate"}:{over:true,result:"½-½",reason:"Stalemate"};}
  window.TinyChess={initial,legalMoves,makeMove,status,coord,index,color,type,inCheck};
})();