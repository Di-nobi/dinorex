/**
 * agent.groq.ts — Free Groq/Llama3 version of the Dinorex AI agent.
 *
 * Get a free API key at: https://console.groq.com
 * Set it:  export GROQ_API_KEY=gsk_your_key_here
 */
import type { ApiSpec, DiffResult } from "./store.js";
import type { CollectedFiles } from "./scanner.js";
export declare function analyzeWithAI(collected: CollectedFiles, projectName?: string): Promise<ApiSpec>;
export declare function analyzeIncremental(existingSpec: ApiSpec, diff: DiffResult): Promise<{
    spec: ApiSpec;
    changed: boolean;
}>;
//# sourceMappingURL=agent.groq.d.ts.map