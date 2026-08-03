// Self-contained bilingual copy for the /try demo. NOT wired to the app-wide
// react-i18next — this lives entirely under /try. Structured by surface key,
// each with `en` and `es`. Spanish is verbatim as supplied; do not machine-translate.

export const tryStrings = {
  languageGate: {
    en: { tagline: 'Built by trades, for trades.', sub: 'See it work in 60 seconds.' },
    es: { tagline: 'Hecho por gente del oficio, para gente del oficio.', sub: 'Míralo funcionar en 60 segundos.' },
  },

  hub: {
    en: {
      heading: "Are you a sub, or do you run the jobs?",
      sub: "Pick the part that's your world. It's all a live demo, no signup.",
      subCard: "I'm a sub",
      subValue: 'Log your work, bill your GC, get paid without chasing.',
      gcCard: 'I run the jobs',
      gcValue: 'Estimate, track your crew, and run every job from one board.',
    },
    es: {
      heading: '¿Eres subcontratista, o manejas los trabajos?',
      sub: 'Elige la parte que es tu mundo. Todo es una demo en vivo, sin registro.',
      subCard: 'Soy subcontratista',
      subValue: 'Registra tu trabajo, factura a tu contratista, y cobra sin perseguir a nadie.',
      gcCard: 'Manejo los trabajos',
      gcValue: 'Cotiza, controla a tu cuadrilla, y maneja cada trabajo desde un solo tablero.',
    },
  },

  subFlow: {
    en: {
      s0h: 'Your day, logged in seconds.', s0v: 'No more scraps of paper or end-of-week guessing.',
      s1h: 'Add the work you did.', s1v: "Piece or hourly, it's two taps.",
      s2h: 'Turn your hours into an invoice.', s2v: 'The billing that used to eat your night, done now.',
      s3h: "See what you're owed, at a glance.", s3v: 'Know your money without doing the math.',
    },
    es: {
      s0h: 'Tu día, registrado en segundos.', s0v: 'Se acabaron los papelitos y las cuentas del viernes.',
      s1h: 'Agrega el trabajo que hiciste.', s1v: 'Por pieza o por hora, en dos toques.',
      s2h: 'Convierte tus horas en una factura.', s2v: 'La facturación que te quitaba la noche, ya está lista.',
      s3h: 'Mira lo que te deben, de un vistazo.', s3v: 'Conoce tu dinero sin hacer cuentas.',
    },
  },

  subReveal: {
    en: { caption: 'This is what your GC sees.', value: 'A clean, professional invoice, with your name on it.', gate: "Enter your email and we'll send you the full invoice, exactly as your GC gets it." },
    es: { caption: 'Esto es lo que ve tu contratista.', value: 'Una factura limpia y profesional, con tu nombre.', gate: 'Deja tu correo y te enviamos la factura completa, tal como la recibe tu contratista.' },
  },

  gcMenu: {
    en: {
      heading: "You run the jobs. Here's the whole operation.",
      sub: 'Three tools to try. Four more to look through.',
      estH: 'Build an estimate', estV: 'Bid in seconds, not Sundays.',
      crewH: 'Track your crew', crewV: 'Every hour on the job, no texts.',
      jobsH: 'Run your job board', jobsV: 'See where every job stands.',
      peeksHeading: 'Take a look around',
      invH: 'Invoicing', invV: 'Paid vs. outstanding, always clear.',
      repH: 'Reporting', repV: 'Know what each job actually made.',
      bpH: 'Blueprint measure', bpV: 'Measure off the plan, on your phone.',
      cliH: 'Clients', cliV: 'Every customer, every job, in one place.',
    },
    es: {
      heading: 'Manejas los trabajos. Aquí está toda la operación.',
      sub: 'Tres herramientas para probar. Cuatro más para ver.',
      estH: 'Crea una cotización', estV: 'Cotiza en segundos, no en domingos.',
      crewH: 'Controla a tu cuadrilla', crewV: 'Cada hora en el trabajo, sin mensajes.',
      jobsH: 'Maneja tu tablero de trabajos', jobsV: 'Mira en qué va cada trabajo.',
      peeksHeading: 'Echa un vistazo',
      invH: 'Facturación', invV: 'Pagado o pendiente, siempre claro.',
      repH: 'Reportes', repV: 'Sabe cuánto ganó cada trabajo.',
      bpH: 'Medición de planos', bpV: 'Mide desde el plano, en tu teléfono.',
      cliH: 'Clientes', cliV: 'Cada cliente, cada trabajo, en un solo lugar.',
    },
  },

  estimateFlow: {
    en: {
      s0h: 'Start with the job.', s0v: 'A repaint, ready to price.',
      s1h: 'Watch it build itself.', s1v: 'The takeoff and pricing that took an hour, done in seconds.',
      s2h: 'One clean price, ready to send.', s2v: 'No spreadsheets. No guessing.',
    },
    es: {
      s0h: 'Empieza con el trabajo.', s0v: 'Un repintado, listo para cotizar.',
      s1h: 'Míralo armarse solo.', s1v: 'El cálculo y el precio que tomaban una hora, en segundos.',
      s2h: 'Un precio limpio, listo para enviar.', s2v: 'Sin hojas de cálculo. Sin adivinar.',
    },
  },

  estimateReveal: {
    en: { caption: 'This is what your customer sees.', value: 'A professional estimate they can accept in one tap.', gate: "Enter your email and we'll send you the full estimate, exactly as your customer gets it." },
    es: { caption: 'Esto es lo que ve tu cliente.', value: 'Una cotización profesional que aprueban con un toque.', gate: 'Deja tu correo y te enviamos la cotización completa, tal como la recibe tu cliente.' },
  },

  crewFlow: {
    en: {
      s0h: 'Send your crew a link.', s0v: 'They clock in from their phone. No app, no account.',
      s1h: 'They clock in from the job.', s1v: 'You see it happen, with location.',
      s2h: 'Approve their time in seconds.', s2v: 'No paper timesheets, no chasing hours.',
      s3h: 'Every hour, tracked and approved.', s3v: 'Without a single text message.',
    },
    es: {
      s0h: 'Manda a tu cuadrilla un enlace.', s0v: 'Marcan entrada desde su teléfono. Sin app, sin cuenta.',
      s1h: 'Marcan entrada desde el trabajo.', s1v: 'Tú lo ves en el momento, con ubicación.',
      s2h: 'Aprueba sus horas en segundos.', s2v: 'Sin hojas de papel, sin perseguir horas.',
      s3h: 'Cada hora, registrada y aprobada.', s3v: 'Sin un solo mensaje de texto.',
    },
  },

  payReveal: {
    en: { caption: 'Approved hours become a pay statement.', value: 'Clean, itemized, ready for your books.', gate: "Enter your email and we'll send you the full pay statement." },
    es: { caption: 'Las horas aprobadas se vuelven un recibo de pago.', value: 'Limpio, detallado, listo para tu contabilidad.', gate: 'Deja tu correo y te enviamos el recibo de pago completo.' },
  },

  jobsFlow: {
    en: {
      s0h: 'Every job, on one board.', s0v: "See what's bidding, scheduled, and done.",
      tap: 'Tap the Oakwood job to send it to the client.', moved: 'Moved to Sent, just like that.',
    },
    es: {
      s0h: 'Cada trabajo, en un solo tablero.', s0v: 'Mira qué está en cotización, agendado, y terminado.',
      tap: 'Toca el trabajo Oakwood para enviarlo al cliente.', moved: 'Movido a Enviado, así de fácil.',
    },
  },

  peeks: {
    en: {
      invH: 'Invoicing', invV: 'Every invoice, paid or outstanding, at a glance.',
      repH: 'Reporting', repV: 'What every job actually made.',
      bpH: 'Blueprint measure', bpV: 'Measured off the plan, zone by zone.',
      cliH: 'Clients', cliV: 'Every customer and their jobs in one place.',
    },
    es: {
      invH: 'Facturación', invV: 'Cada factura, pagada o pendiente, de un vistazo.',
      repH: 'Reportes', repV: 'Lo que realmente ganó cada trabajo.',
      bpH: 'Medición de planos', bpV: 'Medido desde el plano, zona por zona.',
      cliH: 'Clientes', cliV: 'Cada cliente y sus trabajos en un solo lugar.',
    },
  },

  end: {
    en: { eyebrow: 'Founding offer', trial: '14-day free trial. Cancel anytime.', primary: 'Start free trial', headline: 'First 25 trade pros in {state} lock $79.99/mo for life.' },
    es: { eyebrow: 'Oferta de fundador', trial: 'Prueba gratis de 14 días. Cancela cuando quieras.', primary: 'Comienza tu prueba gratis', headline: 'Los primeros 25 del oficio en {state} aseguran $79.99/mes de por vida.' },
  },

  common: {
    en: { back: 'Back to start', backMenu: 'Back to menu', skip: 'Skip for now', signup: 'Sign up', seeGc: 'See what your GC sees', seeClient: 'See what your customer sees', seePay: 'See the pay statement' },
    es: { back: 'Volver al inicio', backMenu: 'Volver al menú', skip: 'Ahora no', signup: 'Regístrate', seeGc: 'Ver lo que ve tu contratista', seeClient: 'Ver lo que ve tu cliente', seePay: 'Ver el recibo de pago' },
  },
}

// Convenience: tr('hub', lang) → the resolved copy for that surface (en fallback).
export function tr(surface, lang) {
  const s = tryStrings[surface]
  return (s && (s[lang] || s.en)) || {}
}
