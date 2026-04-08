// Standard architectural scales used in the dropdown.
// pixelsPerFoot is not stored here — it's calculated at runtime based on
// the calibration: (96 pixels per inch on screen) / (scale inches per foot)
// For the manual calibration option, the user draws a known line instead.

export const SCALE_OPTIONS = [
  { label: '1/8" = 1\'',  value: '1/8',  inchesPerFoot: 0.125 },
  { label: '1/4" = 1\'',  value: '1/4',  inchesPerFoot: 0.25  },
  { label: '3/8" = 1\'',  value: '3/8',  inchesPerFoot: 0.375 },
  { label: '1/2" = 1\'',  value: '1/2',  inchesPerFoot: 0.5   },
  { label: '3/4" = 1\'',  value: '3/4',  inchesPerFoot: 0.75  },
  { label: '1" = 1\'',    value: '1:1',  inchesPerFoot: 1     },
  { label: '1" = 10\'',   value: '1:10', inchesPerFoot: 0.1   },
  { label: '1" = 20\'',   value: '1:20', inchesPerFoot: 0.05  },
  { label: '1" = 30\'',   value: '1:30', inchesPerFoot: 1/30  },
  { label: '1" = 40\'',   value: '1:40', inchesPerFoot: 1/40  },
  { label: '1" = 50\'',   value: '1:50', inchesPerFoot: 1/50  },
  { label: '1" = 100\'',  value: '1:100',inchesPerFoot: 1/100 },
  { label: 'Manual calibration…', value: 'manual', inchesPerFoot: null },
]

// Given inchesPerFoot from the scale and the on-screen DPI (dots per inch),
// return how many canvas pixels equal one real-world foot.
// We assume 96 CSS px per inch (standard screen).
export function calcPixelsPerFoot(inchesPerFoot, screenDPI = 96) {
  return screenDPI / inchesPerFoot
}
