// Standard architectural scales used in the dropdown.
// inchesPerFoot = how many drawing inches represent 1 real-world foot.
// pixelsPerFoot is calculated at runtime from the actual render resolution.

// Ordered by ratio within each family: architect scales (coarse 1:128 → fine 1:4)
// first, then engineer scales (1:120 → 1:1200), then manual calibration.
// inchesPerFoot is the ratio's defining number: for an architect scale it IS the
// fraction in the label (3/16" = 1' → 0.1875); for an engineer scale it is the
// reciprocal of the feet (1" = 20' → 1/20). Ratio 1:n === 12 / inchesPerFoot.
export const SCALE_OPTIONS = [
  // ── Architect ──
  { label: '3/32" = 1\'',  value: '3/32',  inchesPerFoot: 0.09375 },
  { label: '1/8" = 1\'',   value: '1/8',   inchesPerFoot: 0.125   },
  { label: '3/16" = 1\'',  value: '3/16',  inchesPerFoot: 0.1875  },
  { label: '1/4" = 1\'',   value: '1/4',   inchesPerFoot: 0.25    },
  { label: '3/8" = 1\'',   value: '3/8',   inchesPerFoot: 0.375   },
  { label: '1/2" = 1\'',   value: '1/2',   inchesPerFoot: 0.5     },
  { label: '3/4" = 1\'',   value: '3/4',   inchesPerFoot: 0.75    },
  { label: '1" = 1\'',     value: '1:1',   inchesPerFoot: 1       },
  { label: '1-1/2" = 1\'', value: '1-1/2', inchesPerFoot: 1.5     },
  { label: '3" = 1\'',     value: '3',     inchesPerFoot: 3       },
  // ── Engineer ──
  { label: '1" = 10\'',    value: '1:10',  inchesPerFoot: 0.1     },
  { label: '1" = 20\'',    value: '1:20',  inchesPerFoot: 0.05    },
  { label: '1" = 30\'',    value: '1:30',  inchesPerFoot: 1/30    },
  { label: '1" = 40\'',    value: '1:40',  inchesPerFoot: 1/40    },
  { label: '1" = 50\'',    value: '1:50',  inchesPerFoot: 1/50    },
  { label: '1" = 60\'',    value: '1:60',  inchesPerFoot: 1/60    },
  { label: '1" = 100\'',   value: '1:100', inchesPerFoot: 1/100   },
  // NOTE: notation labels above are language-neutral symbols and stay literal.
  // Only this manual entry's label is translatable — it holds a t() KEY that
  // consumers resolve at render time (see ScalePanel / SessionPage).
  { label: 'common:scale.manual', value: 'manual', inchesPerFoot: null },
]

// Calculate how many canvas pixels equal one real-world foot.
//
// inchesPerFoot — drawing inches per real foot (from the scale, e.g. 0.25 for 1/4")
// pixelsPerInch — render resolution from usePdf (pixels per physical page inch)
//                 Falls back to 96 (CSS standard) for non-PDF images.
//
// The math: 1 real foot = inchesPerFoot drawing inches.
// Each drawing inch = pixelsPerInch rendered pixels.
// So: pixelsPerFoot = pixelsPerInch × inchesPerFoot.
export function calcPixelsPerFoot(inchesPerFoot, pixelsPerInch = 96) {
  return pixelsPerInch * inchesPerFoot
}
