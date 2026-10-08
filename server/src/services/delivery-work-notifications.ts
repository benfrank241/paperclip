/** Optional post-commit fast paths. Startup and scheduled recovery remain authoritative. */
export const DELIVERY_QUEUES = {
  feedback: "feedback-exports",
  chatCompletion: "chat-completions",
  connection: "connection-continuations",
  question: "question-responses",
  toolAction: "tool-action-receipts",
} as const;
export type DeliveryQueue = typeof DELIVERY_QUEUES[keyof typeof DELIVERY_QUEUES];

// The database object is only an identity key. No method is wrapped or changed.
const listeners = new WeakMap<object, Map<DeliveryQueue, () => void>>();
export function notifyDeliveryWork(owner: object, queue: DeliveryQueue): void {
  try { listeners.get(owner)?.get(queue)?.(); }
  catch (error) { process.emitWarning(`Delivery notification failed: ${String(error)}`); }
}
export function subscribeDeliveryWork(owner: object, queue: DeliveryQueue, wake: () => void): () => void {
  let queues = listeners.get(owner);
  if (!queues) listeners.set(owner, queues = new Map());
  if (queues.has(queue)) throw new Error(`Delivery worker already registered: ${queue}`);
  queues.set(queue, wake);
  return () => { queues.delete(queue); };
}
