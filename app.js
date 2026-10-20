(() => {
  const $ = id => document.getElementById(id);
  const glyphs = {K:"♔",Q:"♕",R:"♖",B:"♗",N:"♘",P:"♙",k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟"};
  const modes = {"30":"Hyperbullet","15":"Ultrabullet","7.5":"Nanobullet","3":"Picobullet","1":"Femtobullet"};
  let state=TinyChess.initial(), selected=null, legal=[], flipped=false, mode=30, online=false, socket=null, myColor="w", gameLive=false, queueing=false, clocks={w:30,b:30}, lastTick=0, tickHandle=null, moveHistory=[], soundOn=false, lastMove=null, localTurnOnly=true;
  const fmt = n => {n=Math.max(0,n);if(n<10)return `00:0${n.toFixed(1)}`;return `00:${Math.floor(n).toString().padStart(2,"0")}.${Math.floor((n%1)*10)}`;};
  function toast(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove("show"),2600);}
  function setStatus(title,detail){$("gameStatus").textContent=title;$("statusDetail").textContent=detail;}
  function updateConnection(label,onlineState=false){$("connectionText").textContent=label;$("connectionBadge").classList.toggle("offline",!onlineState);}
  function resetClocks(){clocks={w:Number(mode),b:Number(mode)};lastTick=performance.now();renderClocks();}
  function renderClocks(){const w=$("whiteClock"),b=$("blackClock");w.textContent=fmt(clocks.w);b.textContent=fmt(clocks.b);w.classList.toggle("active",gameLive&&state.turn==="w");b.classList.toggle("active",gameLive&&state.turn==="b");w.classList.toggle("low",clocks.w<5);b.classList.toggle("low",clocks.b<5);}
  function startClock(){clearInterval(tickHandle);lastTick=performance.now();tickHandle=setInterval(()=>{if(!gameLive)return;const now=performance.now(),dt=(now-lastTick)/1000;lastTick=now;clocks[state.turn]-=dt;if(clocks[state.turn]<=0){clocks[state.turn]=0;gameLive=false;clearInterval(tickHandle);setStatus("Time expired",`${state.turn==="w"?"Black":"White"} wins on time.`);toast(`${state.turn==="w"?"Black":"White"} wins on time`);if(online)send({type:"timeout",loser:state.turn});}renderClocks();},50);}
  function drawBoard(){
    const board=$("board");board.innerHTML="";const moves=legal.filter(m=>m.from===selected).map(m=>m.to);
    for(let rr=0;rr<8;rr++)for(let cc=0;cc<8;cc++){const r=flipped?7-rr:rr,c=flipped?7-cc:cc,i=r*8+c,p=state.board[i],sq=document.createElement("button");sq.className="square "+((r+c)%2===0?"light":"dark");sq.type="button";sq.setAttribute("role","gridcell");sq.setAttribute("aria-label",`${TinyChess.coord(i)}${p?" "+(TinyChess.color(p)==="w"?"white ":"black ")+TinyChess.type(p):""}`);sq.dataset.square=i;
      if(lastMove&&(lastMove.from===i||lastMove.to===i))sq.classList.add("last-move");if(selected===i)sq.classList.add("selected");if(moves.includes(i))sq.classList.add("legal");if(p&&moves.includes(i))sq.classList.add("has-piece");
      if(p){const span=document.createElement("span");span.className="piece "+(TinyChess.color(p)==="w"?"white":"black");span.textContent=glyphs[p];sq.appendChild(span);}
      sq.addEventListener("click",()=>onSquare(i));board.appendChild(sq);}
    const ranks=flipped?[1,2,3,4,5,6,7,8]:[8,7,6,5,4,3,2,1],files=flipped?["h","g","f","e","d","c","b","a"]:["a","b","c","d","e","f","g","h"];
    document.querySelector(".rank-labels").innerHTML=ranks.map(x=>`<span>${x}</span>`).join("");document.querySelector(".file-labels").innerHTML=files.map(x=>`<span>${x}</span>`).join("");
    renderClocks();
  }
  function onSquare(i){
    if(!gameLive){if(!online)toast("Start a game first.");return;}
    if(online&&state.turn!==myColor){toast("Waiting for your opponent.");return;}
    const p=state.board[i];
    if(selected!==null){const result=TinyChess.makeMove(state,selected,i);if(result){playMove(result,true);return;}if(p&&TinyChess.color(p)===state.turn){selected=i;legal=TinyChess.legalMoves(state);drawBoard();return;}selected=null;legal=[];drawBoard();return;}
    if(p&&TinyChess.color(p)===state.turn){selected=i;legal=TinyChess.legalMoves(state);drawBoard();}
  }
  function playMove(result,fromUser){
    const old=state;state=result.state;lastMove=result.move;selected=null;legal=[];moveHistory.push({n:Math.ceil(moveHistory.length/2)+((old.turn==="b")?0:0),side:old.turn,san:result.san});
    renderMoves();drawBoard();
    if(fromUser&&online)send({type:"move",from:result.move.from,to:result.move.to,promotion:result.move.promotion||null});
    const st=TinyChess.status(state);if(st.over){gameLive=false;clearInterval(tickHandle);setStatus(st.reason,`Result: ${st.result}`);toast(st.reason);if(online)send({type:"result",result:st.result});}
    else if(st.check)setStatus("Check!",`${state.turn==="w"?"White":"Black"} to move.`);
    else setStatus(gameLive?"Game in progress":"Ready",`${modes[String(mode)]} · ${mode}s per player`);
  }
  function renderMoves(){const list=$("moveList");list.innerHTML="";if(!moveHistory.length){list.innerHTML='<li class="empty-moves">Moves will appear here.</li>';}$("moveCount").textContent=`${moveHistory.length} ${moveHistory.length===1?"move":"moves"}`;for(let i=0;i<moveHistory.length;i+=2){const li=document.createElement("li");const white=moveHistory[i],black=moveHistory[i+1];li.textContent=`${Math.floor(i/2)+1}.  ${white?white.san:""}${black?"     "+black.san:""}`;list.appendChild(li);}}
  function newGame(local=true){if(socket&&online){send({type:"leave"});socket.close();socket=null;}online=false;queueing=false;gameLive=true;localTurnOnly=local;myColor="w";state=TinyChess.initial();selected=null;legal=[];flipped=false;lastMove=null;moveHistory=[];mode=Number($("modeSelect").value);resetClocks();startClock();$("opponentName").textContent=local?"Black (local)":"Opponent";$("opponentSub").textContent=local?"Local practice":"Online";$("youName").textContent=local?"White (you)":"You";$("youSub").textContent=local?"Two players, one device":"White";$("onlineHint").textContent=local?"Local practice works offline.":"Online games are temporary; this prototype does not save profiles or history.";renderMoves();drawBoard();setStatus("Game in progress",`${modes[String(mode)]} · ${mode}s per player`);updateConnection(navigator.onLine?"Online · local game":"Offline mode",navigator.onLine);}
  function send(obj){if(socket&&socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(obj));}
  function findOnline(){
    const url=window.SPEEDCHESS_CONFIG&&window.SPEEDCHESS_CONFIG.websocketUrl;
    if(!url){toast("Online service isn't configured yet. Local practice works now.");$("onlineHint").textContent="Set websocketUrl in config.js after deploying worker.js.";return;}
    if(!navigator.onLine){toast("You're offline. Online PvP needs internet.");return;}
    if(socket)socket.close();mode=Number($("modeSelect").value);queueing=true;gameLive=false;clearInterval(tickHandle);setStatus("Finding opponent…","Looking for someone in the same time control.");$("onlineHint").textContent="Connecting to temporary matchmaking…";updateConnection("Connecting",true);
    try{socket=new WebSocket(url);}catch(e){toast("Couldn't connect to matchmaking.");return;}
    socket.addEventListener("open",()=>{send({type:"join",mode});updateConnection("Connected",true);});
    socket.addEventListener("message",event=>{let msg;try{msg=JSON.parse(event.data);}catch{return;}
      if(msg.type==="queued"){setStatus("Waiting for opponent…",`${modes[String(mode)]} · searching for a match.`);return;}
      if(msg.type==="matched"){queueing=false;online=true;myColor=msg.color;state=TinyChess.initial();selected=null;legal=[];lastMove=null;moveHistory=[];clocks={w:mode,b:mode};gameLive=true;lastTick=performance.now();startClock();flipped=myColor==="b";$("opponentName").textContent="Opponent";$("opponentSub").textContent=`${modes[String(mode)]}`;$("youName").textContent="You";$("youSub").textContent=myColor==="w"?"White":"Black";$("onlineHint").textContent="Temporary match · no account or history storage.";renderMoves();drawBoard();setStatus("Opponent found!",`You're ${myColor==="w"?"White":"Black"}. Good luck!`);toast("Opponent found — game on!");return;}
      if(msg.type==="move"){const result=TinyChess.makeMove(state,msg.from,msg.to);if(result)playMove(result,false);else{setStatus("Game desynced","This prototype rejected a received move. Start a new game.");gameLive=false;}return;}
      if(msg.type==="opponent-left"){gameLive=false;clearInterval(tickHandle);setStatus("Opponent disconnected","The match ended because the other player left.");toast("Opponent disconnected.");return;}
      if(msg.type==="error"){toast(msg.message||"Matchmaking error");setStatus("Connection error",msg.message||"Try again.");}
      if(msg.type==="ended"){gameLive=false;clearInterval(tickHandle);setStatus("Game ended",msg.reason||"The game ended.");}
    });
    socket.addEventListener("close",()=>{updateConnection(navigator.onLine?"Online · not connected":"Offline mode",false);if(queueing){queueing=false;setStatus("Disconnected","Could not keep the matchmaking connection.");}});
    socket.addEventListener("error",()=>{toast("Matchmaking connection failed.");});
  }
  $("localBtn").addEventListener("click",()=>newGame(true));
  $("onlineBtn").addEventListener("click",findOnline);
  $("newGameBtn").addEventListener("click",()=>newGame(true));
  $("resignBtn").addEventListener("click",()=>{if(!gameLive)return;if(online)send({type:"resign"});gameLive=false;clearInterval(tickHandle);setStatus("Game ended",`${state.turn==="w"?"White":"Black"} to move. Game resigned.`);toast("Game resigned.");});
  $("flipBtn").addEventListener("click",()=>{flipped=!flipped;drawBoard();});
  $("modeSelect").addEventListener("change",()=>{mode=Number($("modeSelect").value);document.querySelectorAll(".mode-pill").forEach(b=>b.classList.toggle("selected",Number(b.dataset.mode)===mode));if(!gameLive)resetClocks();});
  document.querySelectorAll(".mode-pill").forEach(b=>b.addEventListener("click",()=>{$("modeSelect").value=b.dataset.mode;$("modeSelect").dispatchEvent(new Event("change"));}));
  $("soundToggle").addEventListener("click",()=>{soundOn=!soundOn;$("soundToggle").style.color=soundOn?"var(--green)":"var(--muted)";toast(soundOn?"Sound setting enabled (audio not yet implemented).":"Sound off.");});
  window.addEventListener("online",()=>updateConnection("Online · ready",true));window.addEventListener("offline",()=>updateConnection("Offline mode",false));
  mode=Number($("modeSelect").value);resetClocks();drawBoard();updateConnection(navigator.onLine?"Offline-ready":"Offline mode",navigator.onLine);
  setStatus("Ready when you are","Local practice works without an internet connection after the app is cached.");
})();