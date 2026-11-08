import path from "node:path";
import { createServer } from "../../../frontend-react/node_modules/vite/dist/node/index.js";

let server;
const stop = async () => { await server?.close(); process.exit(0); };
process.once("SIGTERM", stop);
process.once("disconnect", stop);
try {
  server = await createServer({ root: path.resolve(import.meta.dirname, "../../../frontend-react"), server: { host: "127.0.0.1", port: 5173, strictPort: true } });
  await server.listen();
  const address = server.httpServer.address();
  if (process.connected) process.send({ event: "ready", address: address.address, port: address.port });
  else await stop();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
