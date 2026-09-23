import { generateExpenseExtractionPrompt } from './expense-extraction.prompt'

describe('generateExpenseExtractionPrompt', () => {
  it('should include today and the catalogs', () => {
    const prompt = generateExpenseExtractionPrompt({ today: '2026-09-22', catalogText: 'people:\np1 Brando' })

    expect(prompt).toContain('Today is 2026-09-22')
    expect(prompt).toContain('p1 Brando')
    expect(prompt).not.toContain('Draft being corrected')
  })

  it('should include the draft when the user is correcting an expense', () => {
    const prompt = generateExpenseExtractionPrompt({
      today: '2026-09-22',
      catalogText: '',
      draft: { description: 'Almuerzo', amount: 25 },
    })

    expect(prompt).toContain('Draft being corrected')
    expect(prompt).toContain('"description":"Almuerzo"')
  })
})
