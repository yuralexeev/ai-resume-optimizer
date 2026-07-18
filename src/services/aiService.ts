// Thin abstraction over the AI provider used for vacancy analysis, resume
// adaptation and ATS scoring.
//
// `adaptResume` calls a real LLM via OpenRouter's free tier
// (src/lib/openRouterClient.ts) and falls back silently to a deterministic
// mock (`adaptResumeMock`) whenever the call fails, the response doesn't
// parse, or it looks like it violates the no-fabrication rule — free-tier
// rate limits are tight and models get delisted, so a failed AI call is
// routine, not exceptional, and never surfaces as an error to the user.
//
// `extractVacancyRequirements` / `analyzeVacancyMatch` (Release 2) stay
// deterministic mock logic — matching/analysis wasn't part of this AI swap.
//
// `scoreAts` (Release 4) is different on purpose: the score itself is a
// fixed, auditable formula (keyword match + structure checklist + text
// density) and stays that way permanently — an ATS score should be
// reproducible and explainable, not an LLM guess. Only the wording of its
// `reasons`/`recommendations` is a candidate for a future AI upgrade; the
// `score` number itself is not.

import { z } from "zod";
import { callOpenRouter, type ChatMessage } from "@/lib/openRouterClient";
import { diffResumeVersions } from "@/lib/resumeDiff";

// Non-negotiable instruction injected into every resume-adaptation system
// prompt: the model must never invent experience, skills or achievements that
// aren't already present in the user's source resume.
export const NO_FABRICATION_RULE =
  "Не придумывай факты, опыт, навыки или достижения, отсутствующие в исходном резюме пользователя. " +
  "Разрешено только переформулировать, структурировать и расставлять акценты на основе того, что пользователь действительно указал.";

export const ADAPTATION_DISCLAIMER =
  "Проверьте сгенерированный текст — AI мог неточно интерпретировать формулировки. " +
  "Ответственность за достоверность резюме несёт пользователь.";

export const ATS_SCORE_DISCLAIMER =
  "Оценка приблизительная и носит рекомендательный характер.";

export const ANALYSIS_DISCLAIMER =
  "Анализ рассчитан по упрощённой модели и носит рекомендательный характер — " +
  "перепроверьте требования вакансии самостоятельно.";

export type ExtractedRequirements = {
  mustHave: string[];
  niceToHave: string[];
};

export type CategoryScores = {
  skills: number;
  experience: number;
  education: number;
};

export type MatchAnalysis = {
  matchPercent: number;
  categoryScores: CategoryScores;
  matchedSkills: string[];
  missingSkills: string[];
};

export type DiffSection = {
  label: string;
  before: string;
  after: string;
};

export type AdaptationResult = {
  adaptedContent: ResumeContent;
  addedKeywords: string[];
  diff: DiffSection[];
};

// Single source of truth for how much each factor counts toward the final
// ATS score — shared with the score breakdown UI so the displayed weights
// can never drift from the actual formula below.
export const ATS_WEIGHTS = {
  keywords: 0.45,
  structure: 0.35,
  density: 0.2,
} as const;

export type AtsFactorScores = {
  keywords: number; // 0-100, weight 45%
  structure: number; // 0-100, weight 35%
  density: number; // 0-100, weight 20%
};

export type AtsScoreResult = {
  score: number; // 0-100
  factorScores: AtsFactorScores;
  reasons: string[];
  recommendations: string[];
};

// Structured resume content as stored in Resume.contentJson. Every resume —
// whether typed into the builder or uploaded and parsed (src/lib/resumeParser.ts)
// — is normalized into this one shape, so there's no separate "flat text"
// branch anywhere downstream (analysis, adaptation, future ATS scoring).
export type ResumeExperienceEntry = {
  company?: string;
  role?: string;
  period?: string;
  description?: string;
};
export type ResumeEducationEntry = {
  institution?: string;
  degree?: string;
  period?: string;
};
export type ResumeContent = {
  fullName?: string;
  age?: string;
  location?: string;
  desiredPosition?: string;
  contacts?: { email?: string; phone?: string; telegram?: string };
  skills?: string[];
  experience?: ResumeExperienceEntry[];
  education?: ResumeEducationEntry[];
  summary?: string;
} | null;

const SPLIT_PATTERN = /[,;\n.:]+|\s+и\s+/gi;
const MIN_PHRASE_LENGTH = 3;
const MAX_PHRASE_LENGTH = 80;
const MAX_REQUIREMENTS = 12;
const MAX_KEYWORDS_TO_ADD = 5;

export async function extractVacancyRequirements(
  vacancyText: string
): Promise<ExtractedRequirements> {
  const seen = new Set<string>();
  const phrases: string[] = [];

  for (const raw of vacancyText.split(SPLIT_PATTERN)) {
    const phrase = raw.trim().replace(/^[-•*\d.)\s]+/, "");
    if (phrase.length < MIN_PHRASE_LENGTH || phrase.length > MAX_PHRASE_LENGTH) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    phrases.push(phrase);
    if (phrases.length >= MAX_REQUIREMENTS) break;
  }

  const splitIndex = Math.ceil(phrases.length * 0.6);
  return {
    mustHave: phrases.slice(0, splitIndex),
    niceToHave: phrases.slice(splitIndex),
  };
}

function buildResumeSearchText(resumeContent: ResumeContent): string {
  if (!resumeContent) return "";
  const parts: string[] = [];
  if (resumeContent.desiredPosition) parts.push(resumeContent.desiredPosition);
  if (resumeContent.summary) parts.push(resumeContent.summary);
  if (Array.isArray(resumeContent.skills)) parts.push(...resumeContent.skills);
  if (Array.isArray(resumeContent.experience)) {
    for (const entry of resumeContent.experience) {
      if (entry.role) parts.push(entry.role);
      if (entry.description) parts.push(entry.description);
    }
  }
  if (Array.isArray(resumeContent.education)) {
    for (const entry of resumeContent.education) {
      if (entry.degree) parts.push(entry.degree);
      if (entry.institution) parts.push(entry.institution);
    }
  }
  return parts.join(" ").toLowerCase();
}

function requirementMatches(requirement: string, resumeText: string): boolean {
  const normalized = requirement.toLowerCase();
  if (resumeText.includes(normalized)) return true;
  const significantWords = normalized.split(/\s+/).filter((w) => w.length >= 4);
  return significantWords.some((word) => resumeText.includes(word));
}

function experienceScore(resumeContent: ResumeContent): number {
  if (Array.isArray(resumeContent?.experience) && resumeContent.experience.length > 0) return 75;
  return 20;
}

function educationScore(resumeContent: ResumeContent): number {
  if (Array.isArray(resumeContent?.education) && resumeContent.education.length > 0) return 75;
  return 20;
}

export async function analyzeVacancyMatch(
  resumeContent: unknown,
  _vacancyText: string,
  requirements: ExtractedRequirements
): Promise<MatchAnalysis> {
  const content = resumeContent as ResumeContent;
  const resumeText = buildResumeSearchText(content);
  const allRequirements = [...requirements.mustHave, ...requirements.niceToHave];

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const requirement of allRequirements) {
    if (requirementMatches(requirement, resumeText)) {
      matchedSkills.push(requirement);
    } else {
      missingSkills.push(requirement);
    }
  }

  const skillsScore =
    allRequirements.length === 0
      ? 0
      : Math.round((matchedSkills.length / allRequirements.length) * 100);

  const categoryScores: CategoryScores = {
    skills: skillsScore,
    experience: experienceScore(content),
    education: educationScore(content),
  };

  const matchPercent = Math.round(
    (categoryScores.skills + categoryScores.experience + categoryScores.education) / 3
  );

  return { matchPercent, categoryScores, matchedSkills, missingSkills };
}

export async function adaptResume(
  resumeContent: unknown,
  vacancyText: string,
  matchAnalysis: MatchAnalysis
): Promise<AdaptationResult> {
  const original = resumeContent as ResumeContent;
  if (!original) {
    return { adaptedContent: original, addedKeywords: [], diff: [] };
  }

  const aiResult = await tryAdaptResumeWithAi(original, vacancyText, matchAnalysis);
  if (aiResult) return aiResult;

  return adaptResumeMock(original, matchAnalysis);
}

const aiAdaptationResponseSchema = z.object({
  fullName: z.string().optional(),
  age: z.string().optional(),
  location: z.string().optional(),
  desiredPosition: z.string().optional(),
  contacts: z
    .object({ email: z.string().optional(), phone: z.string().optional(), telegram: z.string().optional() })
    .optional(),
  skills: z.array(z.string()).optional(),
  experience: z
    .array(
      z.object({
        company: z.string().optional(),
        role: z.string().optional(),
        period: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .optional(),
  education: z
    .array(
      z.object({
        institution: z.string().optional(),
        degree: z.string().optional(),
        period: z.string().optional(),
      })
    )
    .optional(),
  summary: z.string().optional(),
  addedKeywords: z.array(z.string()).default([]),
});

function buildAdaptationSystemPrompt(): string {
  return (
    "Ты — ассистент, который адаптирует резюме под конкретную вакансию.\n" +
    `${NO_FABRICATION_RULE}\n` +
    "Верни ТОЛЬКО валидный JSON без markdown и комментариев со следующими полями:\n" +
    '{"fullName": string, "age": string, "location": string, "desiredPosition": string, ' +
    '"contacts": {"email": string, "phone": string, "telegram": string}, ' +
    '"skills": string[], ' +
    '"experience": [{"company": string, "role": string, "period": string, "description": string}], ' +
    '"education": [{"institution": string, "degree": string, "period": string}], ' +
    '"summary": string, ' +
    '"addedKeywords": string[]}\n' +
    "Поля age, location, desiredPosition, contacts, summary переноси из исходного резюме без изменений, " +
    "если только они не мешают формулировкам под вакансию (например, desiredPosition можно оставить как есть — " +
    "не выдумывай желаемую должность, если её не было). " +
    "Сохрани количество и порядок пунктов опыта и образования как в исходном резюме — не добавляй новые пункты. " +
    "Переформулируй описания опыта под требования вакансии и расставь приоритет навыков под неё. " +
    "Резюме проверяют по совпадению ключевых слов с вакансией — это самый весомый фактор оценки, поэтому: " +
    "навыки и формулировки опыта из списка «Совпадающие навыки» (они уже подтверждённо присутствуют в резюме) " +
    "обязательно приведи дословно так, как они звучат в вакансии — добавь их в skills и/или вплети точную формулировку " +
    "в описание опыта, если это не искажает факты. Список «Отсутствующие в резюме требования вакансии» — это то, " +
    "чего в резюме на самом деле нет; никогда не добавляй эти пункты в skills или опыт, добавлять их запрещено правилом выше. " +
    "В addedKeywords перечисли ключевые слова из вакансии, которые ты подчеркнул или добавил в текст."
  );
}

function buildAdaptationUserPrompt(
  original: NonNullable<ResumeContent>,
  vacancyText: string,
  matchAnalysis: MatchAnalysis
): string {
  return (
    `Резюме (JSON): ${JSON.stringify(original)}\n\n` +
    `Вакансия: ${vacancyText}\n\n` +
    `Совпадающие навыки: ${matchAnalysis.matchedSkills.join(", ") || "нет"}\n` +
    `Отсутствующие в резюме требования вакансии: ${matchAnalysis.missingSkills.join(", ") || "нет"}`
  );
}

async function tryAdaptResumeWithAi(
  original: NonNullable<ResumeContent>,
  vacancyText: string,
  matchAnalysis: MatchAnalysis
): Promise<AdaptationResult | null> {
  const messages: ChatMessage[] = [
    { role: "system", content: buildAdaptationSystemPrompt() },
    { role: "user", content: buildAdaptationUserPrompt(original, vacancyText, matchAnalysis) },
  ];

  const response = await callOpenRouter(messages);
  if (!response.success) return null;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(response.content);
  } catch {
    return null;
  }

  const parsed = aiAdaptationResponseSchema.safeParse(parsedJson);
  if (!parsed.success) return null;

  // No-fabrication guard: rephrasing existing entries is fine, inventing new
  // ones is not — treat a longer list than the original as a rule violation
  // and fall back to the deterministic mock instead of trusting it.
  if (
    (parsed.data.experience?.length ?? 0) > (original.experience?.length ?? 0) ||
    (parsed.data.education?.length ?? 0) > (original.education?.length ?? 0)
  ) {
    return null;
  }

  const adaptedContent: NonNullable<ResumeContent> = {
    fullName: parsed.data.fullName ?? original.fullName,
    age: parsed.data.age ?? original.age,
    location: parsed.data.location ?? original.location,
    desiredPosition: parsed.data.desiredPosition ?? original.desiredPosition,
    contacts: parsed.data.contacts ?? original.contacts,
    skills: parsed.data.skills ?? original.skills,
    experience: parsed.data.experience ?? original.experience,
    education: parsed.data.education ?? original.education,
    summary: parsed.data.summary ?? original.summary,
  };

  return {
    adaptedContent,
    addedKeywords: parsed.data.addedKeywords,
    diff: diffResumeVersions(original, adaptedContent),
  };
}

function adaptResumeMock(
  original: NonNullable<ResumeContent>,
  matchAnalysis: MatchAnalysis
): AdaptationResult {
  const adapted: NonNullable<ResumeContent> = JSON.parse(JSON.stringify(original));
  const diff: DiffSection[] = [];
  const addedKeywords: string[] = [];
  const matchedLower = new Set(matchAnalysis.matchedSkills.map((s) => s.toLowerCase()));

  // Reorder skills so ones matched against the vacancy come first — pure
  // reshuffling of what's already on the resume, nothing invented.
  const originalSkills = adapted.skills ?? [];
  if (originalSkills.length > 0) {
    const prioritized = [...originalSkills].sort((a, b) => {
      const aMatched = matchedLower.has(a.toLowerCase()) ? 0 : 1;
      const bMatched = matchedLower.has(b.toLowerCase()) ? 0 : 1;
      return aMatched - bMatched;
    });
    if (prioritized.join("|") !== originalSkills.join("|")) {
      diff.push({
        label: "Навыки",
        before: originalSkills.join(", "),
        after: prioritized.join(", "),
      });
      adapted.skills = prioritized;
    }
  }

  // Make sure the most recent experience entry explicitly names matched
  // skills it doesn't already mention — only skills confirmed present
  // elsewhere on the resume (matchAnalysis.matchedSkills), never invented.
  const experience = adapted.experience ?? [];
  if (experience.length > 0) {
    const entry = experience[0];
    const before = entry.description ?? "";
    const descLower = before.toLowerCase();
    const keywordsToAdd = matchAnalysis.matchedSkills
      .filter((skill) => !descLower.includes(skill.toLowerCase()))
      .slice(0, MAX_KEYWORDS_TO_ADD);

    if (keywordsToAdd.length > 0) {
      const after = `${before}${before.trim() ? " " : ""}Применялись навыки: ${keywordsToAdd.join(", ")}.`;
      entry.description = after;
      const roleLabel = [entry.company, entry.role].filter(Boolean).join(" — ") || "Опыт работы";
      diff.push({ label: `Опыт: ${roleLabel}`, before, after });
      addedKeywords.push(...keywordsToAdd);
    }
  }

  return { adaptedContent: adapted, addedKeywords, diff };
}

const TABLE_ARTIFACT_RE = /\t|\s\|\s|\|{2,}/;
// Kept in sync with densityScoreFor's low-end cutoff so the structure and
// density factors never produce contradictory reasons for the same resume.
const MIN_DESCRIPTION_LENGTH = 40;

function allDescriptions(content: ResumeContent): string[] {
  if (!content || !Array.isArray(content.experience)) return [];
  return content.experience.map((e) => e.description ?? "").filter(Boolean);
}

function structureFactor(content: ResumeContent): { score: number; reasons: string[]; recommendations: string[] } {
  const reasons: string[] = [];
  const recommendations: string[] = [];
  let score = 0;

  if (content?.fullName?.trim()) {
    score += 15;
  } else {
    reasons.push("В резюме не указано ФИО.");
    recommendations.push("Добавьте ФИО в начало резюме.");
  }

  if (content?.contacts?.email?.trim()) {
    score += 10;
  } else {
    reasons.push("Не указан email для связи.");
    recommendations.push("Добавьте контактный email.");
  }

  if (content?.contacts?.phone?.trim()) {
    score += 10;
  } else {
    reasons.push("Не указан телефон для связи.");
    recommendations.push("Добавьте контактный телефон.");
  }

  const experience = content?.experience ?? [];
  if (experience.length > 0 && experience.every((e) => (e.description ?? "").length >= MIN_DESCRIPTION_LENGTH)) {
    score += 25;
    reasons.push("Опыт работы описан с достаточной детализацией.");
  } else if (experience.length > 0) {
    score += 10;
    reasons.push("Описание опыта работы слишком краткое.");
    recommendations.push(
      "Расширьте описание обязанностей и достижений для каждого места работы (1–2 предложения)."
    );
  } else {
    reasons.push("В резюме нет ни одного места работы.");
    recommendations.push("Добавьте хотя бы одно место работы с описанием обязанностей.");
  }

  if ((content?.education ?? []).length > 0) {
    score += 15;
  } else {
    reasons.push("В резюме не указано образование.");
    recommendations.push("Добавьте раздел «Образование».");
  }

  const skills = content?.skills ?? [];
  if (skills.length >= 3) {
    score += 15;
  } else {
    reasons.push(`Указано мало навыков (${skills.length}).`);
    recommendations.push("Добавьте больше релевантных навыков (минимум 3).");
  }

  if (allDescriptions(content).some((d) => TABLE_ARTIFACT_RE.test(d))) {
    reasons.push("В описании опыта найдены символы табуляции/вертикальные черты — возможно, текст скопирован из таблицы.");
    recommendations.push(
      "Уберите символы табуляции и вертикальные черты из описаний — ATS-системы плохо распознают таблицы."
    );
  } else {
    score += 10;
  }

  return { score: Math.min(100, score), reasons, recommendations };
}

function densityScoreFor(length: number): number {
  if (length === 0) return 0;
  if (length < 40) return Math.round((length / 40) * 50);
  if (length <= 400) return 100;
  if (length <= 700) return 80;
  return 60;
}

function densityFactor(content: ResumeContent): { score: number; reasons: string[]; recommendations: string[] } {
  const descriptions = allDescriptions(content);
  if (descriptions.length === 0) {
    return {
      score: 0,
      reasons: ["Нет описаний опыта работы для оценки плотности текста."],
      recommendations: [],
    };
  }

  const avgLength = descriptions.reduce((sum, d) => sum + d.length, 0) / descriptions.length;
  const score = Math.round(
    descriptions.reduce((sum, d) => sum + densityScoreFor(d.length), 0) / descriptions.length
  );

  const reasons: string[] = [];
  const recommendations: string[] = [];
  if (avgLength < 40) {
    reasons.push(`Средняя длина описания опыта — ${Math.round(avgLength)} символов, это слишком мало.`);
    recommendations.push("Добавьте больше конкретики в описание обязанностей и достижений.");
  } else if (avgLength > 700) {
    reasons.push(`Средняя длина описания опыта — ${Math.round(avgLength)} символов, это может быть избыточно.`);
    recommendations.push("Сократите описание опыта до ключевых обязанностей и достижений.");
  } else {
    reasons.push(`Средняя длина описания опыта — ${Math.round(avgLength)} символов, оптимально для ATS.`);
  }

  return { score, reasons, recommendations };
}

// Fixed, auditable formula — see the file-level comment above. Never a real
// LLM call, by design: an ATS score must be reproducible and explainable.
export async function scoreAts(
  resumeContent: unknown,
  matchAnalysis: MatchAnalysis
): Promise<AtsScoreResult> {
  const content = resumeContent as ResumeContent;

  const keywords = matchAnalysis.categoryScores.skills;
  const structure = structureFactor(content);
  const density = densityFactor(content);

  const score = Math.round(
    keywords * ATS_WEIGHTS.keywords + structure.score * ATS_WEIGHTS.structure + density.score * ATS_WEIGHTS.density
  );

  const reasons = [
    `Совпадение ключевых слов с вакансией: ${matchAnalysis.matchedSkills.length} из ${
      matchAnalysis.matchedSkills.length + matchAnalysis.missingSkills.length
    }.`,
    ...structure.reasons,
    ...density.reasons,
  ];

  const recommendations = [...structure.recommendations, ...density.recommendations];
  if (matchAnalysis.missingSkills.length > 0) {
    recommendations.push(
      `Добавьте в резюме навыки, упомянутые в вакансии: ${matchAnalysis.missingSkills.slice(0, 5).join(", ")}.`
    );
  }

  return {
    score,
    factorScores: { keywords, structure: structure.score, density: density.score },
    reasons,
    recommendations,
  };
}
