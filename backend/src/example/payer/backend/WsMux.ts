import { WebSocket } from "ws";

export class WsMux {
  public clients: Map<string, WebSocket> = new Map(); 
  constructor() {
  }

  registerSocketForObjectId(id: string, socket: WebSocket) {
    this.clients.set(id, socket);
    socket.on('close', (code, reason) => {
      this.clients.delete(id);
      console.log(`Socket closed (inv#: ${id}): ${code} - ${reason.toString()}`);
    });
    socket.on('error', console.error);
    socket.on('open', () => {
      console.log(`Socket opened (inv#: ${id})`);
      this.clients.set(id, socket);
    });
  }

  notify<T>(id: string, data: T) {
    const socket = this.clients.get(id)!;
    if (!socket) { return; }
    if (socket.readyState == WebSocket.OPEN) {
      socket.send(JSON.stringify({
        'type': 'update',
        'data': data
      }));
      console.log(`Notified update for invoice: ${id}`);
    }
  }
}