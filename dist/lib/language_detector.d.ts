/**
 * Language Detector
 *
 * Detects the presence of Go and TypeScript/JavaScript code in a package
 * by examining file markers (go.mod, package.json, file extensions).
 */
export interface LanguageDetectionResult {
    hasGo: boolean;
    hasTypeScript: boolean;
    goRoot?: string;
    tsRoot?: string;
}
export declare function detect(packagePath: string): Promise<LanguageDetectionResult>;
//# sourceMappingURL=language_detector.d.ts.map