// Cloudflare Worker + Durable Object: temporary matchmaking and move relay.
// Prototype only: it does NOT validate chess moves server-side, enforce clocks,
// or protect against cheating. Do not use for rated/competitive games yet.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("speedchess matchmaking is alive");
    if (url.pathname !== "/ws") return new Response("Speedchess websocket endpoint. Connect to /ws", {status: 404});
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", {status: 426});
    const id = env.MATCHMAKER.idFromName("global-lobby");
    return env.MATCHMAKER.get(id).fetch(request);
  }
};

export class Matchmaker {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.waiting = new Map(); // mode -> WebSocket
    this.players = new Map(); // WebSocket -> { mode, gameId, color }
    this.games = new Map();   // gameId -> { white, black }
  }
  async fetch(request) {
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();
    server.addEventListener("message", event => this.onMessage(server, event.data));
    server.addEventListener("close", () => this.onClose(server));
    server.addEventListener("error", () => this.onClose(server));
    server.send(JSON.stringify({type:"connected"}));
    return new Response(null, {status:101, webSocket:client});
  }
  send(ws, payload) { try { ws.send(JSON.stringify(payload)); } catch {} }
  onMessage(ws, raw) {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === "join") {
      const allowed = new Set(["30","15","7.5","3","1"]);
      const mode = String(msg.mode);
      if (!allowed.has(mode)) { this.send(ws,{type:"error",message:"Unsupported time control."}); return; }
      if (this.players.has(ws)) this.onClose(ws);
      const waiting = this.waiting.get(mode);
      if (waiting && waiting.readyState === WebSocket.OPEN && waiting !== ws) {
        this.waiting.delete(mode);
        const gameId = crypto.randomUUID();
        const game = {white: waiting, black: ws};
        this.games.set(gameId, game);
        this.players.set(waiting,{mode,gameId,color:"w"});
        this.players.set(ws,{mode,gameId,color:"b"});
        this.send(waiting,{type:"matched",gameId,color:"w",mode});
        this.send(ws,{type:"matched",gameId,color:"b",mode});
      } else {
        this.waiting.set(mode,ws);
        this.players.set(ws,{mode,gameId:null,color:null});
        this.send(ws,{type:"queued",mode});
      }
      return;
    }
    const player = this.players.get(ws);
    if (!player || !player.gameId) return;
    const game = this.games.get(player.gameId);
    if (!game) return;
    const opponent = player.color === "w" ? game.black : game.white;
    if (msg.type === "move") {
      if (!Number.isInteger(msg.from) || !Number.isInteger(msg.to) || msg.from<0 || msg.from>63 || msg.to<0 || msg.to>63) return;
      this.send(opponent,{type:"move",from:msg.from,to:msg.to,promotion:msg.promotion||null});
    } else if (msg.type === "resign") {
      this.send(opponent,{type:"ended",reason:"Opponent resigned."});
      this.finish(player.gameId);
    } else if (msg.type === "timeout" || msg.type === "result") {
      this.send(opponent,{type:"ended",reason:msg.type==="timeout"?"Opponent's clock expired.":"Game finished."});
      this.finish(player.gameId);
    } else if (msg.type === "leave") {
      this.send(opponent,{type:"opponent-left"});
      this.finish(player.gameId);
    }
  }
  onClose(ws) {
    const player = this.players.get(ws);
    if (!player) {
      for (const [mode, waiting] of this.waiting) if (waiting === ws) this.waiting.delete(mode);
      return;
    }
    if (player.gameId) {
      const game = this.games.get(player.gameId);
      if (game) {
        const opponent = game.white === ws ? game.black : game.white;
        this.send(opponent,{type:"opponent-left"});
        this.players.delete(opponent);
      }
      this.finish(player.gameId);
    } else if (this.waiting.get(player.mode) === ws) this.waiting.delete(player.mode);
    this.players.delete(ws);
  }
  finish(gameId) {
    const game = this.games.get(gameId);
    if (!game) return;
    this.players.delete(game.white); this.players.delete(game.black);
    this.games.delete(gameId);
    try { game.white.close(); } catch {}
    try { game.black.close(); } catch {}
  }
}
