import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  agents,
  companies,
  companyMemberships,
  createDb,
  heartbeatRuns,
  toolApplications,
  toolConnections,
  toolAccessAuditEvents,
} from "@paperclipai/db";
import { toolAccessService } from "../services/tool-access.js";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";

const support = await getEmbeddedPostgresTestSupport();
const actor = { actorType: "user" as const, actorId: "tailscale-reviewer" };
const CLIENT_ID = "kFIXTURECNTRL";
const CLIENT_SECRET = "tskey-client-fixture-secret-value";
const TOKEN = "tskey-api-fixture-access-token";
const TEST_KEY_SECRET = "tskey-auth-fixture-minted-key";
const PROVIDER_BODY = "private tailnet detail: fixture.example.ts.net tag:secret-tag";
const SECRETS = [CLIENT_SECRET, TOKEN, TEST_KEY_SECRET, PROVIDER_BODY];

(support.supported ? describe : describe.skip)("Tailscale connection lifecycle", () => {
  let db: ReturnType<typeof createDb>;
  let temp: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  beforeAll(async () => {
    temp = await startEmbeddedPostgresTestDatabase("paperclip-tailscale-");
    db = createDb(temp.connectionString);
  }, 30000);
  afterAll(async () => {
    await temp?.cleanup();
  });

  async function fixture() {
    const [company] = await db
      .insert(companies)
      .values({ name: "Tailscale fixture", issuePrefix: `TS${randomUUID().slice(0, 6)}` })
      .returning();
    await db.insert(companyMemberships).values({
      companyId: company.id,
      principalType: "user",
      principalId: actor.actorId,
      membershipRole: "admin",
      status: "active",
    });
    const behavior = { tokenStatus: 0, createStatus: 0, scope: "auth_keys devices:core" };
    const calls: { method: string; path: string; body: string | undefined }[] = [];
    const request = vi.fn(async (url: string, init: RequestInit) => {
      const parsed = new URL(url);
      expect(parsed.origin).toBe("https://api.tailscale.com");
      const path = parsed.pathname.replace("/api/v2", "") + parsed.search;
      calls.push({ method: init.method ?? "GET", path, body: typeof init.body === "string" ? init.body : undefined });
      if (path === "/oauth/token") {
        const form = new URLSearchParams(String(init.body));
        if (behavior.tokenStatus || form.get("client_id") !== CLIENT_ID || form.get("client_secret") !== CLIENT_SECRET) {
          return Response.json({ message: PROVIDER_BODY }, { status: behavior.tokenStatus || 401 });
        }
        return Response.json({ access_token: TOKEN, token_type: "Bearer", expires_in: 3600, scope: behavior.scope });
      }
      if (new Headers(init.headers).get("Authorization") !== `Bearer ${TOKEN}`) {
        return Response.json({ message: PROVIDER_BODY }, { status: 401 });
      }
      if (/^\/tailnet\/[^/]+\/devices\?fields=all$/.test(path)) {
        return Response.json({ devices: [{ nodeId: "nFIXTURE1", name: "devbox.fixture.example.ts.net", addresses: ["100.64.0.7"] }] });
      }
      if (/^\/tailnet\/[^/]+\/keys$/.test(path) && init.method === "POST") {
        if (behavior.createStatus) return Response.json({ message: PROVIDER_BODY }, { status: behavior.createStatus });
        const requested = JSON.parse(String(init.body)) as { capabilities: { devices: { create: { tags: string[] } } } };
        return Response.json({
          id: "kTESTKEY1",
          key: TEST_KEY_SECRET,
          expires: "2026-10-09T10:05:00Z",
          capabilities: { devices: { create: { reusable: false, ephemeral: true, preauthorized: true, tags: requested.capabilities.devices.create.tags } } },
        });
      }
      if (/^\/tailnet\/[^/]+\/keys\/kTESTKEY1$/.test(path) && init.method === "DELETE") return new Response(null, { status: 200 });
      throw new Error(`Unexpected fixture path ${init.method} ${path}`);
    });
    const access = toolAccessService(db, {
      remoteHttpRequest: request,
      remoteHttpEndpointLookup: async () => [{ address: "8.8.8.8", family: 4 }],
    });
    return { company, access, behavior, calls, request };
  }

  function expectRedacted(value: unknown) {
    const text = JSON.stringify(value) ?? "";
    for (const secret of SECRETS) expect(text).not.toContain(secret);
  }

  it("verifies the OAuth client at setup, stores a redacted summary, and keeps the client in the vault", async () => {
    const { company, access, calls } = await fixture();
    const connected = await access.connectGalleryApp(
      company.id,
      {
        galleryKey: "tailscale",
        connectionMethodKey: "oauth-client",
        credentialValues: {
          "credentials.oauthClientId": CLIENT_ID,
          "credentials.oauthClientSecret": CLIENT_SECRET,
        },
      },
      actor,
    );
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "POST /oauth/token",
      "GET /tailnet/-/devices?fields=all",
      "POST /tailnet/-/keys",
      "DELETE /tailnet/-/keys/kTESTKEY1",
    ]);
    expect(JSON.parse(calls[2]!.body!)).toMatchObject({
      capabilities: { devices: { create: { reusable: false, ephemeral: true, preauthorized: true, tags: ["tag:paperclip-agent"] } } },
      expirySeconds: 300,
    });
    expect(connected.catalog).toEqual([]);
    expect(connected.connection.healthStatus).toBe("ok");
    expect(connected.connection.healthMessage).toBe(
      "Tailscale OAuth client is connected to the client's tailnet. Scopes: auth_keys, devices:core. Tags: tag:paperclip-agent. Devices visible: 1.",
    );

    const [row] = await db.select().from(toolConnections).where(eq(toolConnections.id, connected.connectionId));
    expect(row.transport).toBe("rest_api");
    expect(row.config).toMatchObject({
      sourceTemplateKey: "tailscale",
      connectionMethodKey: "oauth-client",
      methodConfig: { tailnet: "-", agentTag: "tag:paperclip-agent" },
      tailscale: { tailnet: "-", scopes: ["auth_keys", "devices:core"], tags: ["tag:paperclip-agent"], deviceCount: 1 },
    });
    expect(row.credentialSecretRefs.map((ref) => ref.configPath).sort()).toEqual([
      "credentials.oauthClientId",
      "credentials.oauthClientSecret",
    ]);
    // Neither OAuth field is a request header, so nothing is projected as one.
    expect(row.credentialRefs).toEqual([]);
    expectRedacted(row.config);
    expectRedacted(connected);
    const [application] = await db.select().from(toolApplications).where(eq(toolApplications.id, row.applicationId));
    expect(application.type).toBe("rest_api");

    // A later health check repeats the full probe and keeps the summary current.
    calls.length = 0;
    const checked = await access.checkHealth(connected.connectionId, actor);
    expect(checked.connection.healthStatus).toBe("ok");
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "POST /oauth/token",
      "GET /tailnet/-/devices?fields=all",
      "POST /tailnet/-/keys",
      "DELETE /tailnet/-/keys/kTESTKEY1",
    ]);
    const audits = await db.select().from(toolAccessAuditEvents).where(eq(toolAccessAuditEvents.connectionId, connected.connectionId));
    expect(audits.some((entry) => entry.action === "tool_connection.health_check" && entry.outcome === "success")).toBe(true);
    expectRedacted(audits);
  });

  it("addresses the configured tailnet and agent tag", async () => {
    const { company, access, calls } = await fixture();
    await access.connectGalleryApp(
      company.id,
      {
        galleryKey: "tailscale",
        connectionMethodKey: "oauth-client",
        configValues: { tailnet: "example.com", agentTag: "tag:paperclip-lab" },
        credentialValues: {
          "credentials.oauthClientId": CLIENT_ID,
          "credentials.oauthClientSecret": CLIENT_SECRET,
        },
      },
      actor,
    );
    expect(calls.map((call) => `${call.method} ${call.path}`)).toContain("GET /tailnet/example.com/devices?fields=all");
    expect(JSON.parse(calls[2]!.body!).capabilities.devices.create.tags).toEqual(["tag:paperclip-lab"]);
  });

  it("maps a provider refusal to an actionable 422 without echoing the provider body", async () => {
    const { company, access, behavior } = await fixture();
    behavior.createStatus = 403;
    await expect(
      access.connectGalleryApp(
        company.id,
        {
          galleryKey: "tailscale",
          connectionMethodKey: "oauth-client",
          credentialValues: {
            "credentials.oauthClientId": CLIENT_ID,
            "credentials.oauthClientSecret": CLIENT_SECRET,
          },
        },
        actor,
      ),
    ).rejects.toMatchObject({
      status: 422,
      details: { code: "tailscale_tag_not_owned" },
      message: expect.stringContaining("tag:paperclip-agent"),
    });

    behavior.createStatus = 0;
    const connected = await access.connectGalleryApp(
      company.id,
      {
        galleryKey: "tailscale",
        connectionMethodKey: "oauth-client",
        credentialValues: {
          "credentials.oauthClientId": CLIENT_ID,
          "credentials.oauthClientSecret": CLIENT_SECRET,
        },
      },
      actor,
    );
    behavior.tokenStatus = 401;
    const failure = await access.checkHealth(connected.connectionId, actor).then(
      () => null,
      (error: unknown) => error as { status: number; message: string; details: Record<string, unknown> },
    );
    expect(failure).toMatchObject({ status: 422, details: { code: "tailscale_client_invalid" } });
    expect(failure!.message).not.toContain(PROVIDER_BODY);
    const [row] = await db.select().from(toolConnections).where(eq(toolConnections.id, connected.connectionId));
    expect(row.healthStatus).toBe("error");
    expect(row.healthMessage).toContain("rejected the OAuth client");
    expectRedacted(row);
  });

  it("refuses to export the OAuth client to an agent", async () => {
    const { company, access } = await fixture();
    const connected = await access.connectGalleryApp(
      company.id,
      {
        galleryKey: "tailscale",
        connectionMethodKey: "oauth-client",
        credentialValues: {
          "credentials.oauthClientId": CLIENT_ID,
          "credentials.oauthClientSecret": CLIENT_SECRET,
        },
      },
      actor,
    );
    const [agent] = await db
      .insert(agents)
      .values({ companyId: company.id, name: "Tailnet agent", role: "engineer", adapterType: "process", adapterConfig: {} })
      .returning();
    const [run] = await db
      .insert(heartbeatRuns)
      .values({ companyId: company.id, agentId: agent.id, invocationSource: "on_demand", status: "running" })
      .returning();
    await expect(
      access.mintConnectionTokenForAgent({
        connectionId: connected.connectionId,
        companyId: company.id,
        agentId: agent.id,
        runId: run.id,
        body: {},
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
