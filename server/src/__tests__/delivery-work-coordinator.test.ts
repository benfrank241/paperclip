import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeliveryWorkCoordinator, DELIVERY_RECOVERY_INTERVAL_MS } from "../services/delivery-work-coordinator.js";
import { notifyDeliveryWork, DELIVERY_QUEUES, subscribeDeliveryWork } from "../services/delivery-work-notifications.js";
import { idleWorkSnapshot } from "../services/task-admission.js";

const coordinators: ReturnType<typeof createDeliveryWorkCoordinator>[] = [];
afterEach(async () => { for (const c of coordinators.splice(0)) await c.stop(); vi.useRealTimers(); });
function setup() {
  vi.useFakeTimers();
  const owner = {}, canRun = vi.fn(() => true), onError = vi.fn();
  const coordinator = createDeliveryWorkCoordinator({ owner, canRun, onError });
  coordinators.push(coordinator);
  return { owner, canRun, onError, coordinator };
}
function task() { return { retryMs: 5000, run: vi.fn(async () => {}), hasPending: vi.fn(async () => false) }; }

describe("delivery work coordinator", () => {
  it("all five empty queues share one recovery deadline and wake immediately on a nudge", async () => {
    const s = setup();
    const tasks = Object.values(DELIVERY_QUEUES).map(queue => {
      const t = task(); return { queue, t, worker: s.coordinator.register(queue, t) };
    });
    await Promise.all(tasks.map(t => t.worker.ready));
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    for (const { queue, t } of tasks) {
      expect(t.run).toHaveBeenCalledTimes(1);
      notifyDeliveryWork(s.owner, queue); notifyDeliveryWork(s.owner, queue);
    }
    await vi.advanceTimersByTimeAsync(1);
    for (const { t } of tasks) expect(t.run).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
    expect(idleWorkSnapshot().active).toBe(0);
  });
  it("recovers a missed notification without a restart or unrelated enqueue", async () => {
    const s = setup(), t = task();
    let persisted = false;
    t.run.mockImplementation(async () => { persisted = false; });
    await s.coordinator.register(DELIVERY_QUEUES.question, t).ready;
    persisted = true; // External write, forgotten nudge, or lost COMMIT reply.
    await vi.advanceTimersByTimeAsync(DELIVERY_RECOVERY_INTERVAL_MS + 1);
    expect(persisted).toBe(false);
    expect(t.run).toHaveBeenCalledTimes(2);
    expect(idleWorkSnapshot().active).toBe(0);
  });
  it("retries pending deliveries and transient failures, then returns to shared recovery only", async () => {
    const s = setup(), t = task();
    t.run.mockRejectedValueOnce(new Error("database disconnected"));
    t.hasPending.mockResolvedValueOnce(true);
    await s.coordinator.register(DELIVERY_QUEUES.feedback, t).ready;
    expect(s.onError).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.run).toHaveBeenCalledTimes(3);
    expect(s.coordinator.nextWakeAt()).toBe(Date.now() + 50_000);
    expect(idleWorkSnapshot().active).toBe(0);
  });
  it("does not overlap a sweep or lose a nudge during its final pending check", async () => {
    const s = setup(), t = task();
    let release!: (pending: boolean) => void;
    t.hasPending.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    s.coordinator.register(DELIVERY_QUEUES.connection, t);
    await vi.advanceTimersByTimeAsync(1);
    notifyDeliveryWork(s.owner, DELIVERY_QUEUES.connection);
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.run).toHaveBeenCalledTimes(1);
    release(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.run).toHaveBeenCalledTimes(2);
  });
  it("does not query during drain or standby and recovers on admission reopening", async () => {
    const s = setup(), t = task(); s.canRun.mockReturnValue(false);
    await s.coordinator.register(DELIVERY_QUEUES.toolAction, t).ready;
    notifyDeliveryWork(s.owner, DELIVERY_QUEUES.toolAction);
    await vi.advanceTimersByTimeAsync(2 * DELIVERY_RECOVERY_INTERVAL_MS);
    expect(t.run).not.toHaveBeenCalled();
    expect(t.hasPending).not.toHaveBeenCalled();
    expect(idleWorkSnapshot().active).toBe(0);
    s.canRun.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(5001);
    expect(t.run).toHaveBeenCalledTimes(1);
  });
  it("awaits in-flight work on shutdown and releases the subscription for restart", async () => {
    const s = setup(), t = task();
    let release!: () => void;
    t.run.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    s.coordinator.register(DELIVERY_QUEUES.chatCompletion, t);
    await vi.advanceTimersByTimeAsync(1);
    const stopped = vi.fn();
    const stopping = s.coordinator.stop().then(stopped);
    notifyDeliveryWork(s.owner, DELIVERY_QUEUES.chatCompletion);
    expect(stopped).not.toHaveBeenCalled();
    release(); await stopping;
    expect(vi.getTimerCount()).toBe(0);
    expect(idleWorkSnapshot().active).toBe(0);
    const replacement = createDeliveryWorkCoordinator({ owner: s.owner, canRun: () => true, onError: vi.fn() });
    coordinators.push(replacement);
    await replacement.register(DELIVERY_QUEUES.chatCompletion, t).ready;
    expect(t.run).toHaveBeenCalledTimes(2);
  });
  it("isolates owners and topics and never rejects a commit because its optional listener fails", () => {
    const s = setup(), other = {}, listener = vi.fn();
    const unsubscribe = subscribeDeliveryWork(s.owner, DELIVERY_QUEUES.feedback, listener);
    notifyDeliveryWork(other, DELIVERY_QUEUES.feedback);
    notifyDeliveryWork(s.owner, DELIVERY_QUEUES.question);
    expect(listener).not.toHaveBeenCalled();
    notifyDeliveryWork(s.owner, DELIVERY_QUEUES.feedback);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
    const cleanup = subscribeDeliveryWork(s.owner, DELIVERY_QUEUES.feedback, () => { throw new Error("listener"); });
    expect(() => notifyDeliveryWork(s.owner, DELIVERY_QUEUES.feedback)).not.toThrow();
    expect(warn).toHaveBeenCalledOnce(); cleanup(); warn.mockRestore();
  });
});
