export interface FileEntry {
    path: string;
    content: string;
}
export interface FileHash {
    hash: string;
}
export interface SpecStore {
    spec: ApiSpec;
    hashes: Record<string, FileHash>;
    lastScan: string;
}
export interface ApiSpec {
    projectName: string;
    baseUrl: string;
    version: string;
    description: string;
    collections: Collection[];
}
export interface Collection {
    name: string;
    description: string;
    endpoints: Endpoint[];
}
export interface Endpoint {
    id: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
    summary: string;
    description: string;
    requiresAuth: boolean;
    pathParams: Param[];
    queryParams: Param[];
    requestBody?: RequestBody;
    responses: Record<string, ResponseDef>;
}
export interface Param {
    name: string;
    type: string;
    description: string;
    example: string | number;
}
export interface RequestBody {
    contentType: string;
    schema: Record<string, FieldDef>;
}
export interface FieldDef {
    type: string;
    example: unknown;
    required: boolean;
    description: string;
}
export interface ResponseDef {
    description: string;
    example?: unknown;
}
export interface DiffResult {
    newFiles: FileEntry[];
    changedFiles: FileEntry[];
    removedFiles: string[];
    unchanged: FileEntry[];
    newHashes: Record<string, FileHash>;
}
export declare function loadStore(projectDir: string): SpecStore | null;
export declare function saveStore(projectDir: string, data: SpecStore): void;
/**
 * Compare new scan against stored file hashes.
 * Returns:
 *  - newFiles    : files that didn't exist before
 *  - changedFiles: files whose content changed
 *  - removedFiles: files that no longer exist
 *  - unchanged   : everything else
 */
export declare function diffScan(storedHashes: Record<string, FileHash> | undefined, currentFiles: FileEntry[]): DiffResult;
//# sourceMappingURL=store.d.ts.map