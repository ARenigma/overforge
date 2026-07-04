// Voice-path smoke: instead of typing, the browser's fake microphone plays a spoken clip
// (fixtures/answer.wav, fed via --use-file-for-fake-audio-capture in the 'stt' project). The real
// STT should transcribe it and the FSM should advance from voice alone — proving the end-to-end
// speech path, not just the text composer. Skipped when the speech fixture is absent.

import { test, expect } from '@playwright/test';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { createInterview, deleteInterview } from '../helpers/create-interview';
import { CandidateRoom } from '../helpers/room';

let createdId: string | null = null;
test.afterEach(async () => {
  if (createdId) await deleteInterview(createdId);
  createdId = null;
});

const HAS_SPEECH = existsSync(resolve(__dirname, '../fixtures/answer.wav'));

test.describe('voice path (STT)', () => {
  test.skip(!HAS_SPEECH, 'fixtures/answer.wav missing — run `npm run fixtures` (needs a TTS clip)');

  test('spoken answer transcribes and advances the interview', async ({ page }) => {
    const interview = await createInterview({ language: 'python', level: 'mid' });
    createdId = interview.id;
    test.info().annotations.push({ type: 'interview', description: interview.id });
    const room = new CandidateRoom(page);

    await room.enter(interview.link);
    await room.waitForSettled();
    const greetingCount = await room.aiCount();

    // The spoken clip should produce a candidate transcript bubble (STT worked) within ~45s
    // (leading silence clears the 3s AEC warm-up, then the endpointer finalizes the utterance).
    const gotTranscript = await page
      .getByTestId('candidate-message')
      .first()
      .waitFor({ state: 'visible', timeout: 45_000 })
      .then(() => true)
      .catch(() => false);

    // Either a candidate transcript appeared, or the interviewer produced a follow-up turn — both
    // prove the voice utterance reached the FSM.
    const advanced = gotTranscript || (await room.aiCount()) > greetingCount;
    expect(advanced, 'the spoken answer should have driven the FSM via STT').toBeTruthy();
  });
});
