import type { FileEntry } from "./store.js";
export interface ScanSummary {
    routes: number;
    controllers: number;
    services: number;
    models: number;
}
export interface CollectedFiles {
    routes: FileEntry[];
    controllers: FileEntry[];
    services: FileEntry[];
    models: FileEntry[];
}
export interface ScanResult {
    cwd: string;
    summary: ScanSummary;
    collected: CollectedFiles;
}
export declare function scanProject(targetDir: string): Promise<ScanResult>;
//# sourceMappingURL=scanner.d.ts.map