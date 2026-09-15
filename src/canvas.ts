import { collect } from './card.js';
import { buildBarePlot } from './card.js';
import { STAGE_LABEL } from './stage.js';
import { axisTicks, fmtOffset } from './sunpath.js';

/**
 * Canvas API payload builder — device-native layout (text rendered by the
 * device's renderer, our chart embeddable as an <img>).
 *
 * Two modes (chosen per push so the loop can alternate pages):
 *  - 'sun': title row (message-or-quote · pomo · date) / plot <img> /
 *    relative-time tick row ("-8 … now … +14") / weather row
 *  - 'msg': title row (quote · pomo · date) / the message, big and alone /
 *    weather row
 *
 * The title row's left span truncates before it can cut into the date.
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

/** Title row: headline (left, ellipsized) · date (right). */
const titleRow = (bold?: boolean): Record<string, unknown> =>
  el('div', {
    tw: 'flex flex-row items-center justify-between gap-[6px] shrink-0 text-pixel-12',
    children: [
      nowrap('{{get inputData "headline" default=""}}', bold ? 'font-bold' : ''),
      el('span', {
        tw: 'shrink-0 text-pixel-8',
        children: '{{get inputData "date" default=""}}',
      }),
    ],
  });

/** Bottom row: weather (left, ellipsized) · pomo counter (right). */
const bottomRow = (pomo?: string, hasWx?: boolean): Record<string, unknown> =>
  el('div', {
    tw: 'flex flex-row items-center justify-between gap-[6px] shrink-0 text-pixel-8',
    children: [
      el('div', {
        tw: 'flex flex-row items-center gap-[5px] min-w-0',
        children: [
          ...(hasWx
            ? [
                el('span', {
                  tw: 'w-[5px] h-[5px] rounded-full bg-black shrink-0',
                  children: '',
                }),
                nowrap('{{get inputData "wx" default=""}}'),
              ]
            : []),
        ],
      }),
      ...(pomo ? [el('span', { tw: 'shrink-0', children: pomo })] : []),
    ],
  });

/** The message — big, centered, alone (msg mode). */
const messageRow = (): Record<string, unknown> =>
  el('div', {
    tw: 'flex flex-1 min-h-0 items-center justify-center',
    children: [
      el('span', {
        tw: 'text-pixel-16 text-center min-w-0',
        style: { lineClamp: 3, overflow: 'hidden', textOverflow: 'ellipsis' },
        children: '{{get inputData "msg" default=""}}',
      }),
    ],
  });

/** No message on the msg page: dimmed centered quote takes the slot. */
const quoteCenterRow = (): Record<string, unknown> =>
  el('div', {
    tw: 'flex flex-1 min-h-0 items-center justify-center',
    children: [
      el('span', {
        tw: 'text-pixel-16 text-center min-w-0 opacity-60',
        style: { lineClamp: 3, overflow: 'hidden', textOverflow: 'ellipsis' },
        children: '{{get inputData "headline" default=""}}',
      }),
    ],
  });

/** Geometry-only plot height (296 wide): fills the card width; the relative
 *  tick labels are drawn by the canvas below it. */
const PLOT_H = 96;

export async function buildCanvas(
  now: Date,
  opts: { mode?: 'sun' | 'msg'; pomo?: string } = {},
): Promise<CanvasPayload> {
  const mode = opts.mode ?? 'sun';
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

  // sun page: the title row carries the message (falling back to the quote);
  // msg page: the title row always carries the quote
  const headline = mode === 'sun' ? (msg ?? quote) : quote;

  const plot =
    mode === 'sun'
      ? await buildBarePlot(now, { geometryOnly: true, height: PLOT_H })
      : undefined;

  const data: Record<string, unknown> = {
    // the title row and quoteCenterRow read "headline" (msg ?? quote,
    // decided per mode above)
    headline,
    date: footer,
    ...(wx ? { wx } : {}),
    ...(msg ? { msg } : {}),
    ...(plot
      ? { chart: `data:image/png;base64,${plot.toString('base64')}` }
      : {}),
  };

  const rows: Array<Record<string, unknown>> =
    mode === 'sun'
      ? [
          // sun page: the headline (msg ?? quote) is bold
          titleRow(true),
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
          // relative-time tick row, aligned to the image's 8px plot margins
          // inside the 4px window padding. Static spans — the device
          // template's `get` can't read $for loop variables.
          el('div', {
            tw: 'flex flex-row justify-between shrink-0 text-pixel-8 pl-[12px] pr-[4px]',
            children: axisTicks(now).map((t) =>
              el('span', { children: fmtOffset(t.offset) }),
            ),
          }),
          bottomRow(opts.pomo, hasWx),
        ]
      : [
          titleRow(),
          msg ? messageRow() : quoteCenterRow(),          bottomRow(opts.pomo, hasWx),
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
