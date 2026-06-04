/**
 * GitHub Pages compatibility test.
 *
 * Spawns the dist/ tree under a /<repo>/ subpath and asserts that
 * the index.html and the data/*.json files all return 200 with
 * parseable payloads. This is the exact URL shape GitHub Pages uses.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = "ClimateShield";
const PORT = 18765;
const BASE = `http://127.0.0.1:${PORT}`;

let server: ChildProcess;

async function get(path: string): Promise<{ status: number; body: string }> {
    const res = await fetch(`${BASE}${path}`);
    const body = await res.text();
    return { status: res.status, body };
}

beforeAll(async () => {
    // Confirm a dist/ exists; if not, skip the test gracefully.
    if (!existsSync("dist/index.html")) {
        throw new Error(
            "dist/index.html not found — run `npm run build` before this test",
        );
    }
    server = spawn("python3", ["tests/ghpages_server.py"], {
        env: { ...process.env, GH_PAGES_PORT: String(PORT), GH_PAGES_REPO: REPO },
        stdio: ["ignore", "pipe", "pipe"],
    });
    // Wait for the server to come up
    for (let i = 0; i < 30; i++) {
        try {
            const r = await fetch(`${BASE}/_healthz`);
            if (r.ok) return;
        } catch {
            // not up yet
        }
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error("ghpages_server failed to start within 6s");
}, 30_000);

afterAll(() => {
    server?.kill("SIGTERM");
});

describe("GitHub Pages static build", () => {
    it("serves index.html at /<repo>/", async () => {
        const { status, body } = await get(`/${REPO}/`);
        expect(status).toBe(200);
        expect(body).toContain("<div id=\"root\">");
        // Critical: the index.html must reference assets under /<repo>/,
        // not /. Otherwise GitHub Pages will 404 every asset.
        expect(body).toMatch(new RegExp(`/${REPO}/assets/`));
    });

    it("serves /<repo>/data/current.json as valid JSON", async () => {
        const { status, body } = await get(`/${REPO}/data/current.json`);
        expect(status).toBe(200);
        const parsed = JSON.parse(body);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.length).toBeGreaterThan(0);
        expect(parsed[0]).toHaveProperty("station");
    });

    it("serves /<repo>/data/forecast.json as valid JSON", async () => {
        const { status, body } = await get(`/${REPO}/data/forecast.json`);
        expect(status).toBe(200);
        const parsed = JSON.parse(body);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed[0]).toHaveProperty("forecast_date");
    });

    it("serves /<repo>/data/warnings.json as valid JSON", async () => {
        const { status, body } = await get(`/${REPO}/data/warnings.json`);
        expect(status).toBe(200);
        const parsed = JSON.parse(body);
        expect(Array.isArray(parsed)).toBe(true);
    });

    it("serves /<repo>/data/state.json with all risk-config keys", async () => {
        const { status, body } = await get(`/${REPO}/data/state.json`);
        expect(status).toBe(200);
        const parsed = JSON.parse(body);
        // These keys are required by the static-mode client.
        for (const k of [
            "wbt_thresholds",
            "hne_thresholds",
            "vulnerability_config",
            "warning_multipliers",
            "t8_floor",
            "state_ranges",
        ]) {
            expect(parsed, `state.json missing ${k}`).toHaveProperty(k);
        }
    });

    it("returns 404 for unknown paths (no SPA fallback leaks to root)", async () => {
        const { status } = await get(`/${REPO}/this-does-not-exist.json`);
        expect(status).toBe(404);
    });
});
