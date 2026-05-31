import { Server } from "http";
import { type ApiSpec } from "./store.js";
interface ServerOptions {
    port?: number;
    _cachedSpec?: ApiSpec | null;
}
interface ServerResult {
    server: Server;
    port: number;
    url: string;
}
export declare function startServer(targetDir: string, options?: ServerOptions): Promise<ServerResult>;
export {};
//# sourceMappingURL=server.d.ts.map