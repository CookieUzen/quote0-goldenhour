import { collect } from './card.js';
import { buildBarePlot } from './card.js';
import { STAGE_LABEL } from './stage.js';
import { axisTicks, fmtOffset } from './sunpath.js';

/**
 * Canvas API payload builder — device-native layout (text rendered by the
 * device's renderer, our chart embeddable as an <img>).
 *
 * Layout rules (user-specified):
 *  - the custom message is ALWAYS its own row, alone
 *  - quote + date in the title row, weather in the footer row
 *  - CANVAS_LAYOUT=stacked (default): quote headline / message / weather
 *  - CANVAS_LAYOUT=chart: title row / message row / plot <img> / weather row
 */

export interface CanvasPayload {
  data: Record<string, unknown>;
  windowData: unknown;
  layoutFull?: unknown;
  taskAlias: string;
}

const el = (
  type: string,
  props: Record<string, unknown>,
): Record<string, unknown> => ({ type, props });

/** One-line ellipsized text span. */
const nowrap = (children: string, extra = ''): Record<string, unknown> =>
  el('span', {
    tw: `min-w-0 shrink ${extra}`,
    style: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    children,
  });

/** Title row: quote (left, ellipsized) · date (right). */
const titleRow = (): Record<string, unknown> =>
  el('div', {
    tw: 'flex flex-row items-center justify-between gap-[6px] shrink-0 text-pixel-12',
    children: [
      nowrap('{{get inputData "quote" default=""}}'),
      el('span', {
        tw: 'shrink-0 text-pixel-8',
        children: '{{get inputData "date" default=""}}',
      }),
    ],
  });

/** Footer row: weather (left) with a small dot marker. */
const weatherRow = (): Record<string, unknown> =>
  el('div', {
    tw: 'flex flex-row items-center gap-[5px] shrink-0 text-pixel-8',
    children: [
      el('span', {
        tw: 'w-[5px] h-[5px] rounded-full bg-black shrink-0',
        children: '',
      }),
      nowrap('{{get inputData "wx" default=""}}'),
    ],
  });

/** The message row — ALWAYS alone, big, centered. */
const messageRow = (centered: boolean): Record<string, unknown> =>
  el('div', {
    ...(centered
      ? { tw: 'flex flex-1 min-h-0 items-center justify-center' }
      : { tw: 'flex flex-row shrink-0 justify-center' }),
    children: [
      el('span', {
        tw: 'text-pixel-16 text-center min-w-0',
        style: {
          lineClamp: centered ? 3 : 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        },
        children: '{{get inputData "msg" default=""}}',
      }),
    ],
  });

/** No message: dimmed centered quote takes the middle slot (stacked only). */
const quoteCenterRow = (): Record<string, unknown> =>
  el('div', {
    tw: 'flex flex-1 min-h-0 items-center justify-center',
    children: [
      el('span', {
        tw: 'text-pixel-16 text-center min-w-0 opacity-60',
        style: { lineClamp: 3, overflow: 'hidden', textOverflow: 'ellipsis' },
        children: '{{get inputData "quote" default=""}}',
      }),
    ],
  });

/** Geometry-only plot height (296 wide): fills the card width, tick labels
 *  are drawn by the canvas below it. */
const PLOT_W = 296;
const PLOT_H = 96;

export async function buildCanvas(now: Date, chart?: Buffer): Promise<CanvasPayload> {
  const { msg, cols, footer, quote } = await collect(now);
  const a = cols[0];
  const b = cols[1];
  // weather row is conditional: no data from either city -> no row
  const hasWx = cols.some((c) => c.tempC != null || c.code >= 0);
  const wx = hasWx
    ? `${a.name} ${a.tempC != null ? Math.round(a.tempC) : '--'}° ${
        STAGE_LABEL[a.stage]
      } · ${b.name} ${b.tempC != null ? Math.round(b.tempC) : '--'}° ${STAGE_LABEL[b.stage]}`
    : undefined;

  const layout = process.env.CANVAS_LAYOUT === 'chart' ? 'chart' : 'stacked';
  const plot =
    layout === 'chart'
      ? (chart ?? (await buildBarePlot(now, { geometryOnly: true, height: PLOT_H })))
      : undefined;
  const data: Record<string, unknown> = {
    quote,
    date: footer,
    ...(wx ? { wx } : {}),
    ...(msg ? { msg } : {}),
    ...(plot ? { chart: `data:image/png;base64,${plot.toString('base64')}` } : {}),
    // relative-time axis labels, aligned with the tick marks in the image
    ...(plot ? { ticks: axisTicks(now).map((t) => ({ t: fmtOffset(t.offset) })) } : {}),
  };
  const rows: Array<Record<string, unknown>> =
    layout === 'chart'
      ? [
          titleRow(),
          // message is ALWAYS its own row; without one the plot gets the space
          ...(msg ? [messageRow(false)] : []),
          el('div', {
            tw: 'flex flex-1 min-h-0 min-w-0 justify-center',
            children: [
              el('img', {
                src: '{{get inputData "chart" default=""}}',
                tw: 'img-dither-none',
                style: { objectFit: 'contain', maxWidth: '100%', maxHeight: '100%' },
              }),
            ],
          }),
          // relative-time tick row ("-8 … now … +14"), aligned to the image's
          // 8px plot margins inside the 4px window padding
          el('div', {
            tw: 'flex flex-row justify-between shrink-0 text-pixel-8 pl-[12px] pr-[4px]',
            children: [
              el('span', {
                $for: { items: 'inputData.ticks', as: 'tick' },
                children: '{{get tick "t" default=""}}',
              }),
            ],
          }),
          ...(wx ? [weatherRow()] : []),
        ]
      : [
          titleRow(),
          msg ? messageRow(true) : quoteCenterRow(),
          ...(wx ? [weatherRow()] : []),
        ];

  return {
    data,
    windowData: {
      default: [
        el('div', {
          tw: 'flex flex-col w-full h-full min-w-0 min-h-0 bg-white text-black gap-[4px]',
          children: rows,
        }),
      ],
    },
    // zero the device's default window padding so our 4px + image margins line up
    layoutFull: { tw: 'p-[4px]' },
    taskAlias: 'golden-hour canvas',
  };
}
