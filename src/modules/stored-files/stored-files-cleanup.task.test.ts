import { Logger } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { StoredFilesCleanupTask } from './stored-files-cleanup.task'
import { StoredFilesService } from './stored-files.service'

const MINUTE_MS = 60_000
const mockStoredFilesService = { deleteExpired: vi.fn() }

describe('StoredFilesCleanupTask', () => {
  let task: StoredFilesCleanupTask

  beforeEach(async () => {
    vi.useFakeTimers()
    const module: TestingModule = await Test.createTestingModule({
      providers: [StoredFilesCleanupTask, { provide: StoredFilesService, useValue: mockStoredFilesService }],
    }).compile()

    task = module.get(StoredFilesCleanupTask)
    mockStoredFilesService.deleteExpired.mockResolvedValue(0)
  })

  afterEach(() => {
    task.onApplicationShutdown()
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  it('should run 5 minutes after starting and then once a day', async () => {
    task.onApplicationBootstrap()

    await vi.advanceTimersByTimeAsync(4 * MINUTE_MS)
    expect(mockStoredFilesService.deleteExpired).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(MINUTE_MS)
    expect(mockStoredFilesService.deleteExpired).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(24 * 60 * MINUTE_MS)
    expect(mockStoredFilesService.deleteExpired).toHaveBeenCalledTimes(2)
  })

  it('should log a failed run and keep the schedule', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    mockStoredFilesService.deleteExpired.mockRejectedValueOnce(new Error('R2 down'))
    task.onApplicationBootstrap()

    await vi.advanceTimersByTimeAsync(5 * MINUTE_MS)
    expect(error).toHaveBeenCalledWith('[run] R2 down')

    await vi.advanceTimersByTimeAsync(24 * 60 * MINUTE_MS)
    expect(mockStoredFilesService.deleteExpired).toHaveBeenCalledTimes(2)
  })

  it('should stop the timers on shutdown', async () => {
    task.onApplicationBootstrap()
    task.onApplicationShutdown()

    await vi.advanceTimersByTimeAsync(2 * 24 * 60 * MINUTE_MS)
    expect(mockStoredFilesService.deleteExpired).not.toHaveBeenCalled()
  })
})
