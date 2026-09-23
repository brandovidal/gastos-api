import { KeyedQueue } from './keyed-queue.helper'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('KeyedQueue', () => {
  it('should run tasks of the same key in order', async () => {
    const queue = new KeyedQueue()
    const order: string[] = []

    await Promise.all([
      queue.run('chat', async () => {
        await delay(20)
        order.push('first')
      }),
      queue.run('chat', async () => {
        order.push('second')
      }),
    ])

    expect(order).toEqual(['first', 'second'])
  })

  it('should keep going after a failed task', async () => {
    const queue = new KeyedQueue()
    const failed = queue.run('chat', async () => {
      throw new Error('boom')
    })
    const next = queue.run('chat', async () => undefined)

    await expect(failed).rejects.toThrow('boom')
    await expect(next).resolves.toBeUndefined()
  })

  it('should run different keys in parallel and forget finished keys', async () => {
    const queue = new KeyedQueue()
    const order: string[] = []

    await Promise.all([
      queue.run('a', async () => {
        await delay(20)
        order.push('a')
      }),
      queue.run('b', async () => {
        order.push('b')
      }),
    ])
    await delay(0)

    expect(order).toEqual(['b', 'a'])
    expect(queue.size).toBe(0)
  })

  describe('drain', () => {
    it('should resolve true at once when nothing is queued', async () => {
      await expect(new KeyedQueue().drain(10)).resolves.toBe(true)
    })

    it('should wait for the queued tasks, or give up after the timeout', async () => {
      const queue = new KeyedQueue()
      void queue.run('a', () => new Promise((resolve) => setTimeout(resolve, 20)))
      await expect(queue.drain(1_000)).resolves.toBe(true)

      void queue.run('b', () => new Promise((resolve) => setTimeout(resolve, 1_000)))
      await expect(queue.drain(10)).resolves.toBe(false)
    })
  })
})
