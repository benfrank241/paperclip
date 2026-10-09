import { afterEach, describe, expect, it, vi } from "vitest";
import { adaptersApi } from "./adapters";
import { api } from "./client";
import { queryKeys } from "../lib/queryKeys";

afterEach(() => vi.restoreAllMocks());

describe("adapter availability discovery", () => {
  it("keeps inventory unscoped and sends the selected company and target", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue([]);
    await adaptersApi.list();
    await adaptersApi.list({ companyId: "company-1", environmentId: "linux ssh" });
    await adaptersApi.list({ companyId: "company-2", environmentId: null });
    expect(get.mock.calls.map(([path]) => path)).toEqual([
      "/adapters", "/adapters?companyId=company-1&environmentId=linux+ssh", "/adapters?companyId=company-2",
    ]);
  });
  it("isolates target availability from inventory, other targets, and other companies", () => {
    const selected = queryKeys.adapters.availability("company-1", "linux");
    expect(selected).not.toEqual(queryKeys.adapters.all);
    expect(selected).not.toEqual(queryKeys.adapters.availability("company-1", "mac"));
    expect(selected).not.toEqual(queryKeys.adapters.availability("company-2", "linux"));
  });
});
