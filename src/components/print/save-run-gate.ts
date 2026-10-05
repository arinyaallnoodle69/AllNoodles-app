export function createSaveRunGate() {
  let version = 0;

  return {
    start() {
      version += 1;
      return version;
    },
    cancel() {
      version += 1;
    },
    isActive(runVersion: number) {
      return version === runVersion;
    },
  };
}
