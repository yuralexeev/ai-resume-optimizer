import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from "docx";
import type { ResumeContent } from "@/services/aiService";

// Word substitutes fonts automatically for any reader without "Arial"
// installed, so unlike the PDF export there's no need to embed a font file
// for Cyrillic support here.
const FONT = "Arial";

function textParagraph(text: string, spacing?: { after?: number; before?: number }) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT })],
    spacing,
  });
}

export async function renderResumeDocx(
  content: NonNullable<ResumeContent>,
  title: string
): Promise<Buffer> {
  const experience = content.experience ?? [];
  const education = content.education ?? [];
  const skills = content.skills ?? [];
  const ageLocationLine = [content.age, content.location].filter(Boolean).join(", ");
  const contactsLine = [content.contacts?.email, content.contacts?.phone, content.contacts?.telegram]
    .filter(Boolean)
    .join(" · ");

  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: content.fullName || title, font: FONT, bold: true })],
    }),
  ];

  if (ageLocationLine) {
    children.push(textParagraph(ageLocationLine, { after: 40 }));
  }
  if (content.desiredPosition) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: content.desiredPosition, font: FONT, bold: true })],
        spacing: { after: 100 },
      })
    );
  }
  if (contactsLine) {
    children.push(textParagraph(contactsLine, { after: 200 }));
  }

  if (experience.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "Опыт работы", font: FONT })],
      })
    );
    for (const entry of experience) {
      const titleLine = [entry.company, entry.role].filter(Boolean).join(" — ");
      if (titleLine) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: titleLine, font: FONT, bold: true })],
          })
        );
      }
      if (entry.period) {
        children.push(textParagraph(entry.period, { after: 40 }));
      }
      if (entry.description) {
        children.push(textParagraph(entry.description, { after: 200 }));
      }
    }
  }

  if (education.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "Образование", font: FONT })],
      })
    );
    for (const entry of education) {
      const titleLine = [entry.institution, entry.degree].filter(Boolean).join(" — ");
      if (titleLine) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: titleLine, font: FONT, bold: true })],
          })
        );
      }
      if (entry.period) {
        children.push(textParagraph(entry.period, { after: 200 }));
      }
    }
  }

  if (skills.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "Ключевые навыки", font: FONT })],
      })
    );
    for (const skill of skills) {
      children.push(textParagraph(`• ${skill}`, { after: 40 }));
    }
  }

  if (content.summary) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "Обо мне", font: FONT })],
      })
    );
    for (const line of content.summary.split("\n")) {
      if (line.trim()) children.push(textParagraph(line, { after: 40 }));
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
