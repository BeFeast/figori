/** One document lifecycle operation owns all asynchronous dialogs and IO. */
export class OperationGate {
  private running = false;
  constructor(
    private readonly changed: (running: boolean) => void = () => {},
  ) {}
  get active() {
    return this.running;
  }
  async run<T>(operation: () => Promise<T>, blocked: T): Promise<T> {
    if (this.running) return blocked;
    this.running = true;
    this.changed(true);
    try {
      return await operation();
    } finally {
      this.running = false;
      this.changed(false);
    }
  }
}
