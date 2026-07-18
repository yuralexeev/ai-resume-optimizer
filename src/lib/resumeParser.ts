// Heuristic "resume parsing" for uploaded PDF/DOCX files — regex/keyword based,
// not real NLP. Produces the same structured shape the manual builder produces
// (src/lib/validation.ts resumeBuilderSchema) so the rest of the app never has
// to special-case "resume came from a file". The user reviews/corrects the
// result before it's saved (src/components/ResumeNewForm.tsx), so imperfect
// splitting here is acceptable — nothing from the source text is dropped, at
// worst it lands in the wrong field's description.

export type ParsedExperienceEntry = {
  company: string;
  role: string;
  period: string;
  description: string;
};

export type ParsedEducationEntry = {
  institution: string;
  degree: string;
  period: string;
};

export type ParsedResumeContent = {
  fullName: string;
  age: string;
  location: string;
  desiredPosition: string;
  contacts: { email: string; phone: string; telegram: string };
  experience: ParsedExperienceEntry[];
  education: ParsedEducationEntry[];
  skills: string[];
  summary: string;
};

const EXPERIENCE_HEADER = /^(опыт\s*работы|опыт|experience|work experience)\s*:?\s*$/i;
const EDUCATION_HEADER = /^(образование|education)\s*:?\s*$/i;
const SKILLS_HEADER = /^(ключевые\s*навыки|навыки|skills)\s*:?\s*$/i;
const SUMMARY_HEADER = /^(обо\s*мне|о\s*себе|about\s*me)\s*:?\s*$/i;

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(\+?\d[\d\s\-()]{7,}\d)/;
const AGE_LOCATION_RE = /^(\d{1,2}\s*(?:лет|года|год))\s*,\s*(.+)$/i;
const AGE_ONLY_RE = /^(\d{1,2}\s*(?:лет|года|год))\s*$/i;
const LOCATION_LABEL_RE = /^(?:город|location)\s*:\s*(.+)$/i;
const DESIRED_POSITION_RE = /^(?:желаемая\s+должность|должность)\s*:\s*(.+)$/i;
const TELEGRAM_LABEL_RE = /(?:tg|telegram)\s*:?\s*(@\w+)/i;
const BARE_TELEGRAM_RE = /(@[a-zA-Z]\w{3,})/;
// "Company — Role (period)" / "Company - Role (period)", loosely
const ENTRY_HEADER_RE = /^(.+?)\s*[—–-]\s*(.+?)\s*\(([^)]+)\)\s*$/;

type Section = "none" | "experience" | "education" | "skills" | "summary";

function splitIntoParagraphs(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim() === "") {
      if (current.length) paragraphs.push(current.join("\n"));
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length) paragraphs.push(current.join("\n"));
  return paragraphs;
}

function parseExperienceParagraph(paragraph: string): ParsedExperienceEntry {
  const lines = paragraph.split("\n").map((l) => l.trim());
  const match = lines[0]?.match(ENTRY_HEADER_RE);
  if (match) {
    return {
      company: match[1].trim(),
      role: match[2].trim(),
      period: match[3].trim(),
      description: lines.slice(1).join(" ").trim(),
    };
  }
  return { company: "", role: "", period: "", description: paragraph.trim() };
}

function parseEducationParagraph(paragraph: string): ParsedEducationEntry {
  const lines = paragraph.split("\n").map((l) => l.trim());
  const match = lines[0]?.match(ENTRY_HEADER_RE);
  if (match) {
    return {
      institution: match[1].trim(),
      degree: match[2].trim(),
      period: match[3].trim(),
    };
  }
  return { institution: paragraph.replace(/\n/g, " ").trim(), degree: "", period: "" };
}

function parseSkills(block: string): string[] {
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const raw of block.split(/[,;\n]+/)) {
    const skill = raw.trim();
    if (!skill) continue;
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    skills.push(skill);
  }
  return skills;
}

function extractHeaderFields(headerLines: string[]): {
  fullName: string;
  age: string;
  location: string;
  desiredPosition: string;
  telegram: string;
} {
  let fullName = "";
  let age = "";
  let location = "";
  let desiredPosition = "";
  let telegram = "";

  for (const raw of headerLines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const ageLocationMatch = trimmed.match(AGE_LOCATION_RE);
    if (ageLocationMatch) {
      age ||= ageLocationMatch[1].trim();
      location ||= ageLocationMatch[2].trim();
      continue;
    }
    const ageOnlyMatch = trimmed.match(AGE_ONLY_RE);
    if (ageOnlyMatch) {
      age ||= ageOnlyMatch[1].trim();
      continue;
    }
    const locationLabelMatch = trimmed.match(LOCATION_LABEL_RE);
    if (locationLabelMatch) {
      location ||= locationLabelMatch[1].trim();
      continue;
    }
    const desiredPositionMatch = trimmed.match(DESIRED_POSITION_RE);
    if (desiredPositionMatch) {
      desiredPosition ||= desiredPositionMatch[1].trim();
      continue;
    }
    const telegramMatch = trimmed.match(TELEGRAM_LABEL_RE) ?? trimmed.match(BARE_TELEGRAM_RE);
    if (telegramMatch) {
      telegram ||= telegramMatch[1];
      continue;
    }
    if (!fullName && trimmed.length <= 60 && !EMAIL_RE.test(trimmed) && !PHONE_RE.test(trimmed)) {
      fullName = trimmed;
    }
  }

  return { fullName, age, location, desiredPosition, telegram };
}

export function parseResumeText(text: string): ParsedResumeContent {
  const lines = text.split("\n");

  const buckets: Record<Section, string[]> = {
    none: [],
    experience: [],
    education: [],
    skills: [],
    summary: [],
  };

  let current: Section = "none";
  for (const line of lines) {
    const trimmed = line.trim();
    if (EXPERIENCE_HEADER.test(trimmed)) {
      current = "experience";
      continue;
    }
    if (EDUCATION_HEADER.test(trimmed)) {
      current = "education";
      continue;
    }
    if (SKILLS_HEADER.test(trimmed)) {
      current = "skills";
      continue;
    }
    if (SUMMARY_HEADER.test(trimmed)) {
      current = "summary";
      continue;
    }
    buckets[current].push(line);
  }

  const emailMatch = text.match(EMAIL_RE);
  const phoneMatch = text.match(PHONE_RE);
  const headerFields = extractHeaderFields(buckets.none);
  const telegram = headerFields.telegram || (text.match(TELEGRAM_LABEL_RE) ?? text.match(BARE_TELEGRAM_RE))?.[1] || "";

  return {
    fullName: headerFields.fullName,
    age: headerFields.age,
    location: headerFields.location,
    desiredPosition: headerFields.desiredPosition,
    contacts: {
      email: emailMatch?.[0] ?? "",
      phone: phoneMatch?.[0]?.trim() ?? "",
      telegram,
    },
    experience: splitIntoParagraphs(buckets.experience).map(parseExperienceParagraph),
    education: splitIntoParagraphs(buckets.education).map(parseEducationParagraph),
    skills: parseSkills(buckets.skills.join("\n")),
    summary: buckets.summary.join("\n").trim(),
  };
}
