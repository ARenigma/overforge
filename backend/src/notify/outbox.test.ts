import { buildScorecardEmail, drainOutbox, ScorecardOutboxItem, OutboxStore, EmailSender, EmailMessage } from './outbox';
import { Scorecard } from '../scoring/types';

const scorecard: Scorecard = {
  overall: 4,
  recommendation: 'hire',
  dimensions: [{ name: 'depth', score: 4, notes: 'good <reasoning>' }],
  summary: 'Strong candidate',
};

const item = (id: number): ScorecardOutboxItem => ({
  id,
  interviewId: `iv-${id}`,
  interviewerEmail: 'boss@acme.com',
  candidateEmail: 'cand@x.com',
  candidateName: 'Casey',
  scorecard,
});

describe('buildScorecardEmail', () => {
  test('addresses the interviewer and includes the verdict', () => {
    const msg = buildScorecardEmail(item(1));
    expect(msg.to).toBe('boss@acme.com');
    expect(msg.subject).toContain('hire');
    expect(msg.text).toContain('Overall: 4/5');
    expect(msg.text).toContain('iv-1');
  });
  test('html-escapes candidate-influenced content', () => {
    const msg = buildScorecardEmail(item(2));
    expect(msg.html).toContain('good &lt;reasoning&gt;');
    expect(msg.html).not.toContain('<reasoning>');
  });
});

describe('drainOutbox', () => {
  function makeStore(items: ScorecardOutboxItem[]) {
    const sent: Array<number | string> = [];
    const failed: Array<{ id: number | string; err: string }> = [];
    const store: OutboxStore = {
      claimPending: async () => items,
      markSent: async (id) => void sent.push(id),
      markFailed: async (id, err) => void failed.push({ id, err }),
    };
    return { store, sent, failed };
  }

  test('sends all pending and marks them sent', async () => {
    const { store, sent } = makeStore([item(1), item(2)]);
    const messages: EmailMessage[] = [];
    const sender: EmailSender = { send: async (m) => void messages.push(m) };
    const res = await drainOutbox(store, sender);
    expect(res).toEqual({ sent: 2, failed: 0 });
    expect(sent).toEqual([1, 2]);
    expect(messages).toHaveLength(2);
  });

  test('isolates a send failure and marks it failed (retried next drain)', async () => {
    const { store, sent, failed } = makeStore([item(1), item(2)]);
    let first = true;
    const sender: EmailSender = {
      send: async () => {
        if (first) {
          first = false;
          throw new Error('resend 429');
        }
      },
    };
    const res = await drainOutbox(store, sender);
    expect(res).toEqual({ sent: 1, failed: 1 });
    expect(failed[0].err).toContain('resend 429');
    expect(sent).toEqual([2]);
  });
});
