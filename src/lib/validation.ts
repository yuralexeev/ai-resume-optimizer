import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Введите корректный email"),
  password: z.string().min(8, "Пароль должен содержать минимум 8 символов"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Введите корректный email"),
  password: z.string().min(1, "Введите пароль"),
});

export const resumeExperienceEntrySchema = z.object({
  company: z.string().trim().min(1),
  role: z.string().trim().min(1),
  period: z.string().trim().min(1),
  description: z.string().trim().optional().default(""),
});

export const resumeEducationEntrySchema = z.object({
  institution: z.string().trim().min(1),
  degree: z.string().trim().min(1),
  period: z.string().trim().min(1),
});

export const resumeFieldsSchema = z.object({
  fullName: z.string().trim().min(1, "Укажите ФИО"),
  age: z.string().trim().optional().default(""),
  location: z.string().trim().optional().default(""),
  desiredPosition: z.string().trim().optional().default(""),
  contacts: z.object({
    email: z.string().trim().email().optional().or(z.literal("")),
    phone: z.string().trim().optional().default(""),
    telegram: z.string().trim().optional().default(""),
  }),
  experience: z.array(resumeExperienceEntrySchema).default([]),
  education: z.array(resumeEducationEntrySchema).default([]),
  skills: z.array(z.string().trim().min(1)).default([]),
  summary: z.string().trim().optional().default(""),
});

export const resumeBuilderSchema = resumeFieldsSchema.extend({
  title: z.string().trim().min(1, "Укажите название резюме"),
  sourceFileUrl: z.string().trim().min(1).optional(),
});

export const vacancySchema = z.discriminatedUnion("sourceType", [
  z.object({
    sourceType: z.literal("text"),
    rawText: z.string().trim().min(1, "Вставьте текст вакансии"),
  }),
  z.object({
    sourceType: z.literal("url"),
    rawText: z.string().trim().min(1, "Текст вакансии не может быть пустым"),
    sourceUrl: z.string().trim().url("Введите корректную ссылку"),
  }),
]);

export const vacancyFetchUrlSchema = z.object({
  url: z.string().trim().url("Введите корректную ссылку"),
});

export const analysisCreateSchema = z.object({
  resumeId: z.string().trim().min(1),
  vacancyId: z.string().trim().min(1),
});

export const adaptationCreateSchema = z.object({
  resumeId: z.string().trim().min(1),
  vacancyId: z.string().trim().min(1),
});

export const adaptationConfirmSchema = resumeFieldsSchema;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Введите текущий пароль"),
  newPassword: z.string().min(8, "Пароль должен содержать минимум 8 символов"),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Введите пароль"),
});

export type ResumeBuilderInput = z.infer<typeof resumeBuilderSchema>;
