import type { ApiSpec, DiffResult } from "./store.js";
import type { CollectedFiles } from "./scanner.js";
export declare function analyzeWithAI(collected: CollectedFiles, projectName?: string): Promise<ApiSpec>;
export declare function analyzeIncremental(existingSpec: ApiSpec, diff: DiffResult): Promise<{
    spec: ApiSpec;
    changed: boolean;
}>;
//# sourceMappingURL=agent.d.ts.map