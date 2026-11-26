export const pageDetails = {
  "home": {
    "title": "NovAtom Labs | Autonomous discovery for the experimental sciences",
    "description": "NovAtom Labs builds closed-loop research systems that form hypotheses, choose experiments, run them in simulation and on instruments, and learn from every outcome. Starting with materials and semiconductors.",
    "openGraphTitle": "NovAtom Labs | Autonomous discovery for the experimental sciences",
    "openGraphDescription": "NovAtom Labs builds closed-loop research systems that form hypotheses, choose experiments, run them in simulation and on instruments, and learn from every outcome. Starting with materials and semiconductors."
  },
  "technology": {
    "title": "Technology | NovAtom Labs",
    "description": "One core loop for any experimental science: domain packs plug in, language models plan, deterministic tools measure, and every result carries a trust tier.",
    "openGraphTitle": "Technology | NovAtom Labs",
    "openGraphDescription": "One core loop for any experimental science: domain packs plug in, language models plan, deterministic tools measure, and every result carries a trust tier."
  },
  "products": {
    "title": "Products | NovAtom Labs",
    "description": "NexCon-03 for materials discovery and Kronig for device simulation, both built on the NovAtom platform, with more domain packs in development.",
    "openGraphTitle": "Products | NovAtom Labs",
    "openGraphDescription": "NexCon-03 for materials discovery and Kronig for device simulation, both built on the NovAtom platform, with more domain packs in development."
  },
  "nexcon": {
    "title": "NexCon-03 | NovAtom Labs",
    "description": "NexCon-03 autonomously proposes and evaluates compound semiconductors and works backwards from a target emission wavelength to a composition and growth recipe.",
    "openGraphTitle": "NexCon-03 | NovAtom Labs",
    "openGraphDescription": "NexCon-03 autonomously proposes and evaluates compound semiconductors and works backwards from a target emission wavelength to a composition and growth recipe."
  },
  "kronig": {
    "title": "Kronig | NovAtom Labs",
    "description": "Kronig turns plain-English device requests into verified TCAD on DEVSIM and Synopsys Sentaurus, checked by more than twenty physics validations.",
    "openGraphTitle": "Kronig | NovAtom Labs",
    "openGraphDescription": "Kronig turns plain-English device requests into verified TCAD on DEVSIM and Synopsys Sentaurus, checked by more than twenty physics validations."
  },
  "about": {
    "title": "About us | NovAtom Labs",
    "description": "Why now, our model, the team and the institutions working with NovAtom Labs.",
    "openGraphTitle": "About us | NovAtom Labs",
    "openGraphDescription": "Why now, our model, the team and the institutions working with NovAtom Labs."
  },
  "contact": {
    "title": "Request access | NovAtom Labs",
    "description": "Tell NovAtom Labs the problem you want to solve and we will reply with what a pilot would involve.",
    "openGraphTitle": "Request access | NovAtom Labs",
    "openGraphDescription": "Tell NovAtom Labs the problem you want to solve and we will reply with what a pilot would involve."
  },
  "privacy": {
    "title": "Privacy policy | NovAtom Labs",
    "description": "How NovAtom Labs handles information submitted through the Request access form, and how to contact us about it.",
    "openGraphTitle": "Privacy policy | NovAtom Labs",
    "openGraphDescription": "How NovAtom Labs handles information submitted through the Request access form."
  }
} as const;

export type PageName = keyof typeof pageDetails;
