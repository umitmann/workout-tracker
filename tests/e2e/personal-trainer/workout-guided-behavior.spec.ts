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

  test('keeps dropset weights until the user explicitly applies one weight to all sets', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '8')
      await addStrengthSet(session.page, '50', '6')

      await expect(session.page.getByText('60 kg', { exact: true })).toBeVisible()
      await expect(session.page.getByText('50 kg', { exact: true })).toBeVisible()

      await session.page.getByText('60 kg', { exact: true }).click()
      const applyAll = session.page.getByRole('button', { name: /apply weight to all sets/i })
      const editor = applyAll.locator('xpath=../..')
      await enterStepper(session.page, editor, 'Weight (kg)', '70')
      await applyAll.click()
      await session.page.getByRole('button', { name: /close set editor/i }).click()

      await expect(session.page.getByText('70 kg', { exact: true })).toHaveCount(2)
      await deleteWorkout(session.page)
    } finally {
      await session.context.close()
    }
  })

  test('applies reps to all only when explicitly requested and seeds guided from the edited form', async ({ browser }) => {
    const session = await newSignedInContext(browser, 'exerciseClient')
    try {
      await startWorkoutWithExercise(session.page)
      await addStrengthSet(session.page, '60', '8')
      await addStrengthSet(session.page, '50', '6')

      await session.page.getByText('60 kg', { exact: true }).click()
      const applyAll = session.page.getByRole('button', { name: /apply reps to all sets/i })
      const editor = applyAll.locator('xpath=../..')
      await enterStepper(session.page, editor, 'Reps', '12')
      await applyAll.click()
      await session.page.getByRole('button', { name: /save and close set editor/i }).click()
      await expect(session.page.getByText('12', { exact: true })).toHaveCount(2)

      // The values currently visible in the normal set editor are the source
      // of truth for guided setup — no stale previous-set/default values.
      await session.page.getByText('50 kg', { exact: true }).click()
      const secondEditor = session.page.getByRole('button', { name: /start guided set/i }).locator('xpath=../..')
      await enterStepper(session.page, secondEditor, 'Weight (kg)', '55')
      await enterStepper(session.page, secondEditor, 'Reps', '9')
      await secondEditor.getByRole('button', { name: /start guided set/i }).click()
      const setup = session.page.getByRole('dialog', { name: /guided set:/i })
      await expect(setup.getByRole('textbox', { name: 'Weight (kg)', exact: true })).toHaveValue('55')
      await expect(setup.getByRole('textbox', { name: 'Goal reps', exact: true })).toHaveValue('9')
      await setup.getByRole('button', { name: /cancel/i }).click()

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
      expect(spoken.join(' | ')).toMatch(/Hold|Up|Lower/i)
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
      expect(spoken.join(' | ')).toMatch(/Hold|Up|Lower/i)
      expect(spoken.some((phrase) => /^\d+$/.test(phrase))).toBe(false)
      expect(spoken.some((phrase) => /\. (?:1|2|3)$/.test(phrase))).toBe(false)

      await review.getByRole('button', { name: /leave pending/i }).click()
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
      )).toBe('Rep 3. Lower. Hold. Up.')
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
