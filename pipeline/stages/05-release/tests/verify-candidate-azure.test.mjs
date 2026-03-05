import { describe, expect, it } from 'vitest';
import { assertBlueGreenLabelWeights } from '../../../shared/scripts/azure/verify-candidate-azure.mjs';

describe('verify-candidate-azure label weights', () => {
  it('accepts active=100 inactive=0', () => {
    expect(() =>
      assertBlueGreenLabelWeights({
        appName: 'ca-compass-web-prd-cc-02',
        activeLabel: 'green',
        inactiveLabel: 'blue',
        showDocument: {
          properties: {
            configuration: {
              ingress: {
                traffic: [
                  { label: 'blue', weight: 0, revisionName: 'web-blue' },
                  { label: 'green', weight: 100, revisionName: 'web-green' }
                ]
              }
            }
          }
        }
      })
    ).not.toThrow();
  });

  it('fails when weights drift', () => {
    expect(() =>
      assertBlueGreenLabelWeights({
        appName: 'ca-compass-api-prd-cc-02',
        activeLabel: 'green',
        inactiveLabel: 'blue',
        showDocument: {
          properties: {
            configuration: {
              ingress: {
                traffic: [
                  { label: 'blue', weight: 25, revisionName: 'api-blue' },
                  { label: 'green', weight: 75, revisionName: 'api-green' }
                ]
              }
            }
          }
        }
      })
    ).toThrow(/unexpected label weights/i);
  });
});
