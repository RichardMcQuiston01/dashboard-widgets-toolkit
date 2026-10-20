import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CHART_INNER_WIDTH,
  CHART_MARGIN,
  DEFAULT_LABELS,
  barPath,
  buildChartModel,
  chartHitBand,
  chartX,
  describeChart,
  joinClassNames,
  seriesColor,
  type GraphWidgetData,
} from '../../src/core/index.js';

const data: GraphWidgetData = {
  kind: 'GRAPH',
  chartType: 'line',
  valueFormat: 'number',
  series: [
    {
      name: 'Sales',
      points: [
        { label: 'Jan', value: 10 },
        { label: 'Feb', value: 30 },
      ],
    },
  ],
};

void describe('chart model (shared by every renderer)', () => {
  void it('builds labels, a value matrix and a domain', () => {
    const model = buildChartModel(data);
    assert.deepEqual(model.labels, ['Jan', 'Feb']);
    assert.deepEqual(model.values, [[10, 30]]);
    assert.ok(model.domain.max >= 30);
  });

  void it('describes the chart in words', () => {
    const text: string = describeChart(data, buildChartModel(data), String);
    assert.match(text, /^Line chart, 2 point\(s\) from Jan to Feb\./);
    assert.match(text, /Sales: latest 30, high 30, low 10\./);
  });

  void it('places lines across the full width and bars in slots', () => {
    assert.equal(chartX('line', 2, 0), CHART_MARGIN.left);
    assert.equal(chartX('line', 2, 1), CHART_MARGIN.left + CHART_INNER_WIDTH);
    const band = chartHitBand('bar', 2, 1);
    assert.equal(band.width, CHART_INNER_WIDTH / 2);
  });

  void it('rounds only the data end of a bar', () => {
    assert.match(barPath(0, 0, 10, 20, 'top'), /^M0\.00,20\.00V4\.00Q/);
  });

  void it('keeps palette and label helpers in the core', () => {
    assert.match(seriesColor(0), /^var\(--dwt-series-1, #/);
    assert.equal(DEFAULT_LABELS.hide('Sales'), 'Hide Sales');
    assert.equal(joinClassNames('a', '', false, 'b'), 'a b');
  });
});
