import type {
  ResumeContent,
  ResumeExperienceEntry,
  ResumeEducationEntry,
  DiffSection,
} from "@/services/aiService";

function experienceLabel(entry: ResumeExperienceEntry): string {
  const parts = [entry.company, entry.role].filter(Boolean).join(" — ");
  const period = entry.period ? ` (${entry.period})` : "";
  const label = `${parts}${period}`.trim();
  return [label, entry.description].filter(Boolean).join("\n");
}

function educationLabel(entry: ResumeEducationEntry): string {
  const parts = [entry.institution, entry.degree].filter(Boolean).join(" — ");
  return entry.period ? `${parts} (${entry.period})` : parts;
}

function diffEntryLists<T>(
  before: T[],
  after: T[],
  sectionLabel: string,
  entryLabel: (entry: T) => string,
  entryTitle: (entry: T) => string
): DiffSection[] {
  const sections: DiffSection[] = [];
  const max = Math.max(before.length, after.length);
  for (let i = 0; i < max; i++) {
    const beforeEntry = before[i];
    const afterEntry = after[i];
    const beforeText = beforeEntry ? entryLabel(beforeEntry) : "";
    const afterText = afterEntry ? entryLabel(afterEntry) : "";
    if (beforeText === afterText) continue;

    const title = afterEntry ? entryTitle(afterEntry) : entryTitle(beforeEntry);
    sections.push({
      label: `${sectionLabel}: ${title}`,
      before: beforeText,
      after: afterText,
    });
  }
  return sections;
}

// Generic diff between any two resume versions — used both for comparing
// arbitrary versions in a lineage (History screen) and could replace the
// narrower diff the mock aiService.adaptResume produces for a single
// AI-generated change, since it's a superset of that case.
export function diffResumeVersions(
  before: ResumeContent,
  after: ResumeContent
): DiffSection[] {
  const sections: DiffSection[] = [];

  const beforeName = before?.fullName ?? "";
  const afterName = after?.fullName ?? "";
  if (beforeName !== afterName) {
    sections.push({ label: "ФИО", before: beforeName, after: afterName });
  }

  const beforeAgeLocation = [before?.age, before?.location].filter(Boolean).join(", ");
  const afterAgeLocation = [after?.age, after?.location].filter(Boolean).join(", ");
  if (beforeAgeLocation !== afterAgeLocation) {
    sections.push({ label: "Возраст и город", before: beforeAgeLocation, after: afterAgeLocation });
  }

  const beforeDesiredPosition = before?.desiredPosition ?? "";
  const afterDesiredPosition = after?.desiredPosition ?? "";
  if (beforeDesiredPosition !== afterDesiredPosition) {
    sections.push({
      label: "Желаемая должность",
      before: beforeDesiredPosition,
      after: afterDesiredPosition,
    });
  }

  const beforeContacts = [before?.contacts?.email, before?.contacts?.phone, before?.contacts?.telegram]
    .filter(Boolean)
    .join(" · ");
  const afterContacts = [after?.contacts?.email, after?.contacts?.phone, after?.contacts?.telegram]
    .filter(Boolean)
    .join(" · ");
  if (beforeContacts !== afterContacts) {
    sections.push({ label: "Контакты", before: beforeContacts, after: afterContacts });
  }

  const beforeSkills = (before?.skills ?? []).join(", ");
  const afterSkills = (after?.skills ?? []).join(", ");
  if (beforeSkills !== afterSkills) {
    sections.push({ label: "Навыки", before: beforeSkills, after: afterSkills });
  }

  sections.push(
    ...diffEntryLists(
      before?.experience ?? [],
      after?.experience ?? [],
      "Опыт",
      experienceLabel,
      (entry) => [entry.company, entry.role].filter(Boolean).join(" — ") || "Опыт работы"
    )
  );

  sections.push(
    ...diffEntryLists(
      before?.education ?? [],
      after?.education ?? [],
      "Образование",
      educationLabel,
      (entry) => entry.institution || "Образование"
    )
  );

  const beforeSummary = before?.summary ?? "";
  const afterSummary = after?.summary ?? "";
  if (beforeSummary !== afterSummary) {
    sections.push({ label: "Обо мне", before: beforeSummary, after: afterSummary });
  }

  return sections;
}
