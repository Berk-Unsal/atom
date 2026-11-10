// Desktop bundles never inherit local web-provider keys or developer .env files.
import path from "node:path";
import { build } from "../../frontend-react/node_modules/vite/dist/node/index.js";
const root = path.resolve(import.meta.dirname, "../../frontend-react");
await build({ root, configFile: path.join(root, "vite.config.js"), envDir: false });
