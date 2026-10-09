import { describe, expect, it } from "vitest";
import { agentHarnessType, agentRunner, paperclipRunnerProfileForHarness, paperclipRunnerSupportsPlatform } from "./agent-runner.js";
import { createAgentSchema, updateAgentSchema, testAdapterEnvironmentSchema } from "./validators/agent.js";

describe("Codex creation runner contract", () => {
  it("graduates only Codex and retains saved provider identity", () => {
    expect(paperclipRunnerProfileForHarness("codex_local")).toEqual({ provider: "codex" });
    for (const harness of ["claude_local", "opencode_local", "grok_local", "cursor", "pi_local", "process"]) expect(paperclipRunnerProfileForHarness(harness)).toBeUndefined();
    expect(agentHarnessType("paperclip_runner", { provider: "codex" })).toBe("codex_local");
    expect(agentHarnessType("paperclip_runner", { provider: "acpx", acpxAgent: "claude" })).toBe("claude_local");
    expect(agentHarnessType("paperclip_runner", { provider: "unknown" })).toBe("unknown");
    expect(agentHarnessType("paperclip_runner", { provider: "acpx", acpxAgent: "unknown" })).toBe("acpx:unknown");
    expect(agentRunner("codex_local")).toBe("legacy");
    expect(agentRunner("paperclip_runner")).toBe("paperclip");
  });
  it("qualifies only the daemon actually shipped in public server packages", () => {
    expect(paperclipRunnerSupportsPlatform("codex_local", "linux", "x64")).toBe(true);
    for (const [platform, architecture] of [["darwin", "arm64"], ["darwin", "x64"], ["linux", "arm64"], ["win32", "x64"], ["freebsd", "x64"]]) expect(paperclipRunnerSupportsPlatform("codex_local", platform, architecture)).toBe(false);
  });
  it("keeps auto out of saved update defaults and validates request intent", () => {
    expect(createAgentSchema.parse({ name: "Codex", adapterType: "codex_local" }).runner).toBeUndefined();
    expect(updateAgentSchema.parse({ title: "same execution" })).not.toHaveProperty("runner");
    expect(testAdapterEnvironmentSchema.parse({ runner: "legacy" }).runner).toBe("legacy");
    expect(createAgentSchema.safeParse({ name: "Codex", adapterType: "codex_local", runner: "other" }).success).toBe(false);
  });
});
