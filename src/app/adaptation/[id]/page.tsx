import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { AdaptationReviewForm } from "@/components/AdaptationReviewForm";
import type { ResumeFieldsValue } from "@/components/ResumeFieldsForm";

export default async function AdaptationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const adaptation = await db.adaptation.findUnique({
    where: { id },
    include: { resume: true, vacancy: true },
  });

  if (
    !adaptation ||
    adaptation.resume.userId !== user.userId ||
    adaptation.vacancy.userId !== user.userId
  ) {
    notFound();
  }

  const adaptedContent = JSON.parse(adaptation.adaptedContentJson) as Partial<ResumeFieldsValue> | null;
  const { sections, addedKeywords } = JSON.parse(adaptation.diffJson ?? "{}") as {
    sections?: { label: string; before: string; after: string }[];
    addedKeywords?: string[];
  };

  const initialValue: ResumeFieldsValue = {
    fullName: adaptedContent?.fullName ?? "",
    age: adaptedContent?.age ?? "",
    location: adaptedContent?.location ?? "",
    desiredPosition: adaptedContent?.desiredPosition ?? "",
    contacts: {
      email: adaptedContent?.contacts?.email ?? "",
      phone: adaptedContent?.contacts?.phone ?? "",
      telegram: adaptedContent?.contacts?.telegram ?? "",
    },
    experience: adaptedContent?.experience ?? [],
    education: adaptedContent?.education ?? [],
    skills: adaptedContent?.skills ?? [],
    summary: adaptedContent?.summary ?? "",
  };

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader email={user.email} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <BackButton />
        <h1 className="mb-1 text-2xl font-semibold text-brand-dark">Адаптация резюме</h1>
        <p className="mb-6 text-sm text-black/50">{adaptation.resume.title}</p>

        <AdaptationReviewForm
          adaptationId={adaptation.id}
          initialValue={initialValue}
          diffSections={sections ?? []}
          addedKeywords={addedKeywords ?? []}
        />
      </main>
    </div>
  );
}
