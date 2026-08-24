export type ManualOrderTaskScheduler = (task: () => Promise<void>) => void;

export async function persistManualOrderThenSchedule<T>(input: {
  persist: () => Promise<T>;
  reconcile: (result: T) => Promise<void>;
  schedule: ManualOrderTaskScheduler;
}): Promise<T> {
  const result = await input.persist();
  input.schedule(() => input.reconcile(result));
  return result;
}
