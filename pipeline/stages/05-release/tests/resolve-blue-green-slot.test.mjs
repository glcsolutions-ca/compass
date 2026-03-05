import { describe, expect, it } from 'vitest';
import {
  buildSlotBaseUrl,
  resolveGlobalActiveLabel,
  resolveInactiveLabel
} from '../../../shared/scripts/azure/blue-green-utils.mjs';

function showWithWeights({ blue = 0, green = 0 } = {}) {
  const traffic = [];
  if (blue > 0) {
    traffic.push({ label: 'blue', weight: blue, revisionName: 'app--blue' });
  }
  if (green > 0) {
    traffic.push({ label: 'green', weight: green, revisionName: 'app--green' });
  }

  return {
    properties: {
      configuration: {
        ingress: {
          traffic
        }
      }
    }
  };
}

describe('resolve-blue-green-slot helpers', () => {
  it('resolves active label from matching API/Web traffic', () => {
    const activeLabel = resolveGlobalActiveLabel({
      apiShow: showWithWeights({ blue: 100, green: 0 }),
      webShow: showWithWeights({ blue: 100, green: 0 }),
      preferredActiveLabel: 'blue',
      blueLabel: 'blue',
      greenLabel: 'green'
    });

    expect(activeLabel).toBe('blue');
  });

  it('falls back to preferred label when blue/green labels are not assigned', () => {
    const activeLabel = resolveGlobalActiveLabel({
      apiShow: showWithWeights(),
      webShow: showWithWeights(),
      preferredActiveLabel: 'green',
      blueLabel: 'blue',
      greenLabel: 'green'
    });

    expect(activeLabel).toBe('green');
  });

  it('fails when API and Web labels disagree', () => {
    expect(() =>
      resolveGlobalActiveLabel({
        apiShow: showWithWeights({ blue: 100, green: 0 }),
        webShow: showWithWeights({ blue: 0, green: 100 }),
        preferredActiveLabel: 'blue',
        blueLabel: 'blue',
        greenLabel: 'green'
      })
    ).toThrow(/inconsistent/i);
  });

  it('derives the inactive label from blue/green pair', () => {
    expect(resolveInactiveLabel('blue', 'blue', 'green')).toBe('green');
    expect(resolveInactiveLabel('green', 'blue', 'green')).toBe('blue');
  });

  it('builds slot URLs deterministically', () => {
    expect(buildSlotBaseUrl('my-app', 'blue', 'my-app.example.internal')).toBe(
      'https://my-app---blue.example.internal'
    );
  });
});
