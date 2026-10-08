import { createWorkScheduler } from "./work-scheduler.js";
import { subscribeDeliveryWork, type DeliveryQueue } from "./delivery-work-notifications.js";
import { beginIdleTrackedWork } from "./task-admission.js";

// Keep recovery until all writers participate in a proven idle/wake boundary.
// It is deliberately independent of optional notifications, including writes
// from another process or a transaction with a lost commit acknowledgement.
export const DELIVERY_RECOVERY_INTERVAL_MS = 60_000;
export function createDeliveryWorkCoordinator(input: {
  owner: object;
  canRun: () => boolean;
  onError: (error: unknown, queue: DeliveryQueue) => void;
}) {
  const scheduler = createWorkScheduler();
  const workers = new Map<DeliveryQueue, { wake: () => void; stop: () => Promise<void> }>();
  let stopped = false;
  function scheduleRecovery() {
    if (stopped || !workers.size) return;
    scheduler.schedule("delivery-recovery", Date.now() + DELIVERY_RECOVERY_INTERVAL_MS, () => {
      for (const worker of workers.values()) worker.wake();
      scheduleRecovery();
    });
  }

  return {
    // Only these registered tasks are represented; not yet the whole instance.
    nextWakeAt: scheduler.nextWakeAt,
    register(queue: DeliveryQueue, task: {
      retryMs: number;
      run: (signal: AbortSignal) => Promise<unknown>;
      hasPending: () => Promise<boolean>;
    }) {
      if (stopped) throw new Error("Delivery coordinator is stopped");
      if (workers.has(queue)) throw new Error(`Delivery worker already registered: ${queue}`);
      let dirty = false;
      let running: Promise<void> | null = null;
      let workerStopped = false;
      let controller: AbortController | null = null;
      function schedule(delay: number) {
        if (!workerStopped) scheduler.schedule(queue, Date.now() + delay, start);
      }
      function start() {
        if (workerStopped || running) return;
        scheduler.cancel(queue);
        if (!input.canRun()) { schedule(task.retryMs); return; }
        dirty = false;
        const finish = beginIdleTrackedWork();
        const attempt = new AbortController();
        controller = attempt;
        running = Promise.resolve().then(() => task.run(attempt.signal)).then(() => workerStopped ? false : task.hasPending()).then(pending => {
          if (pending) schedule(task.retryMs);
        }).catch(error => {
          schedule(task.retryMs);
          // Logging must never turn a recoverable sweep failure into an
          // unhandled rejection or prevent other queues from running.
          try { if (!workerStopped) input.onError(error, queue); } catch { /* Recovery remains scheduled. */ }
        }).finally(() => {
          running = null;
          controller = null;
          finish();
          if (dirty) schedule(0);
        });
      }
      function wake() {
        if (workerStopped) return;
        dirty = true;
        if (!running) schedule(0);
      }
      const unsubscribe = subscribeDeliveryWork(input.owner, queue, wake);
      const worker = { wake, async stop() {
        workerStopped = true;
        controller?.abort(new Error("Delivery worker stopped"));
        unsubscribe();
        scheduler.cancel(queue);
        await running;
      } };
      workers.set(queue, worker);
      if (workers.size === 1) scheduleRecovery();
      const ready = Promise.resolve().then(() => { start(); return running; });
      return { ready, wake };
    },
    async stop() {
      stopped = true;
      scheduler.stop();
      await Promise.all(Array.from(workers.values(), worker => worker.stop()));
      workers.clear();
    },
  };
}
