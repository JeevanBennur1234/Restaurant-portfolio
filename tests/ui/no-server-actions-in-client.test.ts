import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Architecture Guardrail: No server actions in client components", () => {
  function getFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let files: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files = files.concat(getFiles(fullPath));
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
      ) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const filesToCheck = [
    ...getFiles("src/components/guest"),
    ...getFiles("src/components/kitchen"),
    ...getFiles("src/components/admin"),
  ];

  it("ensures client components do not import from server actions or queries", () => {
    const violations: string[] = [];

    for (const file of filesToCheck) {
      const normFile = path.normalize(file);
      const content = fs.readFileSync(normFile, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
          line.includes('from "@/server/actions') ||
          line.includes("from '@/server/actions") ||
          line.includes('from "@/server/queries') ||
          line.includes("from '@/server/queries")
        ) {
          violations.push(`${normFile}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("confirms that all temporary TODO(P5) demo markers have been resolved", () => {
    const p5Markers: string[] = [];
    for (const file of filesToCheck) {
      const normFile = path.normalize(file);
      const content = fs.readFileSync(normFile, "utf-8");
      if (content.includes("TODO(P5)")) {
        p5Markers.push(normFile);
      }
    }
    expect(p5Markers).toEqual([]);
  });
});
