// A small, hand-verified starting list — NOT exhaustive. For any school not
// listed here, the app falls back to generating a search-engine link scoped
// to that country's official education domains (.edu, .ac.uk, .ca), which
// scales to any school without guessing at a URL that might be wrong.
//
// Every entry below points to a general financial-aid/student-funding LANDING
// PAGE (not a specific phone number or email) — those change far less often
// and are safer to keep accurate over time. Re-verify periodically.

const SCHOOL_DIRECTORY = [
  { name: 'Harvard University', country: 'us', aliases: ['harvard'], url: 'https://sfs.harvard.edu/' },
  { name: 'Stanford University', country: 'us', aliases: ['stanford'], url: 'https://financialaid.stanford.edu/' },
  { name: 'Massachusetts Institute of Technology (MIT)', country: 'us', aliases: ['mit', 'massachusetts institute of technology'], url: 'https://sfs.mit.edu/' },
  { name: 'University of Michigan', country: 'us', aliases: ['university of michigan', 'umich', 'michigan'], url: 'https://finaid.umich.edu/' },
  { name: 'New York University (NYU)', country: 'us', aliases: ['nyu', 'new york university'], url: 'https://www.nyu.edu/admissions/financial-aid-and-scholarships/contact-financial-aid.html' },

  { name: 'University of Toronto', country: 'ca', aliases: ['u of t', 'university of toronto', 'uoft'], url: 'https://www.registrar.utoronto.ca/financial-aid-awards/' },
  { name: 'McGill University', country: 'ca', aliases: ['mcgill'], url: 'https://www.mcgill.ca/studentaid/' },
  { name: 'University of British Columbia (UBC)', country: 'ca', aliases: ['ubc', 'university of british columbia'], url: 'https://students.ubc.ca/finances/' },

  { name: 'University of Oxford', country: 'uk', aliases: ['oxford', 'university of oxford'], url: 'https://www.ox.ac.uk/students/fees-funding' },
  { name: 'University of Cambridge', country: 'uk', aliases: ['cambridge', 'university of cambridge'], url: 'https://www.student-funding.cam.ac.uk/' },
  { name: 'Imperial College London', country: 'uk', aliases: ['imperial', 'imperial college', 'imperial college london'], url: 'https://www.imperial.ac.uk/students/fees-and-funding/' },
  { name: 'University College London (UCL)', country: 'uk', aliases: ['ucl', 'university college london'], url: 'https://www.ucl.ac.uk/study/student-finances' }
];

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(the|university|college|of|at)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findSchool(name) {
  const target = normalize(name);
  if (!target) return null;
  return SCHOOL_DIRECTORY.find((entry) => {
    if (normalize(entry.name) === target) return true;
    return entry.aliases.some((a) => normalize(a) === target);
  }) || null;
}

const COUNTRY_DOMAIN = { us: '.edu', ca: '.ca', uk: '.ac.uk' };

function buildSearchLinks(school, country) {
  const domainHint = COUNTRY_DOMAIN[country] ? ` site:${COUNTRY_DOMAIN[country]}` : '';
  const query = `${school} financial aid OR student funding office contact${domainHint}`;
  const encoded = encodeURIComponent(query);
  return {
    google: `https://www.google.com/search?q=${encoded}`,
    bing: `https://www.bing.com/search?q=${encoded}`
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SCHOOL_DIRECTORY, findSchool, buildSearchLinks, normalize };
}
