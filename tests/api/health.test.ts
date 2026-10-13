import { describe, it, expect, vi } from "vitest";
import { GET } from "@/app/api/v1/health/route";
import { db } from "@/server/db";

describe("Health API Route", () => {
  it("probes database with SELECT 1 and returns status ok with timestamp", async () => {
    const executeSpy = vi.spyOn(db, "execute").mockResolvedValueOnce({
      rows: [],
    } as unknown as Awaited<ReturnType<typeof db.execute>>);

    const res = await GET();
    expect(res.status).toBe(200);

    const json = (await res.json()) as { success: boolean; data: { status: string; time: string } };
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("ok");
    expect(typeof json.data.time).toBe("string");
    expect(executeSpy).toHaveBeenCalled();
  });
});
