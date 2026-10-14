import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Architecture Guardrail: No server actions in client components", () => {
  const allowList: Record<string, string[]> = {
    [path.normalize("src/components/kitchen/kitchen-login.tsx")]: [
      "demoLoginAction",
    ],
    [path.normalize("src/components/admin/admin-login.tsx")]: [
      "demoLoginAction",
    ],
    [path.normalize("src/components/guest/order-live-tracker.tsx")]: [
      "simulateKitchenStepAction",
    ],
  };

  function getFiles(dir: string): string[] {
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

  it("ensures client components do not import from server actions or queries except allow-listed demo helpers", () => {
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
          const allowedItems = allowList[normFile] || [];
          const isAllowed = allowedItems.some((item) => line.includes(item));
          if (!isAllowed) {
            violations.push(`${normFile}:${i + 1}: ${line.trim()}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("confirms that allowed demo helper call sites are explicitly marked with TODO(P5)", () => {
    for (const file of Object.keys(allowList)) {
      const content = fs.readFileSync(file, "utf-8");
      expect(content).toContain("TODO(P5): replace with demo API");
    }
  });
});
