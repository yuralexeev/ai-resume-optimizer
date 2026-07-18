import type { ResumeContent } from "@/services/aiService";

// Presentational, server-renderable — mirrors the same linear ATS structure
// (name, contacts, experience, education, skills; no tables/columns) that
// src/lib/pdfExport.tsx and src/lib/docxExport.ts produce, so this preview is
// a faithful approximation of what gets downloaded.
export function ResumePreview({
  content,
  title,
}: {
  content: NonNullable<ResumeContent>;
  title: string;
}) {
  const experience = content.experience ?? [];
  const education = content.education ?? [];
  const skills = content.skills ?? [];
  const ageLocationLine = [content.age, content.location].filter(Boolean).join(", ");
  const contactsLine = [content.contacts?.email, content.contacts?.phone, content.contacts?.telegram]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-8 shadow-sm">
      <h2 className="text-xl font-semibold text-brand-dark">{content.fullName || title}</h2>
      {ageLocationLine && <p className="mt-1 text-sm text-black/50">{ageLocationLine}</p>}
      {content.desiredPosition && (
        <p className="mt-1 text-sm font-medium text-brand-mint">{content.desiredPosition}</p>
      )}
      {contactsLine && <p className="mt-1 text-sm text-black/50">{contactsLine}</p>}

      {experience.length > 0 && (
        <section className="mt-6">
          <h3 className="border-b border-black/10 pb-1.5 text-sm font-semibold text-brand-dark">
            Опыт работы
          </h3>
          <div className="mt-3 space-y-4">
            {experience.map((entry, i) => {
              const titleLine = [entry.company, entry.role].filter(Boolean).join(" — ");
              return (
                <div key={i}>
                  {titleLine && <p className="text-sm font-medium text-brand-dark">{titleLine}</p>}
                  {entry.period && <p className="text-xs text-black/50">{entry.period}</p>}
                  {entry.description && (
                    <p className="mt-1 text-sm text-black/70">{entry.description}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {education.length > 0 && (
        <section className="mt-6">
          <h3 className="border-b border-black/10 pb-1.5 text-sm font-semibold text-brand-dark">
            Образование
          </h3>
          <div className="mt-3 space-y-3">
            {education.map((entry, i) => {
              const titleLine = [entry.institution, entry.degree].filter(Boolean).join(" — ");
              return (
                <div key={i}>
                  {titleLine && <p className="text-sm font-medium text-brand-dark">{titleLine}</p>}
                  {entry.period && <p className="text-xs text-black/50">{entry.period}</p>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {skills.length > 0 && (
        <section className="mt-6">
          <h3 className="border-b border-black/10 pb-1.5 text-sm font-semibold text-brand-dark">
            Ключевые навыки
          </h3>
          <ul className="mt-3 space-y-1 text-sm text-black/70">
            {skills.map((skill, i) => (
              <li key={i}>• {skill}</li>
            ))}
          </ul>
        </section>
      )}

      {content.summary && (
        <section className="mt-6">
          <h3 className="border-b border-black/10 pb-1.5 text-sm font-semibold text-brand-dark">
            Обо мне
          </h3>
          <p className="mt-3 whitespace-pre-line text-sm text-black/70">{content.summary}</p>
        </section>
      )}
    </div>
  );
}
