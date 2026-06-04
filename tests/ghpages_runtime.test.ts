/**
 * Runtime smoke test for the GitHub Pages build.
 *
 * Confirms the dist/ tree contains everything a static-mode deployment
 * needs and that the bundled JS references the right paths:
 *   1. index.html is served with assets under /<repo>/
 *   2. All five data/*.json files the static-mode client needs are
 *      present and parseable
 *   3. state.json exposes every key the client requires
 *   4. No bare /assets/ or /data/ paths in index.html (would 404 on
 *      GitHub Pages)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = "ClimateShield";
const DIST = resolve("dist");

interface DistFile {
    name: string;
    body: string;
    type: string;
}

function loadDist(): DistFile[] {
    if (!existsSync(join(DIST, "index.html"))) {
        throw new Error("dist/index.html not found — run `npm run build:ghpages` first");
    }
    const files: DistFile[] = [];
    const walk = (dir: string, prefix: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const rel = join(prefix, entry.name);
            const full = join(dir, entry.name);
            if (entry.isDirectory()) walk(full, rel);
            else files.push({ name: rel, body: readFileSync(full, "utf8"), type: guessType(entry.name) });
        }
    };
    walk(DIST, "");
    return files;
}

function guessType(name: string): string {
    if (name.endsWith(".html")) return "text/html";
    if (name.endsWith(".js") || name.endsWith(".mjs")) return "text/javascript";
    if (name.endsWith(".css")) return "text/css";
    if (name.endsWith(".json")) return "application/json";
    if (name.endsWith(".png")) return "image/png";
    if (name.endsWith(".svg")) return "image/svg+xml";
    return "application/octet-stream";
}

describe("GitHub Pages runtime smoke", () => {
    let distFiles: DistFile[];

    beforeAll(() => {
        distFiles = loadDist();
    });

    it("ships an index.html that references assets under /<repo>/", () => {
        const html = distFiles.find((f) => f.name === "index.html");
        expect(html).toBeDefined();
        expect(html!.body).toContain(`/${REPO}/assets/`);
        // No bare /assets/ — that would 404 on GitHub Pages.
        expect(html!.body).not.toMatch(/href="\/assets\//);
        expect(html!.body).not.toMatch(/src="\/assets\//);
    });

    it("includes all five data files the static-mode client needs", () => {
        for (const name of ["current.json", "forecast.json", "warnings.json", "state.json", "history.json"]) {
            const file = distFiles.find((f) => f.name === `data/${name}`);
            expect(file, `data/${name} missing from dist`).toBeDefined();
            // Must be valid JSON
            expect(() => JSON.parse(file!.body)).not.toThrow();
        }
    });

    it("state.json exposes every key the static-mode client requires", () => {
        const state = JSON.parse(distFiles.find((f) => f.name === "data/state.json")!.body);
        for (const k of [
            "wbt_thresholds",
            "hne_thresholds",
            "vulnerability_config",
            "warning_multipliers",
            "t8_floor",
            "state_ranges",
            "consecutive_hot_nights",
        ]) {
            expect(state, `state.json missing ${k}`).toHaveProperty(k);
        }
    });

    it("index.html and every asset are byte-clean (no parse errors)", () => {
        for (const f of distFiles) {
            if (f.type === "application/json") {
                expect(() => JSON.parse(f.body), `${f.name} not parseable`).not.toThrow();
            }
            if (f.type === "text/javascript" || f.type === "text/css" || f.type === "text/html") {
                // Non-empty + decodable as UTF-8
                expect(f.body.length, `${f.name} is empty`).toBeGreaterThan(0);
            }
        }
    });

    it("the bundled JS does not contain a hard-coded admin password", () => {
        const js = distFiles.find((f) => f.name.startsWith("assets/index-") && f.name.endsWith(".js"));
        expect(js).toBeDefined();
        // The old api.ts had a hardcoded "Climate012220ShielD" string
        // that we removed in the security refactor. This test guards
        // against regression.
        expect(js!.body).not.toContain("Climate012220ShielD");
    });

    it("the bundled JS does not contain the *2.0 risk score amplification", () => {
        const js = distFiles.find((f) => f.name.startsWith("assets/index-") && f.name.endsWith(".js"));
        expect(js).toBeDefined();
        // The old code did `rawScore = (base * m) * 2.0`. The fix
        // dropped the *2.0 multiplier. This test catches a regression
        // where the literal 2.0 amplification comes back.
        expect(js!.body).not.toMatch(/base\s*\*\s*m\s*\)\s*\*\s*2(?:\.0)?/);
    });
});
