import { test, expect, type Locator, type Page } from '@playwright/test'
import { newSignedInContext, ptE2eEnabled } from './support'

async function startWorkoutWithExercise(page: Page) {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: /start workout/i }).click()
  await expect(page).toHaveURL(/\/workout\/\d+$/)
  await page.getByRole('button', { name: /add exercise/i }).click()
  const picker = page.getByRole('dialog', { name: /select exercise/i })
  await picker.getByRole('button', { name: /QA Snapshot Squat 47391/i }).click()
  await expect(page.getByText('Adding set')).toBeVisible()
}

async function addStrengthSet(page: Page, weight: string, reps: string) {
  const addCard = page.getByText('Adding set').locator('..').locator('..')
  await enterStepper(page, addCard, 'Weight (kg)', weight)
  await enterStepper(page, addCard, 'Reps', reps)
  await addCard.getByRole('button', { name: /^add$/i }).click()
}

async function enterStepper(page: Page, scope: Locator, label: string, value: string) {
  const input = scope.getByRole('textbox', { name: label, exact: true })
  const existing = await input.inputValue()
  await input.click()
  const numpad = page.getByRole('dialog', { name: `Enter ${label}` })
  for (let i = 0; i < existing.length; i += 1) {
    await numpad.getByRole('button', { name: /delete last digit/i }).click()
  }
  for (const digit of value) {
    await numpad.getByRole('button', { name: digit, exact: true }).click()
  }
  await numpad.getByRole('button', { name: /^done$/i }).click()
}

async function deleteWorkout(page: Page) {
  await page.getByRole('button', { name: /back/i }).first().click()
  const leave = page.getByRole('dialog', { name: /leave workout/i })
  await leave.getByRole('button', { name: /delete workout/i }).click()
  const confirm = page.getByRole('dialog', { name: /delete this workout/i })
  await confirm.getByRole('button', { name: /^delete$/i }).click()
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/)
}

async function restSecondsRemaining(page: Page): Promise<number> {
  const restHeader = page.getByText('Resting', { exact: true })
  const text = await restHeader.locator('..').textContent()
  const match = text?.match(/(\d+):(\d{2})/)
  if (!match) throw new Error(`Could not read rest countdown from: ${text}`)
  return Number(match[1]) * 60 + Number(match[2])
}

async function installSpeechRecorder(page: Page) {
  const install = () => {
    const spoken: string[] = []
    const utterances: Array<{ text: string; rate: number; pitch: number; volume: number; voiceURI: string | null }> = []
    const coachAudio: Array<{ src: string; playbackRate: number; volume: number }> = []
    const voices = [
      { voiceURI: 'voice:clear', name: 'QA Clear', lang: 'en-US', default: true, localService: true },
      { voiceURI: 'voice:calm', name: 'QA Calm', lang: 'en-GB', default: false, localService: true },
    ]
    class RecordedUtterance {
      text: string
      lang = ''
      rate = 1
      pitch = 1
      volume = 1
      voice: (typeof voices)[number] | null = null

      constructor(text: string) {
        this.text = text
      }
    }
    Object.defineProperty(window, '__guidedSpeech', {
      configurable: true,
      value: spoken,
    })
    Object.defineProperty(window, '__guidedUtterances', {
      configurable: true,
      value: utterances,
    })
    Object.defineProperty(window, '__guidedCoachAudio', {
      configurable: true,
      value: coachAudio,
    })
    Object.defineProperty(window, '__guidedAudioFail', {
      configurable: true,
      writable: true,
      value: false,
    })
    class RecordedAudio extends EventTarget {
      src: string
      preload = ''
      playbackRate = 1
      volume = 1

      constructor(src = '') {
        super()
        this.src = src
      }

      play() {
        coachAudio.push({ src: this.src, playbackRate: this.playbackRate, volume: this.volume })
        queueMicrotask(() => this.dispatchEvent(new Event(
          (window as unknown as { __guidedAudioFail: boolean }).__guidedAudioFail ? 'error' : 'ended',
        )))
        return Promise.resolve()
      }

      pause() {}
      load() {}
      removeAttribute(name: string) { if (name === 'src') this.src = '' }
    }
    Object.defineProperty(window, 'Audio', {
      configurable: true,
      value: RecordedAudio,
    })
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: RecordedUtterance,
    })
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak(utterance: RecordedUtterance) {
          spoken.push(utterance.text)
          utterances.push({
            text: utterance.text,
            rate: utterance.rate,
            pitch: utterance.pitch,
            volume: utterance.volume,
            voiceURI: utterance.voice?.voiceURI ?? null,
          })
        },
        cancel() {},
        pause() {},
        resume() {},
        getVoices() { return voices },
        pending: false,
        speaking: false,
        paused: false,
        onvoiceschanged: null,
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() { return true },
      },
    })
  }
  // Install into the current signed-in document for client-side navigations,
  // and into every later document in case a Server Action causes a full load.
  await page.addInitScript(install)
  await page.evaluate(install)
}

test.describe('active workout guided behavior', () => {
  test.skip(!ptE2eEnabled(), 'Set PT_E2E_ENABLED=true with disposable local fixtures.')

  test('keeps straight sets uniform until the athlete opts into different per-set values', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '8')
      await addStrengthSet(session.page, '60', '8')

      await session.page.getByText('60 kg', { exact: true }).click()
      const editor = session.page.getByRole('checkbox', { name: /different values per set/i }).locator('xpath=../..').locator('..')
      await enterStepper(session.page, editor, 'Weight (kg)', '70')
      await session.page.getByRole('button', { name: /close set editor/i }).click()
      await expect(session.page.getByText('70 kg', { exact: true })).toHaveCount(2)

      await session.page.getByText('70 kg', { exact: true }).last().click()
      const perSet = session.page.getByRole('checkbox', { name: /different values per set/i })
      await perSet.check()
      const perSetEditor = perSet.locator('xpath=../..').locator('..')
      await enterStepper(session.page, perSetEditor, 'Weight (kg)', '50')
      await perSetEditor.getByRole('button', { name: /close set editor/i }).click()
      await expect(session.page.getByText('70 kg', { exact: true })).toHaveCount(1)
      await expect(session.page.getByText('50 kg', { exact: true })).toHaveCount(1)
      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })

  test('persists a set note and shows it in the guided ready state', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '8')
      await session.page.getByText('60 kg', { exact: true }).click()
      const note = session.page.getByRole('textbox', { name: /note for set 1/i })
      await note.fill('Last rep assisted')
      const editor = note.locator('xpath=../..').locator('..')
      await editor.getByRole('button', { name: /start guided set/i }).click()
      const setup = session.page.getByRole('dialog', { name: /guided set:/i })
      await expect(setup.getByText(/voice rep counter/i)).toBeVisible()
      await expect(setup.getByText(/voice options/i)).toBeVisible()
      await expect(setup.getByLabel(/coaching style/i)).toBeHidden()
      await setup.getByRole('button', { name: /^start$/i }).click()
      await expect(session.page.getByText(/this set:.*last rep assisted/i)).toBeVisible()

      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })

  test('keeps adjusted values on an already-completed set after reload', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '8')
      await session.page.getByText('60 kg', { exact: true }).click()
      const editor = session.page.getByRole('button', { name: /save and close set editor/i }).locator('xpath=../..')
      await enterStepper(session.page, editor, 'Weight (kg)', '65')
      await enterStepper(session.page, editor, 'Reps', '9')
      await editor.getByRole('button', { name: /save and close set editor/i }).click()
      await expect(session.page.getByText('65 kg', { exact: true })).toBeVisible()
      await expect(session.page.getByText('9', { exact: true })).toBeVisible()

      await session.page.reload()
      await expect(session.page.getByText('65 kg', { exact: true })).toBeVisible()
      await expect(session.page.getByText('9', { exact: true })).toBeVisible()
      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })

  test('persists pending set state instead of completing every saved row on reload', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '8')
      await session.page.getByTitle('Completed — tap to undo').click()
      await expect(session.page.getByTitle('Mark set done (starts rest)')).toBeVisible()

      await session.page.reload()
      await expect(session.page.getByTitle('Mark set done (starts rest)')).toBeVisible()
      await expect(session.page.getByTitle('Completed — tap to undo')).toHaveCount(0)
      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })

  test('minimize saves open inputs, rest continues, and resume reloads the saved workout', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '8')

      // Leave the editor visibly open: Minimize itself must commit these
      // values instead of relying on an earlier blur or explicit Save.
      await session.page.getByText('60 kg', { exact: true }).click()
      const editor = session.page.getByRole('button', { name: /save and close set editor/i }).locator('xpath=../..')
      await enterStepper(session.page, editor, 'Weight (kg)', '67')
      await enterStepper(session.page, editor, 'Reps', '9')
      await editor.getByRole('textbox', { name: /note for set 1/i }).fill('Resume keeps this note')
      await session.page.getByRole('button', { name: /minimize/i }).click()

      const dock = session.page.getByRole('complementary', { name: /active workout/i })
      await expect(dock).toBeVisible()
      await expect(dock.getByText(/saved workout/i)).toBeVisible()
      const firstClock = await dock.textContent()
      await session.page.goto('/workouts')
      await expect(dock).toBeVisible()
      await session.page.waitForTimeout(1_200)
      await expect.poll(() => dock.textContent()).not.toBe(firstClock)

      await dock.getByRole('link', { name: /resume/i }).click()
      await expect(session.page.getByRole('button', { name: /minimize/i })).toBeVisible()
      await expect(session.page.getByText('67 kg', { exact: true })).toBeVisible()
      await expect(session.page.getByText('9', { exact: true })).toBeVisible()
      await session.page.getByText('67 kg', { exact: true }).click()
      await expect(session.page.getByRole('textbox', { name: /note for set 1/i })).toHaveValue('Resume keeps this note')
      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })

  test('exposes one compact workout settings entry while keeping common rest control inline', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await startWorkoutWithExercise(session.page)
      await expect(session.page.getByRole('switch', { name: /auto (on|off)/i })).toBeVisible()
      await session.page.getByRole('button', { name: /workout settings/i }).click()
      const settings = session.page.getByRole('dialog', { name: /workout settings/i })
      await expect(settings.getByText(/this workout/i)).toBeVisible()
      await expect(settings.getByText(/voice rep counter/i)).toBeVisible()
      await settings.getByRole('button', { name: /^done$/i }).click()
      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })

  test('persists auto-rest off and does not start rest when a set is logged', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await startWorkoutWithExercise(session.page)
      const autoRest = session.page.getByRole('switch', { name: /auto on/i })
      await autoRest.click()
      await expect(session.page.getByRole('switch', { name: /auto off/i })).toHaveAttribute('aria-checked', 'false')

      await addStrengthSet(session.page, '60', '8')
      await expect(session.page.getByText('Resting', { exact: true })).toHaveCount(0)

      await session.page.reload()
      await expect(session.page.getByRole('switch', { name: /auto off/i })).toHaveAttribute('aria-checked', 'false')
      await expect(session.page.getByText('Resting', { exact: true })).toHaveCount(0)
      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })

  test('review-and-exit always confirms reps and can log difficulty', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '8')
      await session.page.getByText('60 kg', { exact: true }).click()
      await session.page.getByRole('button', { name: /start guided set/i }).click()
      await session.page.getByRole('dialog', { name: /guided set:/i }).getByRole('button', { name: /^start$/i }).click()

      await session.page.getByRole('button', { name: /review & exit/i }).click()
      await expect(session.page.getByText(/how many reps did you actually complete/i)).toBeVisible()
      await session.page.getByRole('button', { name: 'Increase reps', exact: true }).click()
      await session.page.getByRole('button', { name: /difficulty 4 of 5/i }).click()
      await session.page.getByRole('button', { name: /log 1 rep/i }).click()

      await expect(session.page.getByRole('paragraph').filter({ hasText: /^1$/ })).toBeVisible()
      await expect(session.page.getByTitle('Difficulty 4 of 5')).toBeVisible()
      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })

  test('max mode keeps the tempo running past the goal until the athlete stops', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '1')
      await session.page.getByText('60 kg', { exact: true }).click()
      await session.page.getByRole('button', { name: /start guided set/i }).click()
      const setup = session.page.getByRole('dialog', { name: /guided set:/i })
      await enterStepper(session.page, setup, 'Goal reps', '1')
      await enterStepper(session.page, setup, 'Down', '1')
      for (const label of ['Rest', 'Up', 'Hold']) {
        await enterStepper(session.page, setup, label, '0')
      }
      await setup.getByRole('switch', { name: /max mode/i }).check()
      await expect(setup.getByText('No limit', { exact: true })).toBeVisible()
      await setup.getByRole('button', { name: /^start$/i }).click()
      await session.page.getByRole('button', { name: /start now/i }).click()

      await expect(session.page.getByText(/rep 2 · max/i)).toBeVisible({ timeout: 4_000 })
      await expect(session.page.getByText(/how many reps did you actually complete/i)).toHaveCount(0)
      await session.page.getByRole('button', { name: /stop & log/i }).click()
      await expect(session.page.getByText(/max mode · stopped manually/i)).toBeVisible()
      const completed = Number(await session.page.getByTestId('guided-confirm-reps').textContent())
      await session.page.getByRole('button', { name: 'Increase reps', exact: true }).click()
      await session.page.getByRole('button', { name: new RegExp(`log ${completed + 1} reps?`, 'i') }).click()

      await expect(session.page.getByRole('paragraph').filter({ hasText: new RegExp(`^${completed + 1}$`) })).toBeVisible()
      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })

  test('can rotate the DRUH cycle to begin with lifting in both guided flows', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '2')
      await session.page.getByText('60 kg', { exact: true }).click()
      await session.page.getByRole('button', { name: /start guided set/i }).click()
      const singleSetup = session.page.getByRole('dialog', { name: /guided set:/i })
      await singleSetup.getByRole('combobox', { name: /first tempo phase/i }).selectOption('up')
      await singleSetup.getByRole('button', { name: /^start$/i }).click()
      await session.page.getByRole('button', { name: /start now/i }).click()
      await expect(session.page.getByText('LIFT', { exact: true })).toBeVisible()
      await session.page.getByRole('button', { name: /review & exit/i }).click()
      await session.page.getByRole('button', { name: /discard set/i }).click()

      await session.page.getByRole('button', { name: /guide whole exercise/i }).click()
      const allSetup = session.page.getByRole('dialog', { name: /guide exercise:/i })
      await expect(allSetup.getByRole('combobox', { name: /first tempo phase/i })).toHaveValue('up')
      await allSetup.getByRole('button', { name: /start guide/i }).click()
      await session.page.getByRole('button', { name: /start now/i }).click()
      await expect(session.page.getByText('LIFT', { exact: true })).toBeVisible()
      await session.page.getByRole('button', { name: /review & exit/i }).click()
      const review = session.page.getByRole('dialog', { name: /review:/i })
      await review.getByRole('button', { name: /leave pending/i }).click()
      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })

  test('voice is optional before and during guidance and never speaks elapsed seconds', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await installSpeechRecorder(session.page)
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '1')
      await session.page.getByText('60 kg', { exact: true }).click()
      await session.page.getByRole('button', { name: /start guided set/i }).click()
      const setup = session.page.getByRole('dialog', { name: /guided set:/i })
      for (const [label, value] of [
        ['Goal reps', '1'],
        ['Down', '1'],
        ['Rest', '1'],
        ['Up', '1'],
        ['Hold', '1'],
      ] as const) {
        await enterStepper(session.page, setup, label, value)
      }
      await setup.getByText('Voice options', { exact: true }).click()
      const setupVoice = setup.getByRole('checkbox', { name: /voice coaching enabled/i })
      await expect(setupVoice).toBeChecked()
      await setup.getByRole('radio', { name: /device voice/i }).check()
      await setupVoice.uncheck()
      await setup.getByRole('button', { name: /^start$/i }).click()
      await session.page.getByRole('button', { name: /start now/i }).click()

      await expect(session.page.getByText('LOWER', { exact: true })).toBeVisible()
      const countdown = session.page.getByTestId('guided-countdown')
      await session.page.waitForTimeout(1_100)
      await expect.poll(() => session.page.evaluate(
        () => ((window as unknown as { __guidedSpeech: string[] }).__guidedSpeech).length,
      )).toBe(0)

      await session.page.getByRole('button', { name: /turn voice on/i }).click()
      const frozenValue = await countdown.textContent()
      await session.page.getByRole('button', { name: /^pause guidance$/i }).click()
      await expect(session.page.getByText('PAUSED', { exact: true })).toBeVisible()
      const speechCountAtPause = await session.page.evaluate(
        () => ((window as unknown as { __guidedSpeech: string[] }).__guidedSpeech).length,
      )
      await session.page.waitForTimeout(1_300)
      await expect(countdown).toHaveText(frozenValue ?? '')
      await expect.poll(() => session.page.evaluate(
        () => ((window as unknown as { __guidedSpeech: string[] }).__guidedSpeech).length,
      )).toBe(speechCountAtPause)

      await session.page.getByRole('button', { name: /^resume guidance$/i }).click()
      await expect(session.page.getByText('PAUSED', { exact: true })).toHaveCount(0)
      await expect(session.page.getByRole('button', { name: /turn voice off/i })).toBeHidden({ timeout: 8_000 })

      const spoken = await session.page.evaluate(
        () => (window as unknown as { __guidedSpeech: string[] }).__guidedSpeech,
      )
      expect(spoken.join(' | ')).toMatch(/Rep 1/i)
      expect(spoken.join(' | ')).not.toMatch(/Hold|Up|Lower/i)
      expect(spoken.some((phrase) => /^\d+$/.test(phrase))).toBe(false)
      expect(spoken.some((phrase) => /\. (?:1|2|3)$/.test(phrase))).toBe(false)
      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })

  test('whole-exercise guidance follows the same sparse voice contract', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await installSpeechRecorder(session.page)
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '1')
      await session.page.getByRole('button', { name: /guide whole exercise/i }).click()
      const setup = session.page.getByRole('dialog', { name: /guide exercise:/i })
      for (const [label, value] of [
        ['Down', '1'],
        ['Rest', '1'],
        ['Up', '1'],
        ['Hold', '1'],
      ] as const) {
        await enterStepper(session.page, setup, label, value)
      }
      await setup.getByText('Voice options', { exact: true }).click()
      await setup.getByRole('checkbox', { name: /voice coaching enabled/i }).uncheck()
      await setup.getByRole('radio', { name: /device voice/i }).check()
      await setup.getByRole('button', { name: /start guide/i }).click()
      await session.page.getByRole('button', { name: /start now/i }).click()

      await session.page.waitForTimeout(1_100)
      await expect.poll(() => session.page.evaluate(
        () => ((window as unknown as { __guidedSpeech: string[] }).__guidedSpeech).length,
      )).toBe(0)
      await session.page.getByRole('button', { name: /turn voice on/i }).click()

      const review = session.page.getByRole('dialog', { name: /review:/i })
      await expect(review).toBeVisible({ timeout: 8_000 })
      const spoken = await session.page.evaluate(
        () => (window as unknown as { __guidedSpeech: string[] }).__guidedSpeech,
      )
      expect(spoken.join(' | ')).toMatch(/Rep 1/i)
      expect(spoken.join(' | ')).not.toMatch(/Hold|Up|Lower/i)
      expect(spoken.some((phrase) => /^\d+$/.test(phrase))).toBe(false)
      expect(spoken.some((phrase) => /\. (?:1|2|3)$/.test(phrase))).toBe(false)

      await review.getByRole('button', { name: /leave pending/i }).click()
      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })

  test('guides only selected pending sets and allows Max on one selected set', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '1')
      await addStrengthSet(session.page, '60', '1')
      await addStrengthSet(session.page, '55', '1')
      await session.page.getByTitle('Completed — tap to undo').last().click()
      await session.page.getByTitle('Completed — tap to undo').last().click()

      await session.page.getByRole('button', { name: /guide whole exercise/i }).click()
      const setup = session.page.getByRole('dialog', { name: /guide exercise:/i })
      await expect(setup.getByLabel('Guide set 1')).not.toBeChecked()
      await expect(setup.getByLabel('Guide set 2')).toBeChecked()
      await expect(setup.getByLabel('Guide set 3')).toBeChecked()
      await setup.getByLabel('Guide set 2').uncheck()
      await setup.getByLabel('Max mode for set 3').check()
      await expect(setup.getByRole('button', { name: /start guide selected \(1\)/i })).toBeEnabled()
      await setup.getByRole('button', { name: /start guide selected/i }).click()
      await expect(session.page.getByText(/max mode · stop manually/i)).toBeVisible()
      await session.page.getByRole('button', { name: /review & exit/i }).click()
      await session.page.getByRole('dialog', { name: /review:/i }).getByRole('button', { name: /leave pending/i }).click()
      await expect(session.page.getByTitle('Completed — tap to undo')).toHaveCount(1)
      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })

  test('whole-exercise max mode keeps every set running until manually stopped', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '1')
      await session.page.getByRole('button', { name: /guide whole exercise/i }).click()
      const setup = session.page.getByRole('dialog', { name: /guide exercise:/i })
      await enterStepper(session.page, setup, 'Down', '1')
      for (const label of ['Rest', 'Up', 'Hold']) {
        await enterStepper(session.page, setup, label, '0')
      }
      await setup.getByRole('switch', { name: /max mode/i }).check()
      await expect(setup.getByText(/every set continues until you stop it/i)).toBeVisible()
      await setup.getByRole('button', { name: /start guide/i }).click()
      await session.page.getByRole('button', { name: /start now/i }).click()

      await expect(session.page.getByText(/rep 2 · max/i)).toBeVisible({ timeout: 4_000 })
      await expect(session.page.getByRole('dialog', { name: /review:/i })).toHaveCount(0)
      await session.page.getByRole('button', { name: /^stop set/i }).click()

      const review = session.page.getByRole('dialog', { name: /review:/i })
      await expect(review).toBeVisible()
      await expect(review.getByText(/max mode/i)).toBeVisible()
      await review.getByRole('button', { name: /log these sets/i }).click()
      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })

  test('previews and persists voice choices, then changes coaching style safely during a guide', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await installSpeechRecorder(session.page)
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '1')
      await session.page.getByText('60 kg', { exact: true }).click()
      await session.page.getByRole('button', { name: /start guided set/i }).click()
      const setup = session.page.getByRole('dialog', { name: /guided set:/i })
      for (const [label, value] of [
        ['Goal reps', '1'],
        ['Down', '1'],
        ['Rest', '1'],
        ['Up', '1'],
        ['Hold', '1'],
      ] as const) {
        await enterStepper(session.page, setup, label, value)
      }
      await setup.getByText('Voice options', { exact: true }).click()

      await setup.getByRole('combobox', { name: /coaching style/i }).selectOption('supportive')
      await setup.getByRole('radio', { name: /kai/i }).check()
      await setup.getByRole('combobox', { name: /delivery pace/i }).selectOption('energetic')
      await setup.getByRole('button', { name: /preview voice/i }).click()
      await expect.poll(() => session.page.evaluate(() => {
        const entries = (window as unknown as { __guidedCoachAudio: Array<{ src: string; playbackRate: number }> }).__guidedCoachAudio
        return entries.at(-1)
      })).toMatchObject({ src: '/audio/coaches/kai/up.mp3', playbackRate: 1.06 })

      // A missing/corrupt pack falls back to browser speech for the complete
      // phrase; it never silently drops the rep count or movement command.
      await session.page.evaluate(() => {
        ;(window as unknown as { __guidedAudioFail: boolean }).__guidedAudioFail = true
      })
      await setup.getByRole('radio', { name: /maya/i }).check()
      await setup.getByRole('button', { name: /preview voice/i }).click()
      await expect.poll(() => session.page.evaluate(
        () => (window as unknown as { __guidedSpeech: string[] }).__guidedSpeech.at(-1),
      )).toBe('Rep 3.')
      await session.page.evaluate(() => {
        ;(window as unknown as { __guidedAudioFail: boolean }).__guidedAudioFail = false
      })

      await setup.getByRole('radio', { name: /device voice/i }).check()
      await setup.getByRole('combobox', { name: /installed voice/i }).selectOption('voice:calm')
      await setup.getByRole('button', { name: /preview voice/i }).click()
      await expect.poll(() => session.page.evaluate(() => {
        const entries = (window as unknown as { __guidedUtterances: Array<{ voiceURI: string | null }> }).__guidedUtterances
        return entries.at(-1)?.voiceURI
      })).toBe('voice:calm')

      await setup.getByRole('combobox', { name: /coaching style/i }).selectOption('technique')
      await setup.getByRole('textbox', { name: /technique cue/i }).fill('Brace before lowering')
      await setup.getByRole('button', { name: /cancel/i }).click()

      await session.page.getByText('60 kg', { exact: true }).click()
      await session.page.getByRole('button', { name: /start guided set/i }).click()
      const reopened = session.page.getByRole('dialog', { name: /guided set:/i })
      await reopened.getByText('Voice options', { exact: true }).click()
      await expect(reopened.getByRole('combobox', { name: /coaching style/i })).toHaveValue('technique')
      await expect(reopened.getByRole('radio', { name: /device voice/i })).toBeChecked()
      await expect(reopened.getByRole('combobox', { name: /delivery pace/i })).toHaveValue('energetic')
      await expect(reopened.getByRole('combobox', { name: /installed voice/i })).toHaveValue('voice:calm')
      await expect(reopened.getByRole('textbox', { name: /technique cue/i })).toHaveValue('Brace before lowering')
      await reopened.getByRole('button', { name: /^start$/i }).click()

      await expect.poll(() => session.page.evaluate(
        () => (window as unknown as { __guidedSpeech: string[] }).__guidedSpeech.join(' | '),
      )).toMatch(/QA Snapshot Squat 47391\. Set 1\. 1 reps\. 60 kilograms\. Cue\. Brace before lowering\./i)

      await session.page.getByRole('button', { name: /voice settings/i }).click()
      const liveSettings = session.page.getByRole('dialog', { name: /^voice settings$/i })
      await expect(session.page.getByText('PAUSED', { exact: true })).toBeVisible()
      await liveSettings.getByText('Voice options', { exact: true }).click()
      await liveSettings.getByRole('combobox', { name: /coaching style/i }).selectOption('reps')
      await liveSettings.getByRole('button', { name: /^done$/i }).click()
      await session.page.evaluate(() => {
        ;(window as unknown as { __guidedSpeech: string[] }).__guidedSpeech.length = 0
      })
      await session.page.getByRole('button', { name: /^resume guidance$/i }).click()
      await session.page.getByRole('button', { name: /start now/i }).click()
      await expect(session.page.getByRole('button', { name: /turn voice off/i })).toBeHidden({ timeout: 8_000 })

      const liveSpoken = await session.page.evaluate(
        () => (window as unknown as { __guidedSpeech: string[] }).__guidedSpeech,
      )
      expect(liveSpoken).toContain('Rep 1')
      expect(liveSpoken.join(' | ')).not.toMatch(/Lower|Hold|Up/)
      expect(liveSpoken.some((phrase) => /^\d+$/.test(phrase))).toBe(false)
      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })

  test('persists an exercise note across reload without inventing a third set', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    const note = `E2E setup note ${Date.now()}`
    try {
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '8')
      await addStrengthSet(session.page, '60', '8')
      await session.page.getByRole('button', { name: /📝/ }).click()
      const noteDialog = session.page.getByRole('dialog', { name: /note:/i })
      await noteDialog.getByRole('textbox').fill(note)
      await noteDialog.getByRole('button', { name: /^save$/i }).click()
      await expect(session.page.getByRole('button', { name: new RegExp(note) })).toBeVisible()

      await session.page.reload()
      await expect(session.page.getByRole('button', { name: new RegExp(note) })).toBeVisible()
      await session.page.getByRole('button', { name: /guide whole exercise/i }).click()
      const guideSetup = session.page.getByRole('dialog', { name: /guide exercise:/i })
      await expect(guideSetup.getByRole('button', { name: /remove set 1/i })).toBeVisible()
      await expect(guideSetup.getByRole('button', { name: /remove set 2/i })).toBeVisible()
      await expect(guideSetup.getByRole('button', { name: /remove set 3/i })).toHaveCount(0)
      await guideSetup.getByRole('button', { name: /cancel/i }).click()

      // Restore the shared fixture's note after proving persistence.
      await session.page.getByRole('button', { name: new RegExp(note) }).click()
      const cleanup = session.page.getByRole('dialog', { name: /note:/i })
      await cleanup.getByRole('textbox').fill('')
      await cleanup.getByRole('button', { name: /^save$/i }).click()
      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })

  test('can guide consecutive sets without a rest screen', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '1')
      await addStrengthSet(session.page, '60', '1')
      await session.page.getByRole('button', { name: /guide whole exercise/i }).click()
      const setup = session.page.getByRole('dialog', { name: /guide exercise:/i })
      const restBetweenSets = setup.getByRole('checkbox', { name: /rest after each set/i })
      await restBetweenSets.uncheck()
      for (const [label, value] of [
        ['Down', '1'],
        ['Rest', '0'],
        ['Up', '0'],
        ['Hold', '0'],
      ] as const) {
        await enterStepper(session.page, setup, label, value)
      }
      await setup.getByRole('button', { name: /start guide/i }).click()
      await session.page.getByRole('button', { name: /start now/i }).click()
      await session.page.waitForTimeout(1_300)

      await expect(session.page.getByText('GET READY', { exact: true })).toBeVisible()
      await expect(session.page.getByText('REST', { exact: true })).toHaveCount(0)
      await session.page.getByRole('button', { name: /review & exit/i }).click()
      await session.page.getByRole('dialog', { name: /review:/i }).getByRole('button', { name: /leave pending/i }).click()
      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })

  test('hands an in-progress guided rest to the home rest counter', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '1')
      await addStrengthSet(session.page, '60', '1')
      await session.page.getByRole('button', { name: /guide whole exercise/i }).click()
      const setup = session.page.getByRole('dialog', { name: /guide exercise:/i })
      await expect(setup.getByRole('checkbox', { name: /rest after each set/i })).toBeChecked()
      for (const [label, value] of [
        ['Down', '1'],
        ['Rest', '0'],
        ['Up', '0'],
        ['Hold', '0'],
      ] as const) {
        await enterStepper(session.page, setup, label, value)
      }
      await setup.getByRole('button', { name: /start guide/i }).click()
      await session.page.getByRole('button', { name: /start now/i }).click()
      await expect(session.page.getByText('REST', { exact: true })).toBeVisible({ timeout: 5_000 })
      await session.page.waitForTimeout(2_100)
      await session.page.getByRole('button', { name: /review & exit/i }).click()
      const review = session.page.getByRole('dialog', { name: /review:/i })
      await review.getByRole('button', { name: /log these sets/i }).click()

      await expect(session.page.getByText('Resting', { exact: true })).toBeVisible()
      const remaining = await restSecondsRemaining(session.page)
      expect(remaining).toBeLessThanOrEqual(88)
      expect(remaining).toBeGreaterThanOrEqual(84)
      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })

  test('guided completion restarts an already-running main rest timer', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '8')
      await addStrengthSet(session.page, '50', '1')

      // Plain Add completes the set and starts the main rest timer.
      await expect(session.page.getByText('Resting', { exact: true })).toBeVisible()
      await session.page.waitForTimeout(2_100)
      const beforeGuide = await restSecondsRemaining(session.page)

      await session.page.getByText('50 kg', { exact: true }).click()
      await session.page.getByRole('button', { name: /start guided set/i }).click()
      const setup = session.page.getByRole('dialog', { name: /guided set:/i })
      for (const [label, value] of [
        ['Goal reps', '1'],
        ['Down', '1'],
        ['Rest', '0'],
        ['Up', '0'],
        ['Hold', '0'],
      ] as const) {
        await enterStepper(session.page, setup, label, value)
      }
      await setup.getByRole('button', { name: /^start$/i }).click()
      const guidedAudio = session.page.getByRole('button', { name: /turn voice off/i })
      await expect(guidedAudio).toBeVisible()
      await session.page.getByRole('button', { name: /start now/i }).click()

      await expect(guidedAudio).toBeHidden({ timeout: 5_000 })
      await expect(session.page.getByText('Resting', { exact: true })).toBeVisible({ timeout: 5_000 })
      const afterGuide = await restSecondsRemaining(session.page)
      expect(afterGuide).toBeGreaterThan(beforeGuide)
      expect(afterGuide).toBeGreaterThanOrEqual(89)

      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })
})
