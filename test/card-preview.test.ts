import { afterEach, describe, expect, test, vi } from 'vitest';
import { LogbookCard } from '../src/logbook-card';
import { ExtendedHomeAssistant, LogbookCardConfig } from '../src/types';

vi.mock('../src/editor', () => ({}));

const entity = 'sensor.cpu_percent';
const rawHistory = Array.from({ length: 6474 }, (_, index) => ({
  entity_id: entity,
  state: String(index % 100),
  attributes: { friendly_name: 'CPU percent', unit_of_measurement: '%' },
  last_changed: new Date(Date.now() - (6474 - index) * 500).toISOString(),
  last_updated: new Date(Date.now() - (6474 - index) * 500).toISOString(),
  context: { id: String(index), parent_id: null, user_id: null },
}));

const cards: LogbookCard[] = [];

afterEach(() => {
  cards.forEach(card => card.remove());
  cards.length = 0;
});

async function renderCard(config: Record<string, unknown>) {
  const callApi = vi.fn().mockResolvedValue([rawHistory]);
  const hass = {
    language: 'en',
    states: { [entity]: rawHistory[rawHistory.length - 1] },
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    localize: (key: string) => key,
    callApi,
  } as unknown as ExtendedHomeAssistant;
  const card = new LogbookCard();
  cards.push(card);
  card.hass = hass;
  card.setConfig({ type: 'custom:logbook-card', ...config } as LogbookCardConfig);
  document.body.appendChild(card);
  await vi.waitFor(() => expect(card.shadowRoot?.querySelector('.history')).not.toBeNull());
  await card.updateComplete;
  return { card, callApi };
}

describe('card picker preview', () => {
  test('bounds the history request and rendered rows for a noisy sensor', async () => {
    const config = LogbookCard.getStubConfig({} as ExtendedHomeAssistant, [entity]);
    const { card, callApi } = await renderCard(config);

    const uri = callApi.mock.calls[0][1] as string;
    const start = new Date(uri.slice('history/period/'.length).split('?')[0]);
    const end = new Date(new URLSearchParams(uri.split('?')[1]).get('end_time')!);
    expect((end.valueOf() - start.valueOf()) / 3600000).toBeCloseTo(1, 2);
    expect(card.shadowRoot?.querySelectorAll('.history')).toHaveLength(5);
    expect(card.shadowRoot?.querySelectorAll('logbook-date')).toHaveLength(10);
    expect(card.shadowRoot?.querySelector('.state')?.textContent).toBe('73 %');
  });

  test('keeps explicit history limits and custom state labels on saved cards', async () => {
    const { card } = await renderCard({
      entity,
      hours_to_show: 24,
      max_items: 12,
      state_map: [{ value: '*', label: 'CPU activity' }],
    });

    expect(card.shadowRoot?.querySelectorAll('.history')).toHaveLength(12);
    expect(card.shadowRoot?.querySelector('.state')?.textContent).toBe('CPU activity');
  });
});
