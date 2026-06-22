// Minimal counting semaphore for bounding concurrent operations within one process.
// Used to cap how many candidate code-execution containers run simultaneously so a
// burst of /run calls cannot exhaust the host's CPU/RAM/Docker daemon.

export class Semaphore {
  private active = 0;

  constructor(private readonly max: number) {}

  get inUse(): number {
    return this.active;
  }

  /** Non-blocking acquire. Returns false if at capacity. */
  tryAcquire(): boolean {
    if (this.active >= this.max) return false;
    this.active += 1;
    return true;
  }

  release(): void {
    if (this.active > 0) this.active -= 1;
  }
}
