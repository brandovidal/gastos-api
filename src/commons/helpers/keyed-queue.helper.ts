// Runs tasks one after another per key (chat) and in parallel across keys.
// In memory on purpose: a single-user bot on one process does not need a broker (YAGNI).
export class KeyedQueue {
  private readonly tails = new Map<string, Promise<void>>()

  run(key: string, task: () => Promise<void>): Promise<void> {
    const previous = this.tails.get(key) ?? Promise.resolve()
    const next = previous.then(task, task)

    const tail = next.catch(() => undefined)
    this.tails.set(key, tail)
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key)
    })

    return next
  }

  get size(): number {
    return this.tails.size
  }
}
